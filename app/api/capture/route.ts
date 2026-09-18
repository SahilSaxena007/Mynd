import { withAuth } from "@/lib/auth";
import { insertCapture } from "@/lib/db/queries";

export const POST = withAuth(async (req) => {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || !("body" in input) || typeof input.body !== "string") {
    return Response.json({ error: "Body must be a string." }, { status: 400 });
  }
  if (!input.body.trim() || input.body.length > 100_000) {
    return Response.json({ error: "Body must contain 1 to 100,000 characters." }, { status: 400 });
  }
  const device = "device" in input && (input.device === "phone" || input.device === "laptop")
    ? input.device : undefined;
  const capture = await insertCapture({ body: input.body.trim(), device, kind: "text", capturedAt: new Date() });
  return Response.json({ id: capture.id, capturedAt: capture.capturedAt }, { status: 201 });
});
