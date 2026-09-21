import assert from "node:assert/strict";
import { createFolder, createNote, getCapturesByIds, getLastOrganizeRun, getPendingCaptures,
  insertCapture, insertOrganizeRun, listFolders, markCaptureFailed, markCaptureProcessed, skipCaptures } from "../lib/db/queries";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { injectOrganizeFailure, organizeRowCounts, organizeRunCount, withOrganizeCheckSchema } from "../lib/db/organize-check-support";
import { withTransaction } from "../lib/db/transaction";
import { ModelProviderError } from "../lib/model/errors";
import { recordModelCost } from "../lib/model/guard";
import { runOrganize } from "../lib/organizer";
import { newRunRecord, runError } from "../lib/organizer/run-record";
import { completeSplit } from "../lib/organizer/split-coverage";
import type { RoutePlan } from "../lib/organizer/route-types";

type Stages = NonNullable<Parameters<typeof runOrganize>[1]>;
const date = new Date("2026-07-15T22:30:00Z");
const privateText = "DISTINCTIVE_PRIVATE_CAPTURE_CANARY";
const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, thinkingTokens: 0 };
const model = "claude-haiku-4-5";
const stages: Stages = {
  splitCapture: async (capture) => ({ model, usage,
    data: completeSplit(capture.body, [{ topic: "test", quotes: [capture.body] }]) }),
  routeItems: async (refs) => ({ model, usage, data: {
    new_notes: [{ ref: "X1", folder: "personal", title: "test note", summary: "test" }],
    placements: [{ item: refs.items[0].ref, note: "X1", markdown: refs.items[0].text, confidence: "sure", options: [] }],
  } }),
};
async function fixture() {
  await createFolder({ slug: "personal", name: "Personal" });
  return Promise.all([insertCapture({ body: privateText, capturedAt: date }),
    insertCapture({ body: "other capture", capturedAt: new Date(date.getTime() + 1) })]);
}
async function noVaultWrites() {
  assert.deepEqual(await organizeRowCounts(), { notes: 0, sources: 0, calls: 0, modelCalls: 0 });
}
const run = (overrides: Partial<Stages> = {}) => runOrganize({ trigger: "cron" }, { ...stages, ...overrides });

export async function checkOrganizeRuns(pass: (label: string) => void) {
  const settings = ["ORGANIZE_MODEL", "ROUTE_MODEL", "ROUTE_THINKING_BUDGET", "USER_TIMEZONE"] as const;
  const previous = settings.map((key) => process.env[key]);
  process.env.ORGANIZE_MODEL = model;
  process.env.ROUTE_MODEL = model;
  process.env.ROUTE_THINKING_BUDGET = "2048";
  process.env.USER_TIMEZONE = "Europe/London";
  try {
    await withOrganizeCheckSchema(async () => {
      const captures = await fixture();
      await createNote({ folderId: (await listFolders())[0].id, title: "existing", body: "before" });
      await run({ routeItems: async (refs) => ({ model, usage, data: {
        new_notes: [{ ref: "X1", folder: "personal", title: "new", summary: "" }],
        placements: refs.items.map((item, index) => ({ item: item.ref, note: index ? "N1" : "X1",
          markdown: item.text, confidence: "sure", options: [] })),
      } satisfies RoutePlan }) });
      const record = (await getLastOrganizeRun())!;
      assert.equal(await organizeRunCount(), 1);
      assert.equal(record.status, "ok");
      assert.equal(record.trigger, "cron");
      assert.equal(record.capturesProcessed, captures.length);
      assert.equal(record.itemsFiled, 2);
      assert.equal(record.itemsQueued, 0);
      assert.equal(record.notesCreated, 1);
      assert.equal(record.notesAppended, 1);
      assert.equal(record.error, null);
      assert.equal(record.failedCaptureId, null);
      assert.ok(record.finishedAt >= record.startedAt);
      assert.deepEqual(await getPendingCaptures(), []);
      // Code enforces DM11, including accidental future callers inside a transaction.
      await assert.rejects(withTransaction(() => insertOrganizeRun(newRunRecord("manual"))));
      assert.equal(await organizeRunCount(), 1);
    });
    pass("successful run recorded once with committed counts, outside apply transaction");

    await withOrganizeCheckSchema(async () => {
      assert.equal(await getLastOrganizeRun(), null);
      const forbidden = async (): Promise<never> => { throw new Error("No model stage may run"); };
      await run({ splitCapture: forbidden, routeItems: forbidden });
      const record = (await getLastOrganizeRun())!;
      assert.equal(await organizeRunCount(), 1);
      assert.equal(record.status, "nothing_pending");
      for (const key of ["capturesProcessed", "itemsFiled", "itemsQueued", "notesCreated", "notesAppended", "costUsd"] as const) {
        assert.equal(record[key], 0);
      }
      await noVaultWrites();
    });
    pass("nothing pending records zero counts and cost without calling model stages");

    await withOrganizeCheckSchema(async () => {
      const captures = await fixture();
      for (const status of [401, 429, 500]) {
        await assert.rejects(run({ splitCapture: async () => {
          throw new ModelProviderError(status, "api_error", privateText);
        } }), new RegExp(`split failed: HTTP ${status} api_error`));
        const record = (await getLastOrganizeRun())!;
        assert.equal(record.status, "failed");
        assert.equal(record.failedCaptureId, null);
        assert.deepEqual(await getPendingCaptures(), captures);
        await noVaultWrites();
      }
      assert.equal(await organizeRunCount(), 3);
    });
    pass("Stage 1 provider failures record failure and leave every capture pending");

    for (const message of ["Model response did not match the output schema.", "Model response incomplete or refused (stop_reason: max_tokens)."] ) {
      await withOrganizeCheckSchema(async () => {
        const captures = await fixture();
        let attempts = 0;
        await assert.rejects(run({ splitCapture: async () => {
          attempts++;
          recordModelCost(0.012345); // Simulate a billed but unusable response, without a model call.
          throw new Error(message);
        } }), /split failed/);
        assert.equal(attempts, 1);
        const record = (await getLastOrganizeRun())!;
        assert.equal(record.status, "failed");
        assert.equal(record.failedCaptureId, captures[0].id);
        assert.equal(record.costUsd, 0.012345);
        const stored = await getCapturesByIds(captures.map((capture) => capture.id));
        assert.equal(stored[0].status, "failed");
        assert.equal(stored[0].body, privateText);
        assert.equal(stored[1].status, "pending");
        await noVaultWrites();
        await run(); // The next run can process the remaining capture.
        assert.equal((await getLastOrganizeRun())?.capturesProcessed, 1);
      });
    }
    pass("unusable Stage 1 output fails only its capture, records billed cost, stops, and next run proceeds");

    await withOrganizeCheckSchema(async () => {
      const captures = await fixture();
      for (const error of [new Error(privateText), new ModelProviderError(429, "rate_limit_error", privateText)]) {
        await assert.rejects(run({ routeItems: async () => { throw error; } }), /route failed/);
        assert.equal((await getLastOrganizeRun())?.failedCaptureId, null);
        assert.equal((await getLastOrganizeRun())?.status, "failed");
        assert.deepEqual(await getPendingCaptures(), captures);
        await noVaultWrites();
      }
    });
    pass("Stage 2 failures never blame a capture");

    await withOrganizeCheckSchema(async () => {
      const captures = await fixture();
      await injectOrganizeFailure();
      await assert.rejects(run(), /apply failed/);
      assert.equal(await organizeRunCount(), 1);
      const record = (await getLastOrganizeRun())!;
      assert.equal(record.status, "failed");
      assert.equal(record.error, "apply failed.");
      assert.equal(record.capturesProcessed + record.itemsFiled + record.itemsQueued + record.notesCreated + record.notesAppended, 0);
      assert.equal(record.failedCaptureId, null);
      assert.deepEqual(await getPendingCaptures(), captures);
      await noVaultWrites();
    });
    pass("failed apply rolls back notes, sources and queues but leaves a committed failed run record");

    await withOrganizeCheckSchema(async () => {
      const captures = await fixture();
      await markCaptureProcessed(captures[0].id);
      await skipCaptures([captures[1].id]);
      const before = await getCapturesByIds(captures.map((capture) => capture.id));
      assert.equal(await markCaptureFailed(captures[0].id), false);
      assert.equal(await markCaptureFailed(captures[1].id), false);
      assert.deepEqual(await getCapturesByIds(captures.map((capture) => capture.id)), before);
    });
    pass("markCaptureFailed cannot alter a processed or skipped capture");

    await withOrganizeCheckSchema(async () => {
      await fixture();
      const logs: string[] = [];
      const log = console.log;
      try {
        console.log = (...values: unknown[]) => { logs.push(values.join(" ")); };
        await assert.rejects(run({ splitCapture: async () => {
          throw new ModelProviderError(429, privateText, privateText);
        } }), (error: unknown) => error instanceof Error && error.message === "split failed: HTTP 429 api_error."
          && error.cause === undefined);
        const record = (await getLastOrganizeRun())!;
        assert.ok(!record.error!.includes(privateText));
        assert.equal(runError("route", Object.assign(new Error(privateText), { name: privateText })), "route failed.");
        assert.ok(!logs.join("\n").includes(privateText));
      } finally { console.log = log; }
    });
    pass("operational errors cannot contain capture text, raw messages, causes or untrusted provider types");

    const directory = await mkdtemp(join(tmpdir(), "mynd-dry-check-"));
    try {
      await withOrganizeCheckSchema(async () => {
        const captures = await fixture();
        await runOrganize({ dry: true, directory }, stages);
        await assert.rejects(runOrganize({ dry: true, directory }, { ...stages,
          splitCapture: async () => { throw new Error(privateText); } }), /split failed/);
        assert.equal(await organizeRunCount(), 0);
        assert.deepEqual(await getPendingCaptures(), captures);
        await noVaultWrites();
      });
    } finally {
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
      await rm(directory, { recursive: true, force: true });
    }
    pass("dry previews never record runs or mark captures failed");
  } finally {
    settings.forEach((key, index) => {
      if (previous[index] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = previous[index];
    });
  }
}
