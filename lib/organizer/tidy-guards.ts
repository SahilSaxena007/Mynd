import { hasDroppedContent } from "./content-coverage";
import { unverifiedNumbers } from "./numbers";

export type TidyOperation = { note: string; absorbs: string[]; title: string; summary: string; body: string };
type Text = Pick<TidyOperation, "title" | "summary" | "body">;

function tasks(bodies: string[]) {
  return new Set(bodies.flatMap((body) => body.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/);
    return match ? [`${match[1].toLowerCase()}:${match[2].normalize("NFC").replace(/\s+/g, " ").trim()}`] : [];
  })));
}

export function tidyGuard(old: { title: string; summary: string | null; body: string }[], next: Text): string[] {
  const errors: string[] = [];
  const written = `${next.title}\n${next.summary}\n${next.body}`;
  if (old.some((note) => hasDroppedContent(note.body, written, "", { coverage: 0.85, consecutive: 2 }))) errors.push("G1 content");
  const before = tasks(old.map((note) => note.body));
  const after = tasks([next.body]);
  if (before.size !== after.size || [...before].some((task) => !after.has(task))) errors.push("G2 tasks");
  if (unverifiedNumbers(written, old.map((note) => `${note.title}\n${note.summary ?? ""}\n${note.body}`).join("\n")).length) errors.push("G3 numbers");
  return errors;
}
