import Ajv from "ajv";
import { assertOutsideTransaction } from "../db/transaction";
import { withModelCallLock } from "../db/model-call-lock";
import { insertModelCall } from "../db/queries";
import { requestAnthropic } from "./anthropic";
import { estimateCost } from "./cost";
import { checkModelBudget, guardModelCall, stopModelRun } from "./guard";

export { withModelRun } from "./guard";
export type Job = "split" | "route" | "answer" | "grader";
export type CompleteInput = {
  job: Job; system: string; user: string; schema: object; maxTokens: number;
};
export type CompleteResult<T> = {
  data: T;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
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
    const validate = new Ajv({ strict: true }).compile<T>(input.schema);
    return await withModelCallLock(async () => {
      await guardModelCall(input.maxTokens);
      const response = await requestAnthropic(input, model);
      await insertModelCall({ job: input.job, model, ...response.usage,
        estCostUsd: estimateCost(model, response.usage) });
      // Log billable responses even when a refusal/truncation cannot be used.
      if (response.stopReason !== "end_turn") throw new Error("Model response incomplete or refused.");
      const data: unknown = JSON.parse(response.text);
      if (!validate(data)) throw new Error("Model response did not match the output schema.");
      return { data, usage: response.usage, model };
    });
  } catch (error) {
    stopModelRun();
    throw error;
  }
}
