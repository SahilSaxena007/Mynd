import { withAuth } from "@/lib/auth";
import { createUserFolder } from "@/lib/db/folders";
import { folderRequest } from "@/lib/folder-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = withAuth((req) => folderRequest(req, async (input) => {
  const result = await createUserFolder(input);
  return Response.json(result, { status: "folder" in result ? 201 : 200 });
}));
