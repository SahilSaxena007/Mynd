import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { countFailedCaptures, getLastOrganizeRun, getNotesWithBodies, listFolders, listOpenQuickCalls } from "../lib/db/queries";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const [folders, notes, calls] = await Promise.all([listFolders(), getNotesWithBodies(), listOpenQuickCalls()]);
    const [lastRun, failed] = await Promise.all([getLastOrganizeRun(), countFailedCaptures()]);
    console.log(`Failed captures: ${failed}`);
    if (lastRun) {
      console.log(`Last organise run: ${lastRun.finishedAt.toISOString()} (${lastRun.trigger}, ${lastRun.status})`);
      console.log(`Captures ${lastRun.capturesProcessed} | filed ${lastRun.itemsFiled} | queued ${lastRun.itemsQueued}`
        + ` | new notes ${lastRun.notesCreated} | appended ${lastRun.notesAppended} | cost $${lastRun.costUsd.toFixed(6)}`);
      if (lastRun.error) console.log(lastRun.error);
      if (lastRun.failedCaptureId) console.log(`Failed capture: ${lastRun.failedCaptureId}`);
    } else console.log("No organise runs yet.");
    for (const folder of folders) {
      console.log(`\n${folder.name} (${folder.slug})`);
      for (const note of notes.filter((note) => note.folderId === folder.id)) console.log(`\n  ${note.title}\n${note.body}`);
    }
    console.log(`\nOpen Quick Calls: ${calls.length}`);
    for (const call of calls) console.log(`\n[${call.reason}] ${call.topic}\n${call.itemText}\n${JSON.stringify(call.options, null, 2)}`);
  } catch {
    console.error("Could not read vault."); process.exitCode = 1;
  } finally { await closeDb(); }
}
void main();
