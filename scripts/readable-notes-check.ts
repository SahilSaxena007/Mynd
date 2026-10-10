import assert from "node:assert/strict";
import { assertPreservedBody, insertNoteBlock, newNoteBody } from "../lib/organizer/note-body";

export function checkReadableNotes(pass: (label: string) => void) {
  const old = "intro\n## To buy\n- bread\n## Ideas\n- garden";
  const inserted = insertNoteBlock(old, "To buy", "- milk");
  assert.equal(inserted.newBody, "intro\n## To buy\n- bread\n- milk\n\n## Ideas\n- garden");
  assertPreservedBody(old, inserted);
  pass("existing section inserts before the next heading");
  assert.equal(insertNoteBlock(old, "Ideas", "- pond").newBody, `${old}\n- pond`);
  pass("last section inserts at the end");
  assert.equal(insertNoteBlock(old, "Open questions", "- when").newBody, `${old}\n\n## Open questions\n- when`);
  pass("missing section creates a heading");
  assert.equal(insertNoteBlock(old, "", "- milk").newBody, `${old}\n- milk`);
  pass("empty section retains end-append behavior");
  assert.throws(() => assertPreservedBody(old, { ...inserted, newBody: inserted.newBody.replace("bread", "toast") }), /byte-preservation/);
  pass("corrupted insertion fails byte preservation");
  const mixed = "preface\r\n  ## To buy  \r\n- bread\r\n### Detail\nkeep\r\n## Ideas\nend";
  const mixedResult = insertNoteBlock(mixed, " To buy ", "- milk");
  assertPreservedBody(mixed, mixedResult);
  assert.ok(mixedResult.newBody.includes("keep\r\n- milk\n\n## Ideas"));
  assert.ok(insertNoteBlock(old, "to buy", "- milk").newBody.endsWith("## to buy\n- milk"));
  pass("trimmed exact headings, subheadings and mixed line endings preserve old bytes");
  assert.equal(newNoteBody([
    { section: "Ideas", markdown: "- garden" }, { section: "To buy", markdown: "- milk" },
    { section: "", markdown: "intro" }, { section: "Ideas", markdown: "- pond" },
    { section: "", markdown: "more" },
  ]), "intro\n\nmore\n\n## Ideas\n- garden\n\n- pond\n\n## To buy\n- milk");
  pass("new note groups blocks by section, no-section first, then first-seen order");
}
