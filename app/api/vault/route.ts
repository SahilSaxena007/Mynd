import { withAuth } from "@/lib/auth";
import { countOpenQuickCalls, getLastOrganizeRun, listFolders, getEditableNotes } from "@/lib/db/queries";

export const GET = withAuth(async () => {
  const [folders, notes, openQuickCalls, lastRun] = await Promise.all([
    listFolders(), getEditableNotes(), countOpenQuickCalls(), getLastOrganizeRun(),
  ]);
  return Response.json({ folders, notes, openQuickCalls, lastRun }, { headers: { "Cache-Control": "no-store" } });
});
