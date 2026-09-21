import { withAuth } from "@/lib/auth";
import { listAsks } from "@/lib/db/queries";
import { citationLabels } from "@/lib/ask/sources";

export const GET = withAuth(async () => {
  const asks = (await listAsks()).filter((ask) => ask.answered);
  return Response.json({ asks, labels: await citationLabels(asks) });
});
