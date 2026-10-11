import assert from "node:assert/strict";
import { withDatabase } from "../lib/db/client";
import { tidyCheckDatabase } from "../lib/db/tidy-check-support";
import { applyTidy } from "../lib/db/tidy";
import { changeNoteState, latestVersion } from "../lib/db/note-versions";
import { getEditableNotes, getNotesWithBodies, getNoteSummaries, getVault, getNote, type EditableNote } from "../lib/db/queries";
import { tidyGuard } from "../lib/organizer/tidy-guards";
import { checkTidyStage } from "./tidy-stage-check";
import { checkNoteVersionApi } from "./note-version-api-check";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  globalThis.fetch = async () => { throw new Error("No network in tidy checks"); };
  const a: EditableNote = { id: "a", folderId: "f", title: "Shopping", summary: "Shopping items", body: "## Groceries\n- [ ] Buy milk\n## Hardware\n- [x] Buy screws",
    createdAt: new Date(), updatedAt: "2026-10-11T12:00:00.000001Z", archivedAt: null, archivedInto: null };
  const b = { ...a, id: "b", body: "- [ ] Buy bread" };
  const op = { note: "a", absorbs: [] as string[], title: a.title, summary: a.summary!, body: "## Hardware\n- [x] Buy screws\n## Groceries\n- [ ] Buy milk" };
  assert.deepEqual(tidyGuard([a], op), []);
  assert.ok(tidyGuard([a], { ...op, body: "## Hardware\n- [x] Buy screws" }).includes("G1 content"));
  assert.ok(tidyGuard([a], { ...op, body: op.body.replace("- [ ] Buy milk", "Buy milk") }).includes("G2 tasks"));
  assert.ok(tidyGuard([a], { ...op, body: op.body.replace("[x]", "[ ]") }).includes("G2 tasks"));
  assert.ok(tidyGuard([a], { ...op, summary: "Shopping items 99" }).includes("G3 numbers"));
  assert.deepEqual(tidyGuard([{ ...a, body: a.body + "\n- [ ] Buy milk" }], op), []);
  const twenty = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quartz romeo sierra tango".split(" ");
  assert.deepEqual(tidyGuard([{ ...a, body: twenty.join(" ") }], { title: "", summary: "", body: twenty.slice(0, 17).join(" ") }), []);
  assert.ok(tidyGuard([{ ...a, body: twenty.join(" ") }], { title: "", summary: "", body: twenty.slice(0, 16).join(" ") }).includes("G1 content"));
  assert.ok(tidyGuard([a, b], op).includes("G1 content"), "every absorbed body is checked separately");
  assert.ok(tidyGuard([{ ...a, body: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa. zebra. quartz." }],
    { title: "", summary: "", body: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa." }).includes("G1 content"));
  console.log("PASS tidy G1-G3: reorder, section loss, checkbox loss/state, new number, exact duplicates, two-sentence gap");
  const merge = { ...op, absorbs: ["b"], body: op.body + "\n" + b.body };
  const db = tidyCheckDatabase([a, b]);
  await withDatabase(db.pool, async () => {
    assert.deepEqual(await applyTidy(merge, [a, b]), []);
    assert.equal(db.state.versions.length, 2);
    assert.deepEqual(db.state.versions.map((v) => v.reason), ["tidy", "merge"]);
    assert.equal(db.state.notes[1].body, b.body);
    assert.equal(db.state.notes[1].archivedInto, "a");
    assert.ok(db.state.sources.some((s) => s.noteId === "a" && s.captureId === "b"));
    assert.ok(db.state.sources.some((s) => s.noteId === "b" && s.captureId === "b"));
    for (const notes of [(await getVault()).notes, await getNotesWithBodies(), await getEditableNotes(), await getNoteSummaries()]) {
      assert.deepEqual(notes.map((note) => note.id), ["a"]);
    }
    assert.ok((await getNote("b", true))?.archivedAt);
    const before = structuredClone(db.state);
    assert.deepEqual(await applyTidy(merge, [a, b]), ["G4 changed"]);
    assert.deepEqual(db.state, before);
    const old = await latestVersion("a");
    assert.equal((await changeNoteState("a", a.updatedAt, "restore", old!.id)).status, 409);
    assert.equal((await changeNoteState("a", db.state.notes[0].updatedAt, "restore", old!.id)).status, 200);
    assert.equal(db.state.notes[0].body, a.body);
    assert.equal(db.state.versions.at(-1)!.body, merge.body);
    assert.equal((await changeNoteState("b", db.state.notes[1].updatedAt, "unarchive")).status, 200);
    assert.equal(db.state.notes[1].archivedAt, null);
    assert.equal(db.state.notes[0].body, a.body);
    assert.equal((await changeNoteState("a", db.state.notes[0].updatedAt, "archive")).status, 200);
    assert.deepEqual((await getEditableNotes()).map((n) => n.id), ["b"]);
  });
  const edited = tidyCheckDatabase([{ ...a, updatedAt: "2026-10-11T12:00:00.000002Z" }, b]);
  await withDatabase(edited.pool, async () => {
    assert.deepEqual(await applyTidy(merge, [a, b]), ["G4 changed"]);
    assert.equal(edited.state.versions.length, 0);
  });
  for (const prefix of ["UPDATE notes", "INSERT INTO note_sources"]) {
    const rollback = tidyCheckDatabase([a, b]);
    await withDatabase(rollback.pool, async () => {
      const before = structuredClone(rollback.state);
      rollback.failNext(prefix);
      await assert.rejects(applyTidy(merge, [a, b]), /Injected failure/);
      assert.deepEqual(rollback.state, before);
    });
  }
  console.log("PASS tidy transaction: versions first, merge archive, source union, concurrent edit skip, rollback, active reads, URL access, restore and archive");
  await checkTidyStage(a);
  await checkNoteVersionApi(a);
  async function noDeletes(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await noDeletes(path);
      else if (/\.(ts|tsx|sql)$/.test(path)) {
        assert.doesNotMatch(await readFile(path, "utf8"), /\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:notes|note_versions)\b/i, path);
      }
    }
  }
  for (const directory of ["lib", "app", "jobs", "scripts"]) await noDeletes(directory);
  console.log("PASS no note/version deletion statements in application or scripts");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
