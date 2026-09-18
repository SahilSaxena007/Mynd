import type { Capture } from "../db/types";
import { complete } from "../model";
import { splitPrompt } from "../prompts/split";

import { completeSplit, type ModelSplitItem } from "./split-coverage";
export type { SplitItem } from "./split-coverage";
export const splitSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["topic", "quotes"],
      properties: { topic: { type: "string" }, quotes: { type: "array", items: { type: "string" } } },
    } },
  },
};

export async function splitCapture(capture: Capture) {
  const result = await complete<{ items: ModelSplitItem[] }>({
    job: "split", system: splitPrompt, user: capture.body,
    schema: splitSchema, maxTokens: 8000,
  });
  return { ...result, data: completeSplit(capture.body, result.data.items) };
}
