import type { QuickCallInput, QuickCallOption } from "../db/types";
import type { RunItem, RunRefs } from "./refs";
import type { NewNote, Placement, RoutePlan } from "./route-types";

export type ResolvedPlan = {
  newNotes: NewNote[];
  filed: { item: RunItem; note: string; markdown: string }[];
  queued: (QuickCallInput & { item: string })[];
};

function validOption(option: QuickCallOption, refs: RunRefs): boolean {
  if (option.folder && !refs.folders.has(option.folder)) return false;
  if (option.note) {
    const note = refs.notes.get(option.note);
    if (!note || (option.folder && refs.folders.get(option.folder)?.id !== note.folderId)) return false;
  }
  if (option.new_folder_name) return !option.folder && !option.note;
  return !!option.folder;
}

export function resolveCoverage(refs: RunRefs, plan: RoutePlan): ResolvedPlan {
  const declarations = new Map<string, NewNote>();
  for (const note of plan.new_notes) {
    if (refs.newNoteRefs.has(note.ref) && !declarations.has(note.ref)) declarations.set(note.ref, note);
  }
  const placements = new Map<string, Placement>();
  const issuedItems = new Set(refs.items.map((item) => item.ref));
  for (const placement of plan.placements) {
    if (issuedItems.has(placement.item) && !placements.has(placement.item)) placements.set(placement.item, placement);
  }
  const result: ResolvedPlan = { newNotes: [], filed: [], queued: [] };
  for (const item of refs.items) {
    const placement = placements.get(item.ref);
    const existing = placement && refs.notes.get(placement.note);
    const declared = placement && declarations.get(placement.note);
    const validTarget = (existing && [...refs.folders.values()].some((folder) => folder.id === existing.folderId))
      || (declared && refs.folders.has(declared.folder));
    if (placement?.confidence === "sure" && placement.markdown.trim() && validTarget) {
      result.filed.push({ item, note: placement.note, markdown: placement.markdown });
    } else {
      result.queued.push({ item: item.ref, captureId: item.captureId, topic: item.topic, itemText: item.text,
        reason: !placement ? "not_placed" : placement.confidence === "unsure" ? "unsure" : "invalid_target",
        options: (placement?.options ?? []).filter((option) => validOption(option, refs)).slice(0, 3)
          .map((option) => ({ ...option, note: option.note ? refs.notes.get(option.note)!.id : "" })),
      });
    }
  }
  result.newNotes = [...declarations.values()].filter((note) => result.filed.some((entry) => entry.note === note.ref));
  const accounted = [...result.filed.map((entry) => entry.item.ref), ...result.queued.map((entry) => entry.item)];
  if (result.filed.length + result.queued.length !== refs.items.length || new Set(accounted).size !== refs.items.length) {
    throw new Error("Coverage invariant failed: filed + queued must equal items exactly once.");
  }
  return result;
}
