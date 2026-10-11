import Ajv from "ajv";
import type { TidyOperation } from "./tidy-guards";

export type TidyPlan = { operations: TidyOperation[] };
const text = { type: "string", minLength: 1, pattern: "\\S" };
export const tidySchema = {
  type: "object", additionalProperties: false, required: ["operations"], properties: {
    operations: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["note", "absorbs", "title", "summary", "body"], properties: {
        // No uniqueItems: the provider rejects it; stage 4 rejects repeated references in code.
        note: text, absorbs: { type: "array", items: text }, title: text,
        summary: { ...text, pattern: "^[^\\r\\n]*\\S[^\\r\\n]*$" }, body: text,
      } } },
  },
};
export const validateTidy = new Ajv({ strict: true }).compile<TidyPlan>(tidySchema);
