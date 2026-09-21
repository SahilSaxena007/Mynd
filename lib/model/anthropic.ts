import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput } from "./index";
import { ModelProviderError } from "./errors";
import { routeParameters, samplingParameters } from "./capabilities";

export function anthropicUsage(usage: {
  input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number | null } | null;
}) {
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    cachedTokens: usage.cache_read_input_tokens ?? 0,
    thinkingTokens: usage.output_tokens_details?.thinking_tokens ?? 0 };
}

// Pure request builder; configuration is explicit so checks need no API or env.
export function buildAnthropicRequest(input: CompleteInput, model: string, routeBudget?: string) {
  const parameters = input.job === "route"
    ? routeParameters(model, input.maxTokens, routeBudget) : samplingParameters(model, input.job);
  return {
    model,
    ...parameters,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: "user" as const, content: input.user }],
    output_config: { format: { type: "json_schema" as const, schema: { ...input.schema } } },
  };
}

// Internal adapter: only index.ts calls this, after the spend guard.
export async function requestAnthropic(input: CompleteInput, model: string) {
  try {
    const request = buildAnthropicRequest(input, model, process.env.ROUTE_THINKING_BUDGET);
    const client = new Anthropic({ maxRetries: 0 });
    const response = await client.messages.create(request);
    return {
      text: response.content.filter((block) => block.type === "text").map((block) => block.text).join(""),
      stopReason: response.stop_reason,
      usage: anthropicUsage(response.usage),
    };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      const body = error.error;
      const detail = body && "error" in body ? body.error : body;
      const message = detail && typeof detail === "object" && "message" in detail
        && typeof detail.message === "string" ? detail.message : error.message;
      throw new ModelProviderError(error.status, error.type ?? "api_error", message);
    }
    throw error;
  }
}
