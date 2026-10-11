import assert from "node:assert/strict";
import { tidyNotes } from "../lib/organizer/stage4-tidy";
import { withModelRun } from "../lib/model";
import { checkModelBudget } from "../lib/model/guard";
import type { EditableNote } from "../lib/db/queries";
import type { TidyPlan } from "../lib/organizer/tidy-types";
import { printTidyCounts } from "../lib/organizer/print";

export async function checkTidyStage(a: EditableNote) {
  const oldEnv = { ...process.env };
  try {
    process.env.TIDY_MAX_NOTES = "2";
    const notes = [a, { ...a, id: "b" }, { ...a, id: "c" }, { ...a, id: "journal-note", folderId: "journal" },
      { ...a, id: "archived", archivedAt: new Date() }, { ...a, id: "other", folderId: "other" }];
    const inputs: { notes: { ref: string; body?: string }[] }[] = [];
    let writes = 0;
    let plan: TidyPlan = { operations: [] };
    const deps = {
      getEditableNotes: async () => notes,
      listFolders: async () => ["f", "journal", "other"].map((id) => ({ id, slug: id, name: id, description: null,
        parentId: null, color: null, createdAt: new Date() })),
      applyTidy: async () => { writes++; return []; },
      propose: async (user: string) => { inputs.push(JSON.parse(user)); return plan; },
    };
    const operation = { note: "N1", absorbs: ["N2"], title: a.title, summary: a.summary!, body: a.body };
    plan = { operations: [operation] };
    const dry = await tidyNotes({ touched: ["a", "other"], dry: true, details: false }, deps);
    assert.equal(dry.notesTidied, 1);
    assert.equal(dry.notesMerged, 1);
    assert.equal(writes, 0);
    assert.equal(inputs.length, 1, "automatic cap is shared across folders");
    assert.equal(inputs[0].notes.length, 3, "archived notes excluded");
    assert.equal(inputs[0].notes.filter((note) => note.body !== undefined).length, 2);
    assert.equal(inputs[0].notes[2].body, undefined, "unchosen candidates are summaries only");
    const lines: string[] = [];
    const log = console.log;
    try { console.log = (line: string) => { lines.push(line); }; printTidyCounts(dry, true); }
    finally { console.log = log; }
    assert.ok(lines[0].includes("notesMerged 1"));
    plan = { operations: [{ ...operation, absorbs: [], body: "Dropped everything." }, operation,
      { ...operation, note: "N3", absorbs: [] }, operation] };
    const mixed = await tidyNotes({ touched: ["a"], details: false }, deps);
    assert.equal(mixed.notesTidied, 1);
    assert.equal(mixed.tidyRejected, 3);
    assert.equal(writes, 1, "bad operation does not block good operation; overlaps cannot write twice");
    plan = { operations: [{ ...operation, absorbs: [] }, { ...operation, note: "N2", absorbs: [] }] };
    let transactions = 0;
    const failure = await tidyNotes({ touched: ["a", "b"], details: false }, { ...deps,
      applyTidy: async () => { if (++transactions === 1) throw new Error("Database failed"); return []; } });
    assert.equal(failure.tidyRejected, 1);
    assert.equal(failure.notesTidied, 1, "one rolled-back operation does not stop the next operation");
    inputs.length = 0;
    plan = { operations: [] };
    await tidyNotes({ all: true, details: false }, deps);
    assert.equal(inputs.length, 2, "one call per non-Journal folder");
    inputs.length = 0;
    await tidyNotes({ all: true, folder: "f", details: false }, deps);
    assert.equal(inputs.length, 1);
    inputs.length = 0;
    await tidyNotes({ all: true, folder: "journal", details: false }, deps);
    assert.equal(inputs.length, 0);
    await tidyNotes({ touched: [], details: false }, deps);
    assert.equal(inputs.length, 0);
    process.env.MAX_TOKENS_PER_CALL = "16000";
    process.env.MAX_CALLS_PER_RUN = "0";
    process.env.DAILY_CALL_CAP = "100";
    let attempts = 0;
    const refusal = await withModelRun(() => tidyNotes({ all: true, details: false }, { ...deps,
      propose: async () => { attempts++; checkModelBudget(16000); return plan; } }));
    assert.equal(attempts, 1);
    assert.equal(refusal.tidyRejected, 1);
    assert.equal(refusal.error, "tidy failed: Model call refused: MAX_CALLS_PER_RUN exceeded.");
    assert.equal(writes, 1, "refusal neither writes nor undoes an earlier write");
    console.log("PASS tidy stage: scope/cap, one call per folder, summaries-only remainder, Journal/archive exclusions, dry run, independent rejection, no retry on real budget refusal");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) Reflect.deleteProperty(process.env, key);
    Object.assign(process.env, oldEnv);
  }
}
