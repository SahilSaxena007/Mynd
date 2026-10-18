import { withAuth } from "@/lib/auth";
import { lastButtonRunStartedAt, OrganizeBusyError, withOrganizeLock } from "@/lib/db/organize-lock";
import { runOrganize } from "@/lib/organizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withAuth(async () => {
  try {
    return await withOrganizeLock(async () => {
      const last = await lastButtonRunStartedAt();
      if (last && Date.now() - last.getTime() < 120_000) {
        return Response.json({ error: "Organised a moment ago — try again in a minute." }, { status: 429 });
      }
      const plan = await runOrganize({ trigger: "button" });
      return Response.json(plan
        ? { status: "ok", filed: plan.filed.length, queued: plan.queued.length }
        : { status: "nothing_pending" });
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Organize failed." },
      { status: error instanceof OrganizeBusyError ? 409 : 500 });
  }
});
