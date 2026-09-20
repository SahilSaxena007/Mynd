import { withAuth } from "@/lib/auth";
import { countOpenQuickCalls, getVault } from "@/lib/db/queries";

export const GET = withAuth(async () => {
  const [vault, openQuickCalls] = await Promise.all([getVault(), countOpenQuickCalls()]);
  return Response.json({ ...vault, openQuickCalls }, { headers: { "Cache-Control": "no-store" } });
});
