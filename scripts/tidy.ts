import { loadEnvConfig } from "@next/env";
import { parseArgs } from "node:util";
import { closeDb } from "../lib/db/client";
import { getEditableNotes, getLastOrganizeRun, insertOrganizeRun } from "../lib/db/queries";
import { withModelRun } from "../lib/model";
import { tidyNotes } from "../lib/organizer/stage4-tidy";
import { newRunRecord } from "../lib/organizer/run-record";
import { printTidyCounts } from "../lib/organizer/print";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const { values } = parseArgs({ options: { all: { type: "boolean" }, dry: { type: "boolean" }, folder: { type: "string" } } });
    const run = newRunRecord("manual");
    let touched: string[] = [];
    // Without a full/folder pass, revisit notes changed since the last organize.
    if (!values.all && !values.folder) {
      const last = await getLastOrganizeRun();
      if (last) touched = (await getEditableNotes()).filter((note) => Date.parse(note.updatedAt) >= new Date(last.startedAt).getTime()).map((note) => note.id);
    }
    const result = await withModelRun(() => tidyNotes({ ...values, touched }), (cost) => { run.costUsd = cost; });
    Object.assign(run, { notesTidied: result.notesTidied, notesMerged: result.notesMerged,
      tidyRejected: result.tidyRejected, error: result.error, status: result.error ? "failed" : "ok" });
    if (!values.dry) await insertOrganizeRun(run);
    printTidyCounts(result, values.dry);
    console.log(`Tidy cost $${run.costUsd.toFixed(6)}`);
    if (result.error) process.exitCode = 1;
  } finally { await closeDb(); }
}
void main().catch(() => { console.error("Tidy failed."); process.exitCode = 1; });
