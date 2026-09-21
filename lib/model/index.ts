import Ajv from "ajv";
import { assertOutsideTransaction } from "../db/transaction";
import { withModelCallLock } from "../db/model-call-lock";
import { insertModelCall } from "../db/queries";
import { buildAnthropicRequest, requestAnthropic } from "./anthropic";
import { estimateCost } from "./cost";
import { allowRouteTruncationRetry, checkModelBudget, guardModelCall, recordModelCost, stopModelRun } from "./guard";
import { ModelTruncationError } from "./errors";

export { withModelRun } from "./guard";
export { buildAnthropicRequest } from "./anthropic";
export type Job = "split" | "route" | "answer" | "grader";
export type CompleteInput = {
  job: Job; system: string; user: string; schema: object; maxTokens: number;
};
export type CompleteResult<T> = {
  data: T;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; thinkingTokens: number };
  model: string;
};

const modelEnv: Record<Job, string> = {
  split: "ORGANIZE_MODEL", route: "ORGANIZE_MODEL", answer: "ANSWER_MODEL", grader: "GRADER_MODEL",
};

export async function complete<T>(input: CompleteInput): Promise<CompleteResult<T>> {
  try {
    assertOutsideTransaction();
    checkModelBudget(input.maxTokens);
    if (process.env.MODEL_PROVIDER !== "anthropic") throw new Error("MODEL_PROVIDER must be anthropic.");
    const model = (input.job === "route" ? process.env.ROUTE_MODEL?.trim() : undefined)
      || process.env[modelEnv[input.job]]?.trim();
    if (!model) throw new Error("Model environment setting is required.");
    // Validate configuration and schema before any request can cost money.
    estimateCost(model, { inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
    buildAnthropicRequest(input, model, process.env.ROUTE_THINKING_BUDGET);
    const validate = new Ajv({ strict: true }).compile<T>(input.schema);
    return await withModelCallLock(async () => {
      await guardModelCall(input.maxTokens);
      const response = await requestAnthropic(input, model);
      const costUsd = estimateCost(model, response.usage);
      recordModelCost(costUsd);
      await insertModelCall({ job: input.job, model, ...response.usage,
        estCostUsd: costUsd });
      // Log billable responses even when a refusal/truncation cannot be used.
      if (response.stopReason === "max_tokens") throw new ModelTruncationError(model, response.usage);
      if (response.stopReason !== "end_turn") throw new Error(`Model response incomplete or refused (stop_reason: ${response.stopReason}).`);
      const data: unknown = JSON.parse(response.text);
      if (!validate(data)) throw new Error("Model response did not match the output schema.");
      return { data, usage: response.usage, model };
    });
  } catch (error) {
    if (!(error instanceof ModelTruncationError && input.job === "route" && allowRouteTruncationRetry())) stopModelRun();
    throw error;
  }
}
