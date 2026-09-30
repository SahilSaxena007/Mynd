export type BodyInsertion = { newBody: string; at: number; inserted: string };

export function assertPreservedBody(oldBody: string, { newBody, at, inserted }: BodyInsertion): void {
  if (!Number.isInteger(at) || at < 0 || at > oldBody.length
    || newBody.slice(at, at + inserted.length) !== inserted
    || newBody.slice(0, at) + newBody.slice(at + inserted.length) !== oldBody) {
    throw new Error("Note insertion failed byte-preservation assertion.");
  }
}

export function insertNoteBlock(oldBody: string, section: string, block: string): BodyInsertion {
  section = section.trim();
  if (/[\r\n]/.test(section)) throw new Error("Section must be a single heading.");
  let at = oldBody.length;
  let inserted = `\n${block}`;
  if (section) {
    const lines = [...oldBody.matchAll(/[^\r\n]+|\r\n|\n|\r/g)];
    let found = false;
    for (const line of lines) {
      if (found && line[0].startsWith("## ")) { at = line.index; break; }
      if (line[0].trim() === `## ${section}`) found = true;
    }
    inserted = found
      ? `${oldBody.slice(0, at).endsWith("\n") ? "" : "\n"}${block}${at < oldBody.length ? "\n\n" : ""}`
      : `\n\n## ${section}\n${block}`;
  }
  const result = { newBody: oldBody.slice(0, at) + inserted + oldBody.slice(at), at, inserted };
  assertPreservedBody(oldBody, result);
  return result;
}

export function newNoteBody(entries: { section: string; markdown: string }[]): string {
  const groups = new Map<string, string[]>([["", []]]);
  for (const entry of entries) {
    const section = entry.section.trim();
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section)!.push(entry.markdown);
  }
  return [...groups].filter(([, blocks]) => blocks.length)
    .map(([section, blocks]) => `${section ? `## ${section}\n` : ""}${blocks.join("\n\n")}`).join("\n\n");
}
