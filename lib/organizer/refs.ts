import type { Capture, Folder, Note, Rule } from "../db/types";
import type { SplitItem } from "./split-coverage";

export type RunItem = SplitItem & { ref: string; captureId: string; capture: string; date: string; text: string };
export type RunRefs = {
  folders: Map<string, Folder>; notes: Map<string, Note>; items: RunItem[];
  newNoteRefs: Set<string>; captures: Capture[]; rules: Rule[];
};

export function localDate(date: Date, timezone: string | undefined): string {
  if (!timezone?.trim()) throw new Error("USER_TIMEZONE is required.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((entry) => entry.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function buildRefs(captures: Capture[], folders: Folder[], notes: Note[], rules: Rule[],
  splits: SplitItem[][], timezone: string | undefined): RunRefs {
  const items: RunItem[] = [];
  captures.forEach((capture, index) => {
    const date = localDate(capture.capturedAt, timezone);
    for (const item of splits[index]) items.push({ ...item, ref: `I${items.length + 1}`,
      captureId: capture.id, capture: `C${index + 1}`, date, text: item.quotes.join("\n") });
  });
  return { captures, rules, items, folders: new Map(folders.map((folder) => [folder.slug, folder])),
    notes: new Map(notes.map((note, index) => [`N${index + 1}`, note])),
    newNoteRefs: new Set(items.map((_, index) => `X${index + 1}`)) };
}

export function routeInput(refs: RunRefs) {
  const folderSlug = (id: string) => [...refs.folders.values()].find((folder) => folder.id === id)?.slug;
  return {
    folders: [...refs.folders.values()].map(({ slug, name, description }) => ({ slug, name, description })),
    notes: [...refs.notes].map(([ref, note]) => ({ ref, folder: folderSlug(note.folderId),
      title: note.title, summary: note.summary, body: note.body })),
    rules: refs.rules.map((rule) => rule.instruction),
    items: refs.items.map(({ ref, topic, text, unassigned, capture, date }) =>
      ({ ref, topic, text, unassigned, capture, date })),
    available_new_note_refs: [...refs.newNoteRefs],
  };
}
