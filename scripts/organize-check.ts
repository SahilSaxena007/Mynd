import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { createFolder, createNote, getNote, getNotesWithBodies, getPendingCaptures, insertCapture, listOpenQuickCalls } from "../lib/db/queries";
import { injectOrganizeFailure, organizeRowCounts, withOrganizeCheckSchema } from "../lib/db/organize-check-support";
import type { Capture, Folder, Note, QuickCallOption } from "../lib/db/types";
import { resolveCoverage } from "../lib/organizer/coverage";
import { buildRefs, localDate } from "../lib/organizer/refs";
import type { Placement, RoutePlan } from "../lib/organizer/route-types";
import { applyPlan } from "../lib/organizer/stage3-apply";

const date = new Date("2026-07-15T22:30:00Z");
const capture: Capture = { id: "capture", body: "buy milk", kind: "text", capturedAt: date,
  device: null, status: "pending", processedAt: null, createdAt: date };
const folder: Folder = { id: "folder", slug: "personal", name: "Personal", description: null,
  color: null, parentId: null, createdAt: date };
const note: Note = { id: "note", folderId: folder.id, title: "things to buy", summary: null,
  body: "- [ ] bread", createdAt: date, updatedAt: date };
const item = { topic: "things to buy", quotes: ["buy milk"], unassigned: false };
const refs = buildRefs([capture], [folder], [note], [], [[item]], "Europe/London");
const sure: Placement = { item: "I1", confidence: "sure", note: "N1", markdown: "- [ ] milk", options: [] };
const empty: RoutePlan = { new_notes: [], placements: [] };
let passed = 0;
function pass(label: string) { console.log(`PASS ${++passed}: ${label}`); }

async function main() {
  loadEnvConfig(process.cwd());
  // This entry point never imports the model layer. A missing key also prevents accidental requests.
  process.env.ANTHROPIC_API_KEY = "";
  try {
    let result = resolveCoverage(refs, empty);
    assert.equal(result.queued[0].reason, "not_placed");
    assert.equal(result.filed.length + result.queued.length, refs.items.length);
    pass("missing item queued, coverage exact");

    result = resolveCoverage(refs, { ...empty, placements: [sure, { ...sure, markdown: "duplicate" }] });
    assert.equal(result.filed.length, 1);
    assert.equal(result.filed[0].markdown, sure.markdown);
    result = resolveCoverage(refs, { ...empty, placements: [{ ...sure, confidence: "unsure" }, sure] });
    assert.equal(result.filed.length, 0);
    assert.equal(result.queued[0].reason, "unsure");
    pass("first duplicate wins, including unsure first");

    for (const target of ["N999", "X1", "X999"]) {
      result = resolveCoverage(refs, { new_notes: [{ ref: target, folder: target === "X999" ? "personal" : "unknown", title: "test", summary: "" }],
        placements: [{ ...sure, note: target }] });
      assert.equal(result.filed.length, 0);
      assert.equal(result.queued[0].reason, "invalid_target");
    }
    assert.equal(resolveCoverage(refs, { ...empty, placements: [{ ...sure, markdown: " " }] }).queued[0].reason, "invalid_target");
    pass("unknown folders/notes and unissued new refs demoted");

    result = resolveCoverage(refs, { ...empty, placements: [{ ...sure, item: "I999" }, sure] });
    assert.equal(result.filed.length, 1);
    assert.equal(result.queued.length, 0);
    pass("unissued item reference ignored");

    const option: QuickCallOption = { label: "Buy", folder: "personal", note: "N1", new_note_title: "", new_folder_name: "" };
    result = resolveCoverage(refs, { ...empty, placements: [{ ...sure, confidence: "unsure", options: [
      { ...option, folder: "unknown" }, { ...option, note: "N999" },
      option, { ...option, note: "", folder: "", new_folder_name: "Travel" }, option, option,
    ] }] });
    assert.equal(result.queued[0].options.length, 3);
    assert.equal(result.queued[0].options[0].note, note.id);
    assert.equal(result.queued[0].options[1].new_folder_name, "Travel");
    pass("invalid options dropped, three retained, persisted note references resolved");

    result = resolveCoverage(refs, { new_notes: [{ ref: "X1", folder: "personal", title: "unused", summary: "" }], placements: [sure] });
    assert.deepEqual(result.newNotes, []);
    pass("unused new note declaration removed");

    await withOrganizeCheckSchema(async () => {
      const first = await insertCapture({ body: "buy milk", capturedAt: date });
      const second = await insertCapture({ body: "buy eggs", capturedAt: date });
      const area = await createFolder({ name: "Personal", slug: "personal" });
      const existing = await createNote({ folderId: area.id, title: "existing", summary: "original summary", body: "original bytes" });
      const missing = { ...existing, id: randomUUID() };
      const run = buildRefs([first, second], [area], [existing, missing], [],
        [[item, item], [item, item, item]], "Europe/London");
      const planned = resolveCoverage(run, { new_notes: [{ ref: "X1", folder: "personal", title: "new", summary: "new summary" }],
        placements: [{ ...sure, item: "I1", note: "X1", markdown: "first block" },
          { ...sure, item: "I2", note: "N1", markdown: "appended block" },
          { ...sure, item: "I3", note: "X1", markdown: "second block" },
          { ...sure, item: "I4", note: "N2" }] });
      const applied = await applyPlan(run, planned);
      assert.equal(applied.queued.find((call) => call.item === "I4")?.reason, "invalid_target");
      assert.equal(applied.filed.length + applied.queued.length, run.items.length);
      const appended = await getNote(existing.id);
      assert.equal(appended?.body, "original bytes\nappended block");
      assert.equal(appended?.title, existing.title);
      assert.equal(appended?.summary, existing.summary);
      const created = (await getNotesWithBodies()).find((entry) => entry.id !== existing.id);
      assert.equal(created?.body, "first block\n\nsecond block");
      assert.deepEqual(await organizeRowCounts(), { notes: 2, sources: 3, calls: 2, modelCalls: 0 });
      assert.deepEqual(await getPendingCaptures(), []);
    });
    await withOrganizeCheckSchema(async () => {
      const stored = await insertCapture({ body: "buy milk. not placed", capturedAt: date });
      const area = await createFolder({ name: "Personal", slug: "personal" });
      const run = buildRefs([stored], [area], [], [], [[item, { ...item, quotes: ["not placed"] }]], "Europe/London");
      const resolved = resolveCoverage(run, { new_notes: [{ ref: "X1", folder: "personal", title: "things to buy", summary: "shopping" }],
        placements: [{ ...sure, note: "X1" }] });
      await injectOrganizeFailure();
      await assert.rejects(applyPlan(run, resolved), /injected organize failure/);
      assert.deepEqual(await organizeRowCounts(), { notes: 0, sources: 0, calls: 0, modelCalls: 0 });
      assert.deepEqual(await getNotesWithBodies(), []);
      assert.deepEqual(await listOpenQuickCalls(), []);
      assert.deepEqual(await getPendingCaptures(), [stored]);
    });
    pass("apply transaction rolls back every write; captures pending; isolated schema removed");

    assert.equal(localDate(date, "Europe/London"), "2026-07-15");
    assert.equal(localDate(new Date("2026-07-15T23:30:00Z"), "Europe/London"), "2026-07-16");
    assert.throws(() => localDate(date, undefined), /USER_TIMEZONE/);
    assert.throws(() => localDate(date, "not/a-zone"), RangeError);
    pass("London summer dates, including midnight boundary; timezone fails closed");

    for (const file of await readdir(join(process.cwd(), "lib/organizer"))) {
      if (file.endsWith(".ts")) assert.ok(!(await readFile(join(process.cwd(), "lib/organizer", file), "utf8")).includes("createFolder"), file);
    }
    console.log("8/8 cases passed; no organizer folder creation; zero model calls.");
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally { await closeDb(); }
}
void main();
