import { getPendingCaptures, listFolders, getNoteSummaries, listActiveRules } from "../db/queries";

export async function gather() {
  const [captures, folders, noteSummaries, rules] = await Promise.all([
    getPendingCaptures(), listFolders(), getNoteSummaries(), listActiveRules(),
  ]);
  return { captures, folders, noteSummaries, rules };
}
