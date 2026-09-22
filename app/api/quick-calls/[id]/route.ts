import { withAuth } from "@/lib/auth";
import { resolveQuickCall } from "@/lib/db/queries";
import type { QuickCallResolution } from "@/lib/db/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };

function isResolution(input: unknown): input is QuickCallResolution {
  if (!input || typeof input !== "object" || !("action" in input)) return false;
  const keys = Object.keys(input).sort().join(",");
  if (input.action === "dismiss") return keys === "action";
  if (input.action !== "file") return false;
  if (keys === "action,noteId" && "noteId" in input) {
    return typeof input.noteId === "string" && uuid.test(input.noteId);
  }
  return keys === "action,folderId,newNoteTitle" && "folderId" in input && "newNoteTitle" in input
    && typeof input.folderId === "string" && uuid.test(input.folderId)
    && typeof input.newNoteTitle === "string" && !!input.newNoteTitle.trim() && input.newNoteTitle.length <= 1000;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return withAuth(async () => {
    const { id } = await context.params;
    if (!uuid.test(id)) return Response.json({ error: "Quick Call not found." }, { status: 404, headers });
    let input: unknown;
    try { input = await req.json(); } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
    }
    if (!isResolution(input)) {
      return Response.json({ error: "Choose an existing note, a new note in an existing folder, or dismiss." }, { status: 400, headers });
    }
    const result = await resolveQuickCall(id, input);
    if (result.ok) return Response.json(result, { headers });
    return Response.json({ ...result, error: result.reason === "conflict"
      ? "This item was already handled on another device. The list has been refreshed."
      : "Quick Call not found." }, { status: result.reason === "conflict" ? 409 : 404, headers });
  })(req);
}
