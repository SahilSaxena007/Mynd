import { withAuth } from "@/lib/auth";
import { getNote, updateNoteBody } from "@/lib/db/queries";

type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };

export async function GET(req: Request, context: Context) {
  return withAuth(async () => {
    const { id } = await context.params;
    const note = uuid.test(id) ? await getNote(id, true) : null;
    return note ? Response.json({ note }, { headers })
      : Response.json({ error: "Note not found." }, { status: 404, headers });
  })(req);
}

export async function PATCH(req: Request, context: Context) {
  return withAuth(async () => {
    let input: unknown;
    try { input = await req.json(); } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
    }
    if (!input || typeof input !== "object" || !("body" in input) || typeof input.body !== "string"
      || !input.body.trim() || input.body.length > 200_000) {
      return Response.json({ error: "Body must contain 1 to 200,000 characters and cannot be blank." }, { status: 400, headers });
    }
    if (!("updatedAt" in input) || typeof input.updatedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(input.updatedAt)
      || !Number.isFinite(Date.parse(input.updatedAt))) {
      return Response.json({ error: "updatedAt must be the timestamp last read from this note." }, { status: 400, headers });
    }
    const { id } = await context.params;
    if (!uuid.test(id)) return Response.json({ error: "Note not found." }, { status: 404, headers });
    const result = await updateNoteBody(id, input.body, input.updatedAt);
    if (result.ok) return Response.json({ note: result.note }, { headers });
    if (result.reason === "missing") return Response.json({ error: "Note not found." }, { status: 404, headers });
    return Response.json({ error: "This note changed. Your changes were not saved.", note: result.note }, { status: 409, headers });
  })(req);
}
