import { timingSafeEqual } from "node:crypto";

// Slice 1 stub: future routes must call this before accessing vault data.
export function requireToken(req: Request): void {
  const expected = process.env.SECRET_TOKEN;
  if (!expected || expected === "change-me-to-a-long-random-string") {
    throw new Error("SECRET_TOKEN must be configured.");
  }
  const supplied = req.headers.get("SECRET_TOKEN") ?? "";
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export function withAuth(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      requireToken(req);
      return await handler(req);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("Vault request failed:", error);
      return new Response(null, { status: 500 });
    }
  };
}
