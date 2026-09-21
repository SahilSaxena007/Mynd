import { withAuth } from "@/lib/auth";
import { answerQuestion } from "@/lib/ask/answer";
import { citationLabels } from "@/lib/ask/sources";

export const POST = withAuth(async (req) => {
  let input: unknown;
  try { input = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || !("question" in input)
    || typeof input.question !== "string" || !input.question.trim() || input.question.length > 100_000) {
    return Response.json({ error: "Question must contain 1 to 100,000 characters." }, { status: 400 });
  }
  const ask = await answerQuestion(input.question.trim());
  return Response.json({ ask, labels: await citationLabels([ask]) }, { status: 201 });
});
