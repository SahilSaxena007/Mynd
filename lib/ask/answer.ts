import { getNotesWithBodies, getPendingCaptures, insertAsk } from "../db/queries";
import type { AskCitation } from "../db/types";
import { complete, withModelRun } from "../model";
import { estimateCost } from "../model/cost";
import { answerPrompt } from "../prompts/answer";

export type AnswerOutput = { answered: boolean; answer: string; citations: string[] };
export const answerSchema = {
  type: "object", additionalProperties: false, required: ["answered", "answer", "citations"],
  properties: {
    answered: { type: "boolean" }, answer: { type: "string" },
    citations: { type: "array", items: { type: "string" } },
  },
};

// A4: only code-issued references can become stored citations. No P24 number gate (A5).
export function checkAnswer(output: AnswerOutput, issued: ReadonlyMap<string, AskCitation>) {
  const citations = [...new Set(output.citations)].flatMap((ref) => {
    const citation = issued.get(ref);
    return citation ? [citation] : [];
  });
  const answered = output.answered && citations.length > 0;
  return { answered, answer: answered ? output.answer : "Not in your notes.", citations };
}

export async function answerQuestion(question: string) {
  const [notes, captures] = await Promise.all([getNotesWithBodies(), getPendingCaptures()]);
  const issued = new Map<string, AskCitation>();
  const sources = [
    ...notes.map((note, index) => {
      const ref = `N${index + 1}`;
      issued.set(ref, { kind: "note", id: note.id, ref });
      return { ref, kind: "note", title: note.title, body: note.body };
    }),
    ...captures.map((capture, index) => {
      const ref = `U${index + 1}`;
      issued.set(ref, { kind: "capture", id: capture.id, ref });
      return { ref, kind: "capture", status: "not yet filed", body: capture.body, capturedAt: capture.capturedAt };
    }),
  ];
  const result = await withModelRun(() => complete<AnswerOutput>({
    job: "answer", system: answerPrompt, user: JSON.stringify({ question, sources }),
    schema: answerSchema, maxTokens: 4000,
  }));
  const costUsd = estimateCost(result.model, result.usage);
  const ask = await insertAsk({ question, ...checkAnswer(result.data, issued),
    inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd });
  console.log(`ask: input ${ask.inputTokens} tokens, output ${ask.outputTokens} tokens, $${costUsd.toFixed(6)}`);
  return ask;
}
