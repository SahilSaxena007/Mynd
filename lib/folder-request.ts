import { FolderError } from "./db/folders";

export async function folderRequest(req: Request, action: (input: Record<string, unknown>) => Promise<Response>) {
  try {
    let input: unknown;
    try { input = await req.json(); } catch { throw new FolderError("Send the folder details as JSON."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new FolderError("Send the folder details as an object.");
    return await action(input as Record<string, unknown>);
  } catch (error) {
    if (error instanceof FolderError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not save the folder. Try again." }, { status: 500 });
  }
}
