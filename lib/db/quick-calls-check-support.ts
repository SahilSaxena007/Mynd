import assert from "node:assert/strict";
import type { Pool } from "pg";
import type { Folder, Note, QuickCall, Rule } from "./types";

export const checkId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Offline allowlisted SQL boundary, mirroring the other slice checks. Transactions
// serialize, snapshot and roll back; no real database or model transport is used.
export function quickCallsCheckDatabase() {
  const date = new Date("2026-09-22T12:00:00Z");
  const folder: Folder = { id: checkId(1), name: "Personal", slug: "personal", description: null,
    color: null, parentId: null, createdAt: date };
  const note: Note = { id: checkId(2), folderId: folder.id, title: "thoughts", summary: null,
    body: "Existing bytes.  \n", createdAt: date, updatedAt: date };
  const call: QuickCall = { id: checkId(4), captureId: checkId(3), topic: "shopping items",
    itemText: "  face creams\nwith SPF 30 — maybe.  ", options: [], reason: "unsure",
    status: "open", createdAt: date, resolvedAt: null };
  let state = { folders: [folder], notes: [note, { ...note, id: checkId(5), title: "things to buy", body: "- [x] Cable" }],
    calls: [call], rules: [] as Rule[], links: [] as { noteId: string; captureId: string }[] };
  let tail = Promise.resolve();
  let nextId = 100;
  let failAt = "";
  const events: string[] = [];
  const run = async (sql: string, values: unknown[] = [], inTransaction = false, locked?: Set<string>) => {
    const text = sql.replace(/\s+/g, " ").trim();
    events.push(text);
    if (failAt && text.startsWith(failAt)) { failAt = ""; throw new Error("Injected write failure"); }
    const rows = (items: unknown[]) => ({ rows: structuredClone(items), rowCount: items.length });
    if (text.startsWith("SELECT ") && text.includes(" FROM quick_calls ")) {
      if (text.includes("WHERE id = $1")) {
        assert.ok(inTransaction);
        assert.ok(text.endsWith("FOR UPDATE"));
        locked!.add(String(values[0]));
        return rows(state.calls.filter((entry) => entry.id === values[0]));
      }
      assert.match(text, /WHERE status = 'open' ORDER BY created_at, id$/);
      return rows(state.calls.filter((entry) => entry.status === "open")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)));
    }
    if (text.startsWith("SELECT ") && text.includes(" FROM folders ")) {
      if (text.includes("WHERE id = $1")) {
        assert.ok(inTransaction);
        assert.ok(text.endsWith("FOR KEY SHARE"));
        return rows(state.folders.filter((entry) => entry.id === values[0]));
      }
      return rows(state.folders);
    }
    if (text.startsWith("SELECT ") && text.includes(" FROM notes ")) {
      return rows(text.includes("WHERE id = $1") ? state.notes.filter((entry) => entry.id === values[0]) : state.notes);
    }
    if (text.startsWith("SELECT ") && text.includes(" FROM captures WHERE status = 'pending'")) return rows([]);
    if (text.startsWith("INSERT INTO notes ")) {
      assert.ok(inTransaction && locked!.size);
      const fresh = { ...note, id: checkId(nextId++), folderId: String(values[0]), title: String(values[1]),
        summary: values[2] as string | null, body: String(values[3]) };
      state.notes.push(fresh);
      return rows([fresh]);
    }
    if (text.startsWith("UPDATE notes ")) {
      assert.ok(inTransaction && locked!.size);
      assert.ok(sql.includes("body = body || E'\n' || $2"));
      const target = state.notes.find((entry) => entry.id === values[0]);
      if (!target) return rows([]);
      target.body += `\n${values[1]}`;
      return rows([target]);
    }
    if (text.startsWith("INSERT INTO note_sources ")) {
      assert.ok(inTransaction && locked!.size);
      assert.match(text, /ON CONFLICT \(note_id, capture_id\) DO NOTHING$/);
      if (!state.links.some((entry) => entry.noteId === values[0] && entry.captureId === values[1])) {
        state.links.push({ noteId: String(values[0]), captureId: String(values[1]) });
      }
      return rows([]);
    }
    if (text === "UPDATE quick_calls SET status = $2, resolved_at = now() WHERE id = $1") {
      assert.ok(inTransaction && locked!.has(String(values[0])));
      const target = state.calls.find((entry) => entry.id === values[0])!;
      assert.equal(target.status, "open");
      target.status = values[1] as QuickCall["status"];
      target.resolvedAt = date;
      return rows([target]);
    }
    if (text.startsWith("INSERT INTO rules ")) {
      const rule: Rule = { id: checkId(nextId++), kind: String(values[0]), instruction: String(values[1]), active: true, createdAt: date };
      state.rules.push(rule);
      return rows([rule]);
    }
    if (text.startsWith("SELECT ") && text.includes(" FROM rules WHERE active = true ORDER BY created_at, id")) {
      return rows(state.rules.filter((rule) => rule.active));
    }
    if (text === "UPDATE rules SET active = $2 WHERE id = $1") {
      const rule = state.rules.find((entry) => entry.id === values[0]);
      if (!rule) return rows([]);
      rule.active = values[1] as boolean;
      return rows([rule]);
    }
    throw new Error(`Unexpected database operation: ${text}`);
  };
  const pool = {
    query: (sql: string, values?: unknown[]) => run(sql, values),
    connect: async () => {
      let releaseLock: (() => void) | undefined;
      let snapshot: typeof state | undefined;
      const locked = new Set<string>();
      let active = false;
      return {
        query: async (sql: string, values?: unknown[]) => {
          if (sql === "BEGIN") {
            const previous = tail;
            tail = new Promise<void>((resolve) => { releaseLock = resolve; });
            await previous;
            snapshot = structuredClone(state);
            active = true;
            events.push(sql);
            return { command: sql };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            assert.ok(active);
            if (sql === "ROLLBACK") state = snapshot!;
            active = false;
            events.push(sql);
            releaseLock!();
            return { command: sql };
          }
          return run(sql, values, active, locked);
        },
        release: () => { assert.equal(active, false); },
      };
    },
  } as unknown as Pool;
  return { pool, events, get state() { return state; }, failNext: (prefix: string) => { failAt = prefix; },
    addCall: (text = call.itemText) => {
      const fresh = { ...call, id: checkId(nextId++), itemText: text, status: "open" as const, resolvedAt: null };
      state.calls.push(fresh);
      return structuredClone(fresh);
    } };
}
