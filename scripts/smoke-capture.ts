import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { listCaptures, skipCaptures } from "../lib/db/queries";

loadEnvConfig(process.cwd());
const base = process.env.BASE_URL ?? "http://localhost:3000";
const token = process.env.SECRET_TOKEN;
let step = 0;
const ownIds: string[] = [];

async function check(label: string, run: () => Promise<void>) {
  step += 1;
  await run();
  console.log(`PASS ${step}: ${label}`);
}

function post(body: unknown, secret?: string) {
  return fetch(`${base}/api/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret === undefined ? {} : { SECRET_TOKEN: secret }) },
    body: JSON.stringify(body),
  });
}

async function main() {
  try {
    assert.ok(token, "SECRET_TOKEN must be configured.");
    await check("Missing token rejected", async () => {
      assert.equal((await post({ body: "smoke test — unauthorized" })).status, 401);
    });
    await check("Wrong token rejected", async () => {
      assert.equal((await post({ body: "smoke test — unauthorized" }, `${token}-wrong`)).status, 401);
    });
    await check("Empty body rejected", async () => {
      assert.equal((await post({ body: "" }, token)).status, 400);
    });
    let firstId = "";
    const started = Date.now();
    await check("Capture accepted with id and timestamp", async () => {
      const response = await post({ body: "smoke test — dump", device: "laptop" }, token);
      assert.equal(response.status, 201);
      const result = await response.json();
      assert.equal(typeof result.id, "string");
      assert.ok(result.id);
      assert.ok(Date.parse(result.capturedAt) >= started - 1000);
      firstId = result.id;
      ownIds.push(firstId);
    });
    await check("Database preserves raw capture and pending defaults", async () => {
      const row = (await listCaptures()).find((capture) => capture.id === firstId);
      assert.ok(row);
      assert.equal(row.body, "smoke test — dump");
      assert.equal(row.device, "laptop");
      assert.equal(row.status, "pending");
      assert.equal(row.kind, "text");
      assert.ok(Math.abs(Date.now() - row.capturedAt.getTime()) < 10_000);
    });
    let latestId = "";
    await check("Client cannot set kind or capture time", async () => {
      // Prefix every retained fixture so it is recognizable in the real inbox.
      const response = await post({ body: "smoke test — x", kind: "image", capturedAt: "1999-01-01", captured_at: "1999-01-01" }, token);
      assert.equal(response.status, 201);
      latestId = (await response.json()).id;
      ownIds.push(latestId);
      const row = (await listCaptures()).find((capture) => capture.id === latestId);
      assert.ok(row);
      assert.equal(row.kind, "text");
      assert.equal(row.status, "pending");
      assert.equal(row.body, "smoke test — x");
      assert.ok(Math.abs(Date.now() - row.capturedAt.getTime()) < 10_000);
    });
    await check("Authenticated log returns latest capture first", async () => {
      const response = await fetch(`${base}/api/captures`, { headers: { SECRET_TOKEN: token } });
      assert.equal(response.status, 200);
      const { captures } = await response.json();
      assert.equal(captures[0].id, latestId);
      assert.ok(captures.some((capture: { id: string }) => capture.id === firstId));
    });
    await check("Unauthenticated log rejected", async () => {
      assert.equal((await fetch(`${base}/api/captures`)).status, 401);
    });
    console.log("8/8 checks passed. Smoke captures will be marked skipped.");
  } catch {
    console.error(`FAIL ${step || "setup"}: capture acceptance check failed.`);
    process.exitCode = 1;
  } finally {
    try { await skipCaptures(ownIds); }
    finally { await closeDb(); }
  }
}

void main();
