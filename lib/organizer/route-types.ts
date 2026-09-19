import type { QuickCallOption } from "../db/types";

export type NewNote = { ref: string; folder: string; title: string; summary: string };
export type Placement = {
  item: string; confidence: "sure" | "unsure"; note: string; markdown: string; options: QuickCallOption[];
};
export type RoutePlan = { new_notes: NewNote[]; placements: Placement[] };

const strings = (names: string[]) => Object.fromEntries(names.map((name) => [name, { type: "string" }]));
const object = (properties: Record<string, object>) => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});
export const routeSchema = object({
  new_notes: { type: "array", items: object(strings(["ref", "folder", "title", "summary"])) },
  placements: { type: "array", items: object({
    ...strings(["item", "note", "markdown"]), confidence: { type: "string", enum: ["sure", "unsure"] },
    options: { type: "array", items: object(strings(["label", "folder", "note", "new_note_title", "new_folder_name"])) },
  }) },
});
