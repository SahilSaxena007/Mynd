import type { Capture } from "../db/types";
import { complete } from "../model";
import { splitPrompt } from "../prompts/split";

export type SplitItem = { text: string; topic: string };
export const splitSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["text", "topic"],
      properties: { text: { type: "string" }, topic: { type: "string" } },
    } },
  },
};

export function splitCapture(capture: Capture) {
  return complete<{ items: SplitItem[] }>({
    job: "split", system: splitPrompt, user: capture.body,
    schema: splitSchema, maxTokens: 8000,
  });
}
