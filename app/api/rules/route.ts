import { withAuth } from "@/lib/auth";
import { createRule, listActiveRules, setRuleActive } from "@/lib/db/queries";

const headers = { "Cache-Control": "no-store" };
const invalid = () => Response.json({ error: "Invalid rule request." }, { status: 400, headers });

export const GET = withAuth(async () => Response.json({ rules: await listActiveRules() }, { headers }));

export const POST = withAuth(async (req) => {
  let input: unknown;
  try { input = await req.json(); } catch { return invalid(); }
  if (!input || typeof input !== "object" || !("instruction" in input) || typeof input.instruction !== "string"
    || input.instruction.length > 200_000 || !("kind" in input) || typeof input.kind !== "string"
    || !input.kind.trim() || input.kind.length > 100) return invalid();
  if (!input.instruction.trim()) return Response.json({ rule: null }, { headers });
  const rule = await createRule({ kind: input.kind, instruction: input.instruction });
  return Response.json({ rule }, { status: 201, headers });
});

export const PATCH = withAuth(async (req) => {
  let input: unknown;
  try { input = await req.json(); } catch { return invalid(); }
  if (!input || typeof input !== "object" || !("id" in input) || typeof input.id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)
    || !("active" in input) || typeof input.active !== "boolean") return invalid();
  const ok = await setRuleActive(input.id, input.active);
  return Response.json(ok ? { ok } : { error: "Rule not found." }, { status: ok ? 200 : 404, headers });
});
