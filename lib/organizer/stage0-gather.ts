import { getPendingCaptures, listFolders, getNoteSummaries, getNotesWithBodies, listActiveRules } from "../db/queries";

export async function gather() {
  const [captures, folders, noteSummaries, rules] = await Promise.all([
    getPendingCaptures(), listFolders(), getNoteSummaries(), listActiveRules(),
  ]);
  return { captures, folders, noteSummaries, rules };
}

export async function gatherForOrganize(limit: number) {
  const [captures, folders, notes, rules] = await Promise.all([
    getPendingCaptures(limit), listFolders(), getNotesWithBodies(), listActiveRules(),
  ]);
  return { captures, folders, notes, rules };
}
