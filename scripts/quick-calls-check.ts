import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withDatabase } from "../lib/db/client";
import { checkId, quickCallsCheckDatabase } from "../lib/db/quick-calls-check-support";
import { createRule, getOpenQuickCalls, listActiveRules, resolveQuickCall, setRuleActive } from "../lib/db/queries";
import { buildRefs, routeInput } from "../lib/organizer/refs";
import { gatherForOrganize } from "../lib/organizer/stage0-gather";
import { newRunRecord, runError } from "../lib/organizer/run-record";
import { ModelProviderError } from "../lib/model/errors";
import { checkModelBudget, withModelRun } from "../lib/model/guard";
import { GET as getCalls } from "../app/api/quick-calls/route";
import { POST as resolveCall } from "../app/api/quick-calls/[id]/route";
import { GET as getRules, POST as saveRule, PATCH as switchRule } from "../app/api/rules/route";

async function main() {
  const previousFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden in this check"); };
  const settings = { SECRET_TOKEN: "offline-quick-calls-check", MAX_TOKENS_PER_CALL: "8000",
    MAX_CALLS_PER_RUN: "10", DAILY_CALL_CAP: "10" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const request = (method: string, body?: unknown, authenticated = true) => new Request("http://offline/api", {
    method, headers: authenticated ? { SECRET_TOKEN: settings.SECRET_TOKEN, "Content-Type": "application/json" } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const db = quickCallsCheckDatabase();
  let passed = 0;
  const pass = (label: string) => console.log(`${++passed}. PASS: ${label}`);
  try {
    await withDatabase(db.pool, async () => {
      const call = db.state.calls[0];
      const before = db.state.notes[0].body;
      assert.deepEqual(await resolveQuickCall(call.id, { action: "file", noteId: checkId(2) }), { ok: true });
      assert.equal(db.state.notes[0].body, `${before}\n${call.itemText}`);
      assert.deepEqual(db.state.links, [{ noteId: checkId(2), captureId: call.captureId }]);
      assert.equal(db.state.calls[0].status, "resolved");
      assert.ok(db.state.calls[0].resolvedAt);
      assert.equal(db.events.filter((event) => event === "BEGIN").length, 1);
      assert.equal(db.events.filter((event) => event === "COMMIT").length, 1);
      // Both provenance and final status failure must undo every preceding write.
      for (const prefix of ["INSERT INTO note_sources", "UPDATE quick_calls"]) {
        const failed = db.addCall();
        const snapshot = structuredClone(db.state);
        db.failNext(prefix);
        await assert.rejects(resolveQuickCall(failed.id, { action: "file", noteId: checkId(2) }), /Injected/);
        assert.deepEqual(db.state, snapshot);
      }
      pass("verbatim append, provenance and status share one transaction; failed writes roll back");

      const checklist = db.addCall();
      await resolveQuickCall(checklist.id, { action: "file", noteId: checkId(5) });
      assert.equal(db.state.notes[1].body, `- [x] Cable\n- [ ] ${checklist.itemText}`);
      assert.equal(db.state.notes[0].body, `${before}\n${call.itemText}`);
      pass("checklist gets only a - [ ] prefix; ordinary note gets none; whitespace stays verbatim");

      const fresh = db.addCall();
      const folders = structuredClone(db.state.folders);
      await resolveQuickCall(fresh.id, { action: "file", folderId: checkId(1), newNoteTitle: "Beauty" });
      const newNote = db.state.notes.at(-1)!;
      assert.equal(newNote.title, "Beauty");
      assert.equal(newNote.folderId, checkId(1));
      assert.equal(newNote.body, `\n${fresh.itemText}`);
      assert.ok(db.state.links.some((link) => link.noteId === newNote.id && link.captureId === fresh.captureId));
      assert.deepEqual(db.state.folders, folders);
      const invalid = db.addCall();
      const snapshot = structuredClone(db.state);
      await assert.rejects(resolveQuickCall(invalid.id, { action: "file", folderId: checkId(999), newNoteTitle: "Missing" }));
      await assert.rejects(resolveQuickCall(invalid.id, { action: "file", noteId: checkId(999) }));
      assert.deepEqual(db.state, snapshot);
      db.failNext("INSERT INTO note_sources");
      await assert.rejects(resolveQuickCall(invalid.id, { action: "file", folderId: checkId(1), newNoteTitle: "Rollback" }));
      assert.deepEqual(db.state, snapshot);
      pass("new note uses an existing folder; missing targets and failed new-note filing write nothing");

      const dismiss = db.addCall("Right,");
      const notes = structuredClone(db.state.notes), rules = structuredClone(db.state.rules), links = structuredClone(db.state.links);
      await resolveQuickCall(dismiss.id, { action: "dismiss" });
      assert.deepEqual(db.state.notes, notes);
      assert.deepEqual(db.state.rules, rules);
      assert.deepEqual(db.state.links, links);
      assert.equal(db.state.calls.find((entry) => entry.id === dismiss.id)?.status, "dismissed");
      assert.ok(db.state.calls.find((entry) => entry.id === dismiss.id)?.resolvedAt);
      pass("dismissal records its status and time without touching notes, provenance or rules");

      const resolved = structuredClone(db.state);
      assert.deepEqual(await resolveQuickCall(call.id, { action: "file", noteId: checkId(2) }), { ok: false, reason: "conflict" });
      assert.deepEqual(await resolveQuickCall(dismiss.id, { action: "dismiss" }), { ok: false, reason: "conflict" });
      assert.deepEqual(await resolveQuickCall(checkId(999), { action: "dismiss" }), { ok: false, reason: "gone" });
      assert.deepEqual(db.state, resolved);
      const concurrent = db.addCall("Once only.");
      const oldBody = db.state.notes[0].body;
      const results = await Promise.all([1, 2].map(() => resolveQuickCall(concurrent.id, { action: "file", noteId: checkId(2) })));
      assert.deepEqual(results, [{ ok: true }, { ok: false, reason: "conflict" }]);
      assert.equal(db.state.notes[0].body, `${oldBody}\nOnce only.`);
      const conflict = await resolveCall(request("POST", { action: "dismiss" }), { params: Promise.resolve({ id: concurrent.id }) });
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).reason, "conflict");
      pass("resolved/dismissed calls conflict without changes; overlapping attempts append once");

      const instruction = "  Shopping items go in Personal / things to buy.\nKeep my words.  ";
      const response = await saveRule(request("POST", { kind: "routing", instruction }));
      assert.equal(response.status, 201);
      const { rule } = await response.json();
      assert.equal(rule.instruction, instruction);
      const ruleCount = db.state.rules.length;
      for (const empty of ["", " \n\t"]) {
        assert.deepEqual(await (await saveRule(request("POST", { kind: "routing", instruction: empty }))).json(), { rule: null });
        await assert.rejects(createRule({ kind: "routing", instruction: empty }));
      }
      assert.equal(db.state.rules.length, ruleCount);
      const input = async () => {
        const gathered = await gatherForOrganize(10);
        return routeInput(buildRefs(gathered.captures, gathered.folders, gathered.notes, gathered.rules, [], "Europe/London"));
      };
      assert.deepEqual((await input()).rules, [instruction]);
      pass("rule text is exact, empty text writes nothing, and the rule reaches routing input without a model");

      assert.equal(await setRuleActive(rule.id, false), true);
      assert.deepEqual(await listActiveRules(), []);
      assert.deepEqual((await input()).rules, []);
      assert.equal(db.state.rules.length, ruleCount);
      assert.equal(db.state.rules[0].instruction, instruction);
      assert.equal(db.state.rules[0].active, false);
      assert.equal(await setRuleActive(checkId(999), false), false);
      assert.equal((await switchRule(request("PATCH", { id: rule.id, active: true }))).status, 200);
      assert.deepEqual((await input()).rules, [instruction]);
      assert.equal((await switchRule(request("PATCH", { id: rule.id, active: false }))).status, 200);
      pass("turning off hides a retained rule from active rules and routing; re-enabling restores it");

      const record = newRunRecord("cron");
      await withModelRun(async () => {
        try { checkModelBudget(16000); assert.fail("Guard must refuse"); }
        catch (error) { record.error = runError("route", error); }
      });
      assert.equal(record.error, "route failed: Model call refused: MAX_TOKENS_PER_CALL exceeded.");
      for (const message of ["private capture text", "Model call refused: private capture text.",
        "Model call refused: MAX_TOKENS_PER_CALL exceeded. private capture text", "Model response did not match the output schema."]) {
        assert.equal(runError("route", new Error(message)), "route failed.");
      }
      assert.equal(runError("split", new SyntaxError("secret capture")), "split failed.");
      assert.equal(runError("route", new ModelProviderError(429, "rate_limit_error", "private")), "route failed: HTTP 429 rate_limit_error.");
      pass("actual guard refusal survives in the record; arbitrary errors stay bare and provider text stays hidden");

      const querySource = await readFile("lib/db/queries.ts", "utf8");
      const resolver = querySource.slice(querySource.indexOf("export async function resolveQuickCall"), querySource.indexOf("export async function listCaptures"));
      assert.ok(resolver.length);
      assert.doesNotMatch(resolver, /createFolder|\bDELETE\b|\bcomplete\s*\(/);
      for (const path of ["app/api/quick-calls/route.ts", "app/api/quick-calls/[id]/route.ts", "app/api/rules/route.ts",
        "app/quick-calls/page.tsx", "components/QuickCallCard.tsx"]) {
        const source = await readFile(path, "utf8");
        assert.doesNotMatch(source, /createFolder|\bDELETE\b|lib\/model|lib\/organizer/);
      }
      assert.match(await readFile("app/quick-calls/page.tsx", "utf8"), /^"use client";/);
      // All new endpoints authenticate before touching the database.
      const eventCount = db.events.length;
      for (const handler of [getCalls, getRules]) assert.equal((await handler(request("GET", undefined, false))).status, 401);
      assert.equal((await saveRule(request("POST", {}, false))).status, 401);
      assert.equal((await switchRule(request("PATCH", {}, false))).status, 401);
      assert.equal((await resolveCall(request("POST", {}, false), { params: Promise.resolve({ id: call.id }) })).status, 401);
      assert.equal(db.events.length, eventCount);
      assert.equal((await resolveCall(request("POST", { action: "file", newFolderName: "Forbidden" }),
        { params: Promise.resolve({ id: call.id }) })).status, 400);
      const offered = db.addCall();
      db.state.calls.find((entry) => entry.id === offered.id)!.options = [
        { label: "old", folder: "personal", note: checkId(5), new_note_title: "", new_folder_name: "" },
        { label: "new", folder: "personal", note: "", new_note_title: "Beauty", new_folder_name: "" },
        { label: "folder", folder: "", note: "", new_note_title: "", new_folder_name: "Other" },
      ];
      const listed = await (await getCalls(request("GET"))).json();
      const choices = listed.quickCalls.find((entry: { id: string }) => entry.id === offered.id).choices;
      assert.equal(choices[0].label, "Personal · things to buy");
      assert.deepEqual(choices[0].resolution, { action: "file", noteId: checkId(5) });
      assert.deepEqual(choices[1].resolution, { action: "file", folderId: checkId(1), newNoteTitle: "Beauty" });
      assert.equal(choices[2].resolution, null);
      assert.deepEqual(listed.quickCalls.map((entry: { id: string }) => entry.id), (await getOpenQuickCalls()).map((entry) => entry.id));
      pass("no folder creation or model calls in the resolve path; authenticated options resolve real destination names");
    });
    assert.equal(networkCalls, 0);
    assert.equal(passed, 9);
    console.log("9/9 checks passed. Zero model calls, zero HTTP, zero database connections. Live vault untouched.");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
