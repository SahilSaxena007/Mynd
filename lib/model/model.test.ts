import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { complete, withModelRun, type CompleteInput } from "./index";
import { estimateCost } from "./cost";
import { splitSchema } from "../organizer/stage1-split";

// All database and HTTP I/O is replaced here. This suite cannot call a provider.
test("model boundary and spend protection (no network)", async () => {
  const globalDb = globalThis as typeof globalThis & { vaultDb?: Pool };
  const previousPool = globalDb.vaultDb;
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  let today = 0;
  let requests = 0;
  let logged = 0;
  let responseText = '{"items":[{"text":"hello","topic":"greeting"}]}';
  let responseStatus = 200;
  let stopReason = "end_turn";
  let failLog = false;
  let requestBody: Record<string, unknown> = {};
  const input: CompleteInput = { job: "split", system: "split", user: "hello", schema: splitSchema, maxTokens: 8000 };
  const defaults = () => {
    process.env.MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    process.env.ORGANIZE_MODEL = "claude-haiku-4-5";
    process.env.MAX_TOKENS_PER_CALL = "8000";
    process.env.MAX_CALLS_PER_RUN = "2";
    process.env.DAILY_CALL_CAP = "10";
    today = 0;
    responseStatus = 200;
    stopReason = "end_turn";
    failLog = false;
  };
  globalDb.vaultDb = {
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    query: async (text: string) => {
      if (/count\(\*\)/i.test(text)) return { rows: [{ count: String(today) }] };
      if (text.includes("model_calls") && text.includes("VALUES")) {
        if (failLog) throw new Error("log unavailable");
        today += 1;
        logged += 1;
        return { rows: [] };
      }
      throw new Error("Unexpected database operation");
    },
  } as unknown as Pool;
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    requestBody = JSON.parse(String(init?.body));
    if (responseStatus !== 200) return new Response(JSON.stringify({ type: "error",
      error: { type: "rate_limit_error", message: "test" } }), { status: responseStatus });
    return new Response(JSON.stringify({ id: "test-message", type: "message", role: "assistant",
      model: "claude-haiku-4-5", content: [{ type: "text", text: responseText }],
      stop_reason: stopReason, stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 10 },
    }), { headers: { "content-type": "application/json" } });
  };
  try {
    defaults();
    await assert.rejects(complete(input), /withModelRun/);
    for (const name of ["MAX_TOKENS_PER_CALL", "MAX_CALLS_PER_RUN", "DAILY_CALL_CAP"]) {
      for (const value of [undefined, "", "no", "1x", "NaN", "Infinity", "-1", "1.5", "9007199254740992"]) {
        defaults();
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
        await assert.rejects(withModelRun(() => complete(input)), new RegExp(name));
      }
    }
    defaults();
    process.env.MAX_TOKENS_PER_CALL = "10";
    await assert.rejects(withModelRun(() => complete(input)), /MAX_TOKENS_PER_CALL/);
    defaults();
    process.env.DAILY_CALL_CAP = "0";
    await assert.rejects(withModelRun(() => complete(input)), /DAILY_CALL_CAP/);
    assert.equal(requests, 0);

    defaults();
    process.env.MAX_CALLS_PER_RUN = "1";
    await withModelRun(async () => {
      const result = await complete<{ items: { text: string }[] }>(input);
      assert.equal(result.data.items[0].text, "hello");
      assert.equal(logged, 1);
      await assert.rejects(withModelRun(() => complete(input)), /MAX_CALLS_PER_RUN/);
    });
    assert.equal(requests, 1);
    assert.deepEqual(requestBody.output_config, { format: { type: "json_schema", schema: splitSchema } });
    assert.equal(requestBody.thinking, undefined);
    assert.equal(requestBody.effort, undefined);
    assert.equal(JSON.stringify(requestBody).includes("cache_control"), false);

    defaults();
    process.env.DAILY_CALL_CAP = "1";
    await withModelRun(() => complete(input));
    const beforeDaily = requests;
    await assert.rejects(withModelRun(() => complete(input)), /DAILY_CALL_CAP/);
    assert.equal(requests, beforeDaily);

    defaults();
    process.env.MAX_CALLS_PER_RUN = "1";
    const beforeConcurrent = requests;
    const results = await withModelRun(() => Promise.allSettled([complete(input), complete(input), complete(input)]));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(requests, beforeConcurrent + 1);

    defaults();
    responseText = '{"items":[{"text":42,"topic":"invalid"}]}';
    const beforeInvalid = logged;
    await assert.rejects(withModelRun(() => complete(input)), /schema/);
    assert.equal(logged, beforeInvalid + 1);
    responseText = '{"items":[]}';
    stopReason = "max_tokens";
    await assert.rejects(withModelRun(() => complete(input)), /incomplete/);

    defaults();
    responseStatus = 429;
    const beforeRetry = requests;
    await assert.rejects(withModelRun(() => complete(input)));
    assert.equal(requests, beforeRetry + 1, "SDK retries are disabled");

    defaults();
    failLog = true;
    await withModelRun(async () => {
      await assert.rejects(complete(input), /log unavailable/);
      const beforeStopped = requests;
      await assert.rejects(complete(input), /withModelRun/);
      assert.equal(requests, beforeStopped);
    });
    assert.equal(estimateCost("claude-haiku-4-5", { inputTokens: 100, outputTokens: 20, cachedTokens: 10 }), 0.000201);
    assert.throws(() => estimateCost("unknown", { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }));
  } finally {
    globalThis.fetch = previousFetch;
    globalDb.vaultDb = previousPool;
    for (const name of Object.keys(process.env)) if (!(name in previousEnv)) Reflect.deleteProperty(process.env, name);
    Object.assign(process.env, previousEnv);
  }
});
