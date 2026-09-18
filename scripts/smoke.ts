import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import * as db from "../lib/db/queries";
import { JOURNAL_DESC, SEED_FOLDERS, seed } from "../lib/db/seed";
import { deactivateSmokeRule, hasNoteSource, withSmokeSchema } from "../lib/db/smoke-support";
import { requireToken } from "../lib/auth";

let step = "initialization";
let passed = 0;
function pass(label: string) {
  passed += 1;
  console.log(`PASS ${passed}: ${label}`);
}

async function acceptanceTest() {
  await withSmokeSchema(async () => {
    step = "1. Insert capture";
    const capturedAt = new Date();
    const capture = await db.insertCapture({ body: "test dump", capturedAt, device: "laptop" });
    assert.equal(capture.body, "test dump");
    assert.equal(capture.kind, "text");
    assert.equal(capture.device, "laptop");
    assert.equal(capture.status, "pending");
    assert.equal(capture.processedAt, null);
    assert.equal(capture.capturedAt.getTime(), capturedAt.getTime());
    pass("Insert capture; raw body, timestamps, and defaults preserved");

    step = "2. Create Journal folder";
    const folder = await db.createFolder({ name: "Journal", slug: "journal", description: JOURNAL_DESC, color: "#6aa5b8" });
    assert.deepEqual(await db.getFolderBySlug("journal"), folder);
    assert.deepEqual(await db.listFolders(), [folder]);
    assert.equal(await db.getFolderBySlug("missing"), null);
    pass("Create Journal folder; list and slug lookup agree");

    step = "3. Create note";
    const original = "# 2026-01-01\n- test";
    const note = await db.createNote({ folderId: folder.id, title: "2026-01-01", summary: "journal for the day", body: original });
    assert.deepEqual(await db.getNote(note.id), note);
    assert.equal(await db.getNote(randomUUID()), null);
    assert.deepEqual(await db.getNoteSummaries(), [{ id: note.id, title: note.title, summary: note.summary, folderId: folder.id }]);
    const vault = await db.getVault();
    assert.deepEqual(vault.folders, [folder]);
    const { body: omittedBody, ...meta } = note;
    assert.equal(omittedBody, original);
    assert.deepEqual(vault.notes, [meta]);
    pass("Create/read note; summaries and vault metadata are correct");

    step = "4. Link provenance";
    await db.linkNoteToCapture(note.id, capture.id);
    await db.linkNoteToCapture(note.id, capture.id);
    assert.equal(await hasNoteSource(note.id, capture.id), true);
    pass("Link note to capture; repeated linking is safe");

    step = "5. Safe append";
    const appended = await db.appendToNote(note.id, "- second entry");
    assert.equal(appended.body, `${original}\n- second entry`);
    assert.equal(appended.title, note.title);
    assert.equal(appended.summary, note.summary);
    assert.ok(appended.updatedAt >= note.updatedAt);
    assert.deepEqual(await db.getNote(note.id), appended);
    await assert.rejects(db.appendToNote(randomUUID(), "missing"), /Note not found/);
    pass("Safe append preserves the exact original body and persists the new block");

    step = "6. Process capture";
    assert.deepEqual(await db.getPendingCaptures(), [capture]);
    await db.markCaptureProcessed(capture.id);
    assert.deepEqual(await db.getPendingCaptures(), []);
    await assert.rejects(db.markCaptureProcessed(randomUUID()), /Capture not found/);
    pass("Capture changes from pending to processed");

    step = "7. Active rules";
    assert.deepEqual(await db.listActiveRules(), []);
    const rule = await db.createRule({ kind: "route", instruction: "Always file reflections in Journal." });
    assert.equal(rule.active, true);
    assert.deepEqual(await db.listActiveRules(), [rule]);
    await deactivateSmokeRule(rule.id);
    assert.deepEqual(await db.listActiveRules(), []);
    pass("Create/list rules; inactive rules are excluded");
  });
  pass("All acceptance fixtures and the temporary schema rolled back");
}

async function rollbackTest() {
  step = "Transaction rollback after foreign-key failure";
  const slug = `smoke-rollback-${randomUUID()}`;
  let noteId = "";
  let captureId = "";
  await assert.rejects(db.withTransaction(async () => {
    const folder = await db.createFolder({ name: "Rollback test", slug });
    const capture = await db.insertCapture({ body: "rollback test", capturedAt: new Date() });
    captureId = capture.id;
    const note = await db.createNote({ folderId: folder.id, title: "Rollback", body: "original" });
    noteId = note.id;
    await db.appendToNote(note.id, "appended");
    await db.linkNoteToCapture(note.id, capture.id);
    await db.linkNoteToCapture(note.id, randomUUID());
  }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23503");
  assert.equal(await db.getFolderBySlug(slug), null);
  assert.equal(await db.getNote(noteId), null);
  assert.ok(!(await db.getPendingCaptures()).some((capture) => capture.id === captureId));
  assert.equal(await hasNoteSource(noteId, captureId), false);
  pass("Foreign-key failure rolls back folder, capture, note, append, and provenance");
}

async function seedTest() {
  step = "Committed seed folders and repeatability";
  const before = await db.listFolders();
  const first = await seed();
  const second = await seed();
  assert.deepEqual(second, first);
  for (const expected of SEED_FOLDERS) {
    const folder = await db.getFolderBySlug(expected.slug);
    assert.ok(folder);
    // Existing user edits must survive reruns. Fresh folders match the spec exactly.
    const existing = before.find((row) => row.slug === expected.slug);
    if (existing) assert.deepEqual(folder, existing);
    else {
      assert.equal(folder.name, expected.name);
      assert.equal(folder.description, expected.description);
      assert.equal(folder.color, expected.color);
    }
  }
  const expectedCount = before.length + SEED_FOLDERS.filter((input) => !before.some((row) => row.slug === input.slug)).length;
  assert.equal((await db.listFolders()).length, expectedCount);
  pass("Journal and Inbox committed; seed rerun preserves folders without duplicates");
}

function authTest() {
  step = "Token stub";
  const previous = process.env.SECRET_TOKEN;
  try {
    process.env.SECRET_TOKEN = randomUUID();
    requireToken(new Request("http://localhost", { headers: { SECRET_TOKEN: process.env.SECRET_TOKEN } }));
    assert.throws(() => requireToken(new Request("http://localhost")), (error: unknown) => error instanceof Response && error.status === 401);
    assert.throws(() => requireToken(new Request("http://localhost", { headers: { SECRET_TOKEN: "wrong" } })), (error: unknown) => error instanceof Response && error.status === 401);
    delete process.env.SECRET_TOKEN;
    assert.throws(() => requireToken(new Request("http://localhost")), /must be configured/);
  } finally {
    if (previous === undefined) delete process.env.SECRET_TOKEN;
    else process.env.SECRET_TOKEN = previous;
  }
  pass("Token stub accepts the configured token and rejects missing/incorrect tokens");
}

async function main() {
  loadEnvConfig(process.cwd());
  try {
    await acceptanceTest();
    await rollbackTest();
    await seedTest();
    authTest();
    console.log(`\n${passed}/${passed} checks passed. No smoke-test data retained.`);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "assertion/setup error";
    console.error(`FAIL: ${step} (${code}).`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
