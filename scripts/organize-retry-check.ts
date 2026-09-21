import assert from "node:assert/strict";
import { createFolder, getLastOrganizeRun, getPendingCaptures, insertCapture } from "../lib/db/queries";
import { checkModelCallUsage, organizeRowCounts, withOrganizeCheckSchema } from "../lib/db/organize-check-support";
import { migrate } from "../lib/db/migrate";
import { complete, withModelRun } from "../lib/model";
import { guardModelCall } from "../lib/model/guard";
import { runOrganize } from "../lib/organizer";
import { completeSplit } from "../lib/organizer/split-coverage";
import { routeItems } from "../lib/organizer/stage2-route";
import type { Capture } from "../lib/db/types";

type Outcome = "ok" | "max_tokens" | "provider" | "schema" | "refusal";
const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, thinkingTokens: 0 };

// Real model boundary + spend guard + ledger, but SDK HTTP is always intercepted.
// The test never delegates to fetch or sends any request to a provider.
export async function checkOrganizeRetry(pass: (label: string) => void) {
  const previousFetch = globalThis.fetch;
  const settings = { MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "fake-offline-test-key",
    ORGANIZE_MODEL: "claude-haiku-4-5", ROUTE_MODEL: "claude-haiku-4-5", ROUTE_THINKING_BUDGET: "2048",
    USER_TIMEZONE: "Europe/London", MAX_TOKENS_PER_CALL: "16000", MAX_CALLS_PER_RUN: "20", DAILY_CALL_CAP: "500" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  let outcomes: Outcome[] = [];
  let requests: { items: { ref: string; text: string; capture: string }[] }[] = [];
  let splitIds: string[] = [];
  let thinking: number | undefined = 7;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    assert.equal(request.max_tokens, 16000);
    const input = JSON.parse(request.messages[0].content);
    requests.push(input);
    const outcome = outcomes.shift();
    assert.ok(outcome, "Unexpected extra model attempt");
    if (outcome === "provider") return new Response(JSON.stringify({ type: "error",
      error: { type: "rate_limit_error", message: "PRIVATE_ERROR_CANARY" } }), { status: 429 });
    const plan = { new_notes: [{ ref: "X1", folder: "personal", title: "test note", summary: "" }],
      placements: input.items.map((item: { ref: string; text: string }) => ({ item: item.ref,
        note: "X1", markdown: item.text, confidence: "sure", options: [] })) };
    return new Response(JSON.stringify({ id: "fake", type: "message", role: "assistant", model: request.model,
      content: [{ type: "text", text: outcome === "schema" ? "{}" : JSON.stringify(plan) }],
      stop_reason: outcome === "max_tokens" || outcome === "refusal" ? outcome : "end_turn",
      usage: { input_tokens: 100, output_tokens: 20,
        ...(thinking === undefined ? {} : { output_tokens_details: { thinking_tokens: thinking } }) },
    }), { headers: { "content-type": "application/json" } });
  };
  const stages = { routeItems, splitCapture: async (capture: Capture) => {
    // Exercise the same per-run accounting as a split, without producing an API request.
    await guardModelCall(8000);
    splitIds.push(capture.id);
    return { model: "claude-haiku-4-5", usage,
      data: completeSplit(capture.body, [{ topic: "test", quotes: [capture.body] }]) };
  } };
  async function fixture(count: number, responses: Outcome[]) {
    outcomes = [...responses]; requests = []; splitIds = []; thinking = 7;
    await createFolder({ slug: "personal", name: "Personal" });
    const captures = [];
    for (let index = 0; index < count; index++) captures.push(await insertCapture({
      body: `fixture capture ${index}`, capturedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    }));
    return captures;
  }
  const run = () => runOrganize({ trigger: "cron" }, stages);
  async function assertNoWrites(captures: Capture[]) {
    const counts = await organizeRowCounts();
    assert.equal(counts.notes + counts.calls + counts.sources, 0);
    assert.deepEqual(await getPendingCaptures(), captures);
    assert.equal((await getLastOrganizeRun())?.status, "failed");
    assert.equal((await getLastOrganizeRun())?.failedCaptureId, null);
  }
  try {
    await withOrganizeCheckSchema(async () => {
      const captures = await fixture(9, ["max_tokens", "ok"]);
      const logs: string[] = [];
      const log = console.log;
      try { console.log = (...args) => { logs.push(args.join(" ")); }; await run(); }
      finally { console.log = log; }
      assert.equal(requests.length, 2);
      assert.deepEqual(requests.map((input) => input.items.length), [9, 4]);
      assert.deepEqual(requests[1].items, requests[0].items.slice(0, 4));
      assert.deepEqual(splitIds, captures.map((capture) => capture.id));
      assert.deepEqual(await getPendingCaptures(), captures.slice(4));
      const record = (await getLastOrganizeRun())!;
      assert.equal(record.status, "ok");
      assert.equal(record.capturesProcessed, 4);
      assert.equal(record.itemsFiled, 4);
      assert.equal(record.costUsd, 0.0004); // Both simulated route attempts were accounted.
      assert.ok(logs.includes("route truncated; retried with 4 captures"));
      assert.ok(logs.some((line) => line.includes("thinking 14 tokens") && line.includes("$0.000400")));
    });
    pass("route truncation retries once with oldest half, reuses splits, counts both attempts and leaves remainder pending");

    for (const count of [9, 1]) await withOrganizeCheckSchema(async () => {
      const captures = await fixture(count, ["max_tokens", "max_tokens"]);
      await assert.rejects(run(), /route failed/);
      assert.equal(requests.length, count === 1 ? 1 : 2);
      assert.equal(splitIds.length, count);
      await assertNoWrites(captures);
      if (count > 1) assert.equal((await getLastOrganizeRun())?.error, "route truncated; retried with 4 captures; route failed.");
    });
    pass("second route truncation ends run without writes; a single capture is never retried");

    await withOrganizeCheckSchema(async () => {
      const captures = await fixture(3, ["provider"]);
      await assert.rejects(run(), /route failed: HTTP 429/);
      assert.equal(requests.length, 1);
      await assertNoWrites(captures);
    });
    pass("route provider failure triggers no retry through the real model boundary");

    for (const outcome of ["schema", "refusal"] as const) await withOrganizeCheckSchema(async () => {
      const captures = await fixture(3, [outcome]);
      await assert.rejects(run(), /route failed/);
      assert.equal(requests.length, 1);
      await assertNoWrites(captures);
    });
    pass("schema failure and refusal trigger no retry");

    await withOrganizeCheckSchema(async () => {
      await fixture(2, ["max_tokens", "ok"]);
      await run();
      assert.deepEqual((await checkModelCallUsage()).map((row) => row.thinkingTokens), [7, 7]);
      outcomes = ["ok"]; thinking = undefined;
      await run();
      assert.deepEqual((await checkModelCallUsage()).map((row) => row.thinkingTokens), [7, 7, 0]);
      const before = await checkModelCallUsage();
      await migrate(); await migrate();
      assert.deepEqual(await checkModelCallUsage(), before);
    });
    pass("thinking tokens persist on truncated and successful calls, omitted usage defaults to zero; migration re-runnable");

    await withOrganizeCheckSchema(async () => {
      const captures = await fixture(9, ["max_tokens", "ok"]);
      process.env.MAX_CALLS_PER_RUN = "10"; // Nine splits plus initial route: retry must be refused.
      await assert.rejects(run(), /route failed/);
      assert.equal(requests.length, 1);
      await assertNoWrites(captures);
      process.env.MAX_CALLS_PER_RUN = "20";
      const input = { job: "route" as const, system: "test", user: "{}", schema: { type: "object" }, maxTokens: 16001 };
      await assert.rejects(withModelRun(() => complete(input)), /MAX_TOKENS_PER_CALL exceeded/);
      Reflect.deleteProperty(process.env, "MAX_TOKENS_PER_CALL");
      await assert.rejects(withModelRun(() => complete({ ...input, maxTokens: 16000 })), /MAX_TOKENS_PER_CALL/);
      assert.equal(requests.length, 1);
      process.env.MAX_TOKENS_PER_CALL = "16000";
    });
    pass("retry retains run call budget; above-ceiling and missing-ceiling requests fail closed without HTTP");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
}
