import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput } from "./index";

// Internal adapter: only index.ts calls this, after the spend guard.
export async function requestAnthropic(input: CompleteInput, model: string) {
  const client = new Anthropic({ maxRetries: 0 });
  const response = await client.messages.create({
    model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
    output_config: { format: { type: "json_schema", schema: { ...input.schema } } },
  });
  return {
    text: response.content.filter((block) => block.type === "text").map((block) => block.text).join(""),
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
