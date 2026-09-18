import { withAuth } from "@/lib/auth";
import { listCaptures } from "@/lib/db/queries";

export const GET = withAuth(async () => {
  return Response.json({ captures: await listCaptures() });
});
