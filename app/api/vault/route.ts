import { withAuth } from "@/lib/auth";
import { countOpenQuickCalls, getLastOrganizeRun, getVault } from "@/lib/db/queries";

export const GET = withAuth(async () => {
  const [vault, openQuickCalls, lastRun] = await Promise.all([getVault(), countOpenQuickCalls(), getLastOrganizeRun()]);
  return Response.json({ ...vault, openQuickCalls, lastRun }, { headers: { "Cache-Control": "no-store" } });
});
