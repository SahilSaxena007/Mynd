import type { RunRefs } from "./refs";
import type { ResolvedPlan } from "./coverage";

export function printPlan(refs: RunRefs, plan: ResolvedPlan, dry: boolean, inputTokens: number, cost: number) {
  for (const ref of new Set(plan.filed.map((entry) => entry.note))) {
    const existing = refs.notes.get(ref);
    const fresh = plan.newNotes.find((note) => note.ref === ref);
    const folder = fresh?.folder ?? [...refs.folders.values()].find((folder) => folder.id === existing?.folderId)?.slug;
    console.log(`\n${existing ? "APPEND" : "NEW"} [${folder}] ${existing?.title ?? fresh?.title}`);
    for (const entry of plan.filed.filter((entry) => entry.note === ref)) {
      console.log(`  ${entry.item.ref} (${entry.item.capture}) [sure]\n${entry.markdown}`);
    }
  }
  for (const call of plan.queued) {
    console.log(`\nQUICK CALL ${call.item} [${call.reason}] ${call.itemText}`);
    if (call.unverifiedNumbers?.length) console.log(`  Unverified numbers: ${call.unverifiedNumbers.join(", ")}`);
    for (const option of call.options) console.log(`  ${JSON.stringify(option)}`);
  }
  const counts = ["unsure", "invalid_target", "not_placed", "added_detail"].map((reason) =>
    `${reason} ${plan.queued.filter((call) => call.reason === reason).length}`).join(", ");
  const appended = new Set(plan.filed.filter((entry) => refs.notes.has(entry.note)).map((entry) => entry.note)).size;
  console.log(`\nitems ${refs.items.length} | filed ${plan.filed.length} | queued ${plan.queued.length} (${counts})`);
  console.log(`sure rate ${refs.items.length ? Math.round(100 * plan.filed.length / refs.items.length) : 0}% (target ~90%)`
    + ` | new notes ${plan.newNotes.length} | appended ${appended} | captures ${dry ? "would process" : "processed"} ${refs.captures.length}`);
  console.log(`stage 2 input ${inputTokens.toLocaleString("en-GB")} tokens | run cost $${cost.toFixed(6)}`);
}
