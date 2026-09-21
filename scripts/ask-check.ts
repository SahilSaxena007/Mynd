import assert from "node:assert/strict";
import { answerQuestion, answerSchema, checkAnswer, type AnswerOutput } from "../lib/ask/answer";
import type { AskCitation } from "../lib/db/types";
import { askCheckDatabase } from "../lib/db/ask-check-support";
import { withDatabase } from "../lib/db/client";
import { listAsks } from "../lib/db/queries";
import { buildAnthropicRequest } from "../lib/model";

async function main() {
  let passed = 0;
  const pass = (label: string) => console.log(`${++passed}. PASS: ${label}`);
  const note: AskCitation = { kind: "note", id: "note-id", ref: "N1" };
  const capture: AskCitation = { kind: "capture", id: "capture-id", ref: "U1" };
  const refs = new Map([[note.ref, note], [capture.ref, capture]]);
  const output: AnswerOutput = { answered: true, answer: "You have 3 things to buy.",
    citations: ["N1", "N99", "N1", "__proto__"] };
  assert.deepEqual(checkAnswer(output, refs).citations, [note]);
  assert.equal(checkAnswer(output, refs).answer, output.answer); // A5: derived count survives.
  pass("unknown references are dropped and surviving citations are deduplicated");

  const invalid = checkAnswer({ ...output, citations: ["N99", "U99"] }, refs);
  assert.equal(invalid.answered, false);
  assert.equal(checkAnswer({ ...output, citations: [] }, refs).answered, false);
  pass("an answer without a valid citation is forced unanswered");

  assert.equal(invalid.answer, "Not in your notes.");
  assert.equal(checkAnswer({ ...output, answered: false }, refs).answer, "Not in your notes.");
  pass("unanswered text is exactly Not in your notes.");

  assert.deepEqual(checkAnswer({ ...output, citations: ["U1", "N1", "U1"] }, refs).citations, [capture, note]);
  pass("references map to the correct note and capture ids");

  const input = { job: "answer" as const, maxTokens: 4000, system: "test", user: "test", schema: answerSchema };
  const request = buildAnthropicRequest(input, "claude-sonnet-5");
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.equal(Object.hasOwn(request, "temperature"), false);
  assert.equal(request.max_tokens, 4000);
  const split = buildAnthropicRequest({ ...input, job: "split", maxTokens: 8000 }, "claude-haiku-4-5");
  assert.equal(split.temperature, 0);
  assert.equal(Object.hasOwn(split, "thinking"), false);
  const route = buildAnthropicRequest({ ...input, job: "route", maxTokens: 16000 }, "claude-haiku-4-5");
  assert.deepEqual(route.thinking, { type: "enabled", budget_tokens: 2048 });
  assert.equal(Object.hasOwn(route, "temperature"), false);
  const noThinking = buildAnthropicRequest({ ...input, job: "route" }, "claude-haiku-4-5", "0");
  assert.equal(noThinking.temperature, 0);
  assert.equal(Object.hasOwn(noThinking, "thinking"), false);
  assert.throws(() => buildAnthropicRequest({ ...input, job: "route" }, "claude-sonnet-5"), /unsupported/);
  pass("adaptive answer disables thinking without temperature; split and route are unchanged");

  const db = askCheckDatabase();
  const before = structuredClone(db.vault);
  const previousFetch = globalThis.fetch;
  const settings = { MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "offline-test-key",
    ANSWER_MODEL: "claude-sonnet-5", MAX_TOKENS_PER_CALL: "16000", MAX_CALLS_PER_RUN: "1", DAILY_CALL_CAP: "10" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  let simulated = 0;
  // Never delegates to a real transport. No .env loading, HTTP or database network access.
  globalThis.fetch = async (_url, options) => {
    const built = JSON.parse(String(options?.body));
    assert.deepEqual(built.thinking, { type: "disabled" });
    assert.equal(Object.hasOwn(built, "temperature"), false);
    assert.equal(built.max_tokens, 4000);
    assert.deepEqual(built.output_config.format.schema, answerSchema);
    const supplied = JSON.parse(built.messages[0].content);
    assert.deepEqual(supplied.sources.map((source: { ref: string }) => source.ref), ["N1", "U1"]);
    assert.equal(supplied.sources[1].status, "not yet filed");
    assert.equal(JSON.stringify(supplied).includes("note-id"), false);
    simulated++;
    const data = simulated === 1 ? { ...output, citations: ["N1", "U1", "N99", "N1"] }
      : { answered: true, answer: "Invented appointment", citations: ["N99"] };
    return new Response(JSON.stringify({ id: "offline", type: "message", role: "assistant",
      model: built.model, content: [{ type: "text", text: JSON.stringify(data) }], stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 10 },
    }), { headers: { "content-type": "application/json" } });
  };
  try {
    await withDatabase(db.pool, async () => {
      const first = await answerQuestion("What do I need to buy?");
      assert.deepEqual(first, { id: "ask-1", question: "What do I need to buy?", answer: output.answer,
        answered: true, citations: [note, capture], inputTokens: 100, outputTokens: 20,
        costUsd: 0.000402, createdAt: new Date("2026-09-21T12:00:00Z") });
      assert.deepEqual(db.writes, ["model_calls", "asks"]);
      const second = await answerQuestion("When is my dentist appointment?");
      assert.equal(second.answer, "Not in your notes.");
      assert.equal(second.answered, false);
      assert.deepEqual(second.citations, []);
      assert.deepEqual(await listAsks(), [second, first]);
      assert.deepEqual(await listAsks(1), [second]);
      assert.equal(db.modelCalls[0][0], "answer");
      assert.equal(db.modelCalls[0][5], first.costUsd);
    });
    pass("asks persist question, checked answer, citations, tokens and cost, including unanswered history");
    assert.equal(simulated, 2);
    assert.deepEqual(db.writes, ["model_calls", "asks", "model_calls", "asks"]);
    assert.deepEqual(db.vault, before);
    pass("each ask writes only one asks row and one model_calls row; vault untouched");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
  assert.equal(passed, 7);
  console.log("7/7 checks passed. Zero live model calls, zero HTTP, zero database connections.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
