import { withAuth } from "@/lib/auth";
import { updateUserFolder } from "@/lib/db/folders";
import { folderRequest } from "@/lib/folder-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(req: Request, context: { params: Promise<{ slug: string }> }) {
  return withAuth((request) => folderRequest(request, async (input) => {
    const { slug } = await context.params;
    return Response.json({ folder: await updateUserFolder(slug, input) });
  }))(req);
}
