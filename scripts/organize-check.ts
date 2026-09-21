import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { createFolder, createNote, getNote, getNotesWithBodies, getPendingCaptures, insertCapture, listOpenQuickCalls, markCaptureProcessed, skipCaptures } from "../lib/db/queries";
import { injectOrganizeFailure, organizeRowCounts, withOrganizeCheckSchema } from "../lib/db/organize-check-support";
import type { Capture, Folder, Note, QuickCallOption } from "../lib/db/types";
import { resolveCoverage } from "../lib/organizer/coverage";
import { buildRefs, localDate } from "../lib/organizer/refs";
import type { Placement, RoutePlan } from "../lib/organizer/route-types";
import { applyPlan } from "../lib/organizer/stage3-apply";
import { applySavedRun, savedPlan } from "../lib/organizer";
import { samplingParameters } from "../lib/model/capabilities";
import { buildAnthropicRequest } from "../lib/model";
import { unverifiedNumbers } from "../lib/organizer/numbers";
import { printPlan } from "../lib/organizer/print";
import { formatPreviewError } from "../lib/model/errors";
import { checkOrganizeRuns } from "./organize-run-check";
import { checkOrganizeRetry } from "./organize-retry-check";

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
  // No test invokes the provider. Block HTTP as an additional regression tripwire.
  process.env.ANTHROPIC_API_KEY = "";
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("HTTP is forbidden in organize:check"); };
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

    const numberRefs = (texts: string[], slug = "work") => buildRefs(
      [{ ...capture, body: texts.join("\n") }], [{ ...folder, slug }], [], [],
      [texts.map((text) => ({ ...item, quotes: [text] }))], "Europe/London");
    const numberPlan = (markdown: string, title = "Meeting", summary = "", slug = "work"): RoutePlan => ({
      new_notes: [{ ref: "X1", folder: slug, title, summary }],
      placements: [{ ...sure, note: "X1", markdown }],
    });
    result = resolveCoverage(numberRefs(["on the 12th"]), numberPlan("2026-09-12"));
    assert.equal(result.queued[0].reason, "added_detail");
    assert.deepEqual(result.queued[0].unverifiedNumbers, ["2026", "9"]);
    assert.equal(result.filed.length, 0);
    assert.equal(result.newNotes.length, 0);
    const printed: string[] = [];
    const previousLog = console.log;
    try {
      console.log = (message: string) => { printed.push(message); };
      printPlan(numberRefs(["on the 12th"]), result, true, 0, 0);
    } finally { console.log = previousLog; }
    assert.ok(printed.some((line) => line.includes("Unverified numbers: 2026, 9")));
    assert.ok(printed.some((line) => line.includes("added_detail 1")));
    pass("invented full date queues added_detail with unverified numbers");

    for (const markdown of ["the 12th", "12"]) {
      result = resolveCoverage(numberRefs(["on the 12th"]), numberPlan(markdown));
      assert.equal(result.filed.length, 1);
      assert.equal(result.queued.length, 0);
    }
    assert.deepEqual(unverifiedNumbers("12", "twelfth"), ["12"]);
    assert.deepEqual(unverifiedNumbers("123456789012345678901", "123456789012345678900"), ["123456789012345678901"]);
    pass("said numbers file; words and distinct large digit runs do not match");

    for (const markdown of ["at 9", "09"]) {
      assert.equal(resolveCoverage(numberRefs(["at 9"]), numberPlan(markdown)).filed.length, 1);
    }
    result = resolveCoverage(numberRefs(["at 9"]), numberPlan("09:00"));
    assert.equal(result.queued[0].reason, "added_detail");
    assert.deepEqual(result.queued[0].unverifiedNumbers, ["0"]);
    assert.deepEqual(unverifiedNumbers("09:00", "9 0"), []);
    pass("leading zeros normalize independently; unsaid zero minutes queue");

    const journal = numberRefs(["a good day"], "journal");
    const ownDate = journal.items[0].date;
    result = resolveCoverage(journal, numberPlan("a good day", ownDate, "", "journal"));
    assert.equal(result.newNotes.length, 1);
    for (const [run, plan] of [
      [numberRefs(["a good day"]), numberPlan("a good day", ownDate)],
      [journal, numberPlan(ownDate, ownDate, "", "journal")],
      [journal, numberPlan("a good day", ownDate, ownDate, "journal")],
      [journal, numberPlan("a good day", `Journal ${ownDate}`, "", "journal")],
      [journal, numberPlan("a good day", "2026-07-16", "", "journal")],
    ] as const) {
      result = resolveCoverage(run, plan);
      assert.equal(result.newNotes.length, 0);
      assert.equal(result.queued[0].reason, "added_detail");
    }
    pass("only exact own-date Journal titles exempt; bodies, summaries and Work titles checked");

    const together = numberRefs(["on the 12th", "at 9"]);
    const togetherPlan = numberPlan("the 12th", "Meeting 2026");
    togetherPlan.placements.push({ ...sure, item: "I2", note: "X1", markdown: "at 9" });
    togetherPlan.placements[0].options = [{ label: "Work", folder: "work", note: "", new_note_title: "Meeting", new_folder_name: "" }];
    for (const field of ["title", "summary"] as const) {
      togetherPlan.new_notes[0] = { ref: "X1", folder: "work", title: "Meeting", summary: "", [field]: "Meeting 2026" };
      result = resolveCoverage(together, togetherPlan);
      assert.equal(result.newNotes.length, 0);
      assert.equal(result.filed.length, 0);
      assert.equal(result.queued.length, 2);
      assert.ok(result.queued.every((call) => call.reason === "added_detail"));
      assert.deepEqual(result.queued[0].options, togetherPlan.placements[0].options);
    }
    togetherPlan.new_notes[0] = { ref: "X1", folder: "work", title: "Meeting 12", summary: "at 9" };
    assert.equal(resolveCoverage(together, togetherPlan).filed.length, 2);
    togetherPlan.placements[1].markdown = "09:00";
    result = resolveCoverage(together, togetherPlan);
    assert.equal(result.filed.length, 0); // Rejected blocks cannot supply metadata numbers.
    assert.equal(result.queued.length, 2);
    assert.equal(result.newNotes.length, 0);
    assert.equal(resolveCoverage(refs, { ...empty, placements: [{ ...sure, markdown: "milk 2" }] }).queued[0].reason, "added_detail");
    pass("unverified new-note metadata queues all placements, retaining options; only filed items supply numbers");

    const routeInput = { job: "route" as const, system: "test", user: "test", schema: { type: "object" }, maxTokens: 8000 };
    for (const budget of ["500", "1023", "8000", "9000", "-1", "NaN", "", "1.5", "Infinity", "2048x"]) {
      assert.throws(() => buildAnthropicRequest(routeInput, "claude-haiku-4-5", budget), /ROUTE_THINKING_BUDGET/);
    }
    for (const budget of [undefined, "1024", "2048", "7999"]) {
      const request = buildAnthropicRequest(routeInput, "claude-haiku-4-5", budget);
      assert.ok(!Object.hasOwn(request, "temperature"));
      assert.deepEqual(request.thinking, { type: "enabled", budget_tokens: Number(budget ?? 2048) });
      assert.equal(request.max_tokens, 8000);
    }
    const off = buildAnthropicRequest(routeInput, "claude-haiku-4-5", "0");
    assert.equal(off.temperature, 0);
    assert.ok(!Object.hasOwn(off, "thinking"));
    const split = buildAnthropicRequest({ ...routeInput, job: "split" }, "claude-haiku-4-5", "500");
    assert.equal(split.temperature, 0);
    assert.ok(!Object.hasOwn(split, "thinking"));
    assert.throws(() => buildAnthropicRequest(routeInput, "claude-sonnet-5", "0"), /unsupported/);
    assert.throws(() => buildAnthropicRequest({ ...routeInput, maxTokens: 2048 }, "claude-haiku-4-5"), /ROUTE_THINKING_BUDGET/);
    assert.equal(requests, 0);
    pass("pure request builder refuses invalid budgets, omits temperature with thinking, keeps split unchanged");
    for (const reason of ["max_tokens", "refusal", "stop_sequence", "tool_use", "pause_turn", "model_context_window_exceeded", "null"]) {
      const message = `Model response incomplete or refused (stop_reason: ${reason}).`;
      assert.equal(formatPreviewError(new Error(message)), `FAIL: ${message}`);
    }
    assert.equal(formatPreviewError(new Error("Model response incomplete or refused (stop_reason: private capture text).")), "FAIL: Error");

    await withOrganizeCheckSchema(async () => {
      const first = await insertCapture({ body: "buy milk", capturedAt: date });
      const second = await insertCapture({ body: "buy milk", capturedAt: date });
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
      await assert.rejects(applyPlan(run, planned, true), /target is missing or changed/);
      assert.deepEqual(await organizeRowCounts(), { notes: 1, sources: 0, calls: 0, modelCalls: 0 });
      assert.equal((await getPendingCaptures()).length, 2);
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

    const directory = await mkdtemp(join(tmpdir(), "mynd-apply-check-"));
    try {
      await withOrganizeCheckSchema(async () => {
        const stored = await insertCapture({ body: "on the 12th", capturedAt: date });
        const area = await createFolder({ name: "Work", slug: "work" });
        const run = buildRefs([stored], [area], [], [],
          [[{ ...item, quotes: [stored.body] }]], "Europe/London");
        const plan = resolveCoverage(run, numberPlan("2026-09-12"));
        const file = join(directory, "added-detail.json");
        const saved = savedPlan(run, plan);
        const legacyPlan = { newNotes: numberPlan("2026-09-12").new_notes,
          filed: [{ item: run.items[0], note: "X1", markdown: "2026-09-12" }], queued: [] };
        assert.throws(() => savedPlan(run, legacyPlan), /unverified numbers/);
        await writeFile(file, JSON.stringify({ ...saved, plan: legacyPlan }));
        await assert.rejects(applySavedRun(file, directory), /unverified numbers/);
        assert.deepEqual(await organizeRowCounts(), { notes: 0, sources: 0, calls: 0, modelCalls: 0 });
        assert.deepEqual(await getPendingCaptures(), [stored]);
        await writeFile(file, JSON.stringify(saved));
        assert.deepEqual(await applySavedRun(file, directory), plan);
        const calls = await listOpenQuickCalls();
        assert.equal(calls[0].reason, "added_detail");
        assert.equal(calls[0].itemText, stored.body);
        assert.deepEqual(await organizeRowCounts(), { notes: 0, sources: 0, calls: 1, modelCalls: 0 });
        pass("saved added_detail queues apply without creating notes or making model calls");
      });
      await withOrganizeCheckSchema(async () => {
        const stored = await insertCapture({ body: "buy milk", capturedAt: date });
        const area = await createFolder({ name: "Personal", slug: "personal" });
        const existing = await createNote({ folderId: area.id, title: "existing", body: "original bytes" });
        const run = buildRefs([stored], [area], [existing], [], [[item, item, item]], "Europe/London");
        const plan = resolveCoverage(run, { new_notes: [{ ref: "X1", folder: "personal", title: "reviewed title", summary: "reviewed summary" }],
          placements: [{ ...sure, note: "X1", markdown: "- [ ] milk, but I am not sure" },
            { ...sure, item: "I2", markdown: "reviewed append\nwith line breaks" }] });
        const file = join(directory, "dry.json");
        const saved = savedPlan(run, plan);
        await writeFile(file, JSON.stringify(saved));
        assert.deepEqual(await applySavedRun(file, directory), plan);
        const notes = await getNotesWithBodies();
        assert.equal(notes.find((note) => note.id === existing.id)?.body, "original bytes\nreviewed append\nwith line breaks");
        const fresh = notes.find((note) => note.id !== existing.id)!;
        assert.equal(fresh.title, "reviewed title");
        assert.equal(fresh.summary, "reviewed summary");
        assert.equal(fresh.body, "- [ ] milk, but I am not sure");
        const calls = await listOpenQuickCalls();
        assert.equal(calls[0].itemText, plan.queued[0].itemText);
        assert.equal(calls[0].reason, plan.queued[0].reason);
        assert.deepEqual(await organizeRowCounts(), { notes: 2, sources: 2, calls: 1, modelCalls: 0 });
        const records = await Promise.all((await readdir(directory)).filter((name) => name !== "dry.json" && name !== "added-detail.json")
          .map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8"))));
        assert.equal(records.length, 2);
        const appliedRecords = records.filter((record) => record.appliedFrom === file);
        assert.equal(appliedRecords.length, 1);
        assert.equal(appliedRecords[0].modelCalls, 0);
        pass("saved dry run writes exact reviewed blocks and queues with zero model calls");

        const before = await organizeRowCounts();
        await assert.rejects(applySavedRun(file, directory), /no longer pending/);
        assert.deepEqual(await organizeRowCounts(), before);
        assert.deepEqual(await getNotesWithBodies(), notes);
        assert.deepEqual(await listOpenQuickCalls(), calls);
        pass("second apply refused without another write");

        // Corrupt structure must not be repaired into a different, applyable plan.
        const malformed = join(directory, "malformed.json");
        for (const invalid of [{ ...saved, dry: false }, { ...saved, refs: undefined },
          { ...saved, plan: { ...plan, filed: [] } },
          { ...saved, plan: { ...plan, filed: [plan.filed[0], plan.filed[0]] } }]) {
          await writeFile(malformed, JSON.stringify(invalid));
          await assert.rejects(applySavedRun(malformed, directory), /saved|coverage/i);
        }
      });
      await withOrganizeCheckSchema(async () => {
        const pending = await insertCapture({ body: "buy milk", capturedAt: date });
        const skipped = await insertCapture({ body: "buy milk", capturedAt: date });
        const area = await createFolder({ name: "Personal", slug: "personal" });
        const run = buildRefs([pending, skipped], [area], [], [], [[item], [item]], "Europe/London");
        const plan = resolveCoverage(run, { new_notes: [{ ref: "X1", folder: "personal", title: "new", summary: "" }],
          placements: [{ ...sure, note: "X1" }, { ...sure, item: "I2", note: "X1" }] });
        const file = join(directory, "skipped.json");
        await writeFile(file, JSON.stringify(savedPlan(run, plan)));
        await skipCaptures([skipped.id]);
        await assert.rejects(applySavedRun(file, directory), /no longer pending/);
        await assert.rejects(applyPlan(run, plan), /no longer pending/);
        assert.deepEqual(await organizeRowCounts(), { notes: 0, sources: 0, calls: 0, modelCalls: 0 });
        assert.deepEqual(await getPendingCaptures(), [pending]);
        pass("one non-pending capture refuses saved and plain apply atomically");

        await assert.rejects(markCaptureProcessed(skipped.id), /no longer pending/);
        await markCaptureProcessed(pending.id);
        await assert.rejects(markCaptureProcessed(pending.id), /no longer pending/);
        pass("markCaptureProcessed refuses skipped and processed captures");
      });
    } finally { await rm(directory, { recursive: true, force: true }); }

    await checkOrganizeRuns(pass);
    await checkOrganizeRetry(pass);

    for (const job of ["split", "route"]) {
      assert.deepEqual(samplingParameters("claude-haiku-4-5", job), { temperature: 0 });
      assert.deepEqual(samplingParameters("claude-sonnet-5", job), {});
      assert.deepEqual(samplingParameters("unknown", job), {});
      assert.deepEqual(samplingParameters("constructor", job), {});
    }
    for (const job of ["answer", "grader"]) assert.deepEqual(samplingParameters("claude-haiku-4-5", job), {});
    assert.equal(requests, 0);

    for (const file of await readdir(join(process.cwd(), "lib/organizer"))) {
      if (file.endsWith(".ts")) assert.ok(!(await readFile(join(process.cwd(), "lib/organizer", file), "utf8")).includes("createFolder"), file);
    }
    console.log(`${passed}/${passed} cases passed; capability gating verified; no organizer folder creation; zero model calls.`);
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally { globalThis.fetch = previousFetch; await closeDb(); }
}
void main();
