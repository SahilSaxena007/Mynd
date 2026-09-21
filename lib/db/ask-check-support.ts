import assert from "node:assert/strict";
import type { Pool } from "pg";
import type { Ask, Capture, Note } from "./types";

// Offline database boundary: allowlisted operations only; unexpected writes fail.
// No connection is opened, and fixture vault rows are never writable.
export function askCheckDatabase() {
  const date = new Date("2026-09-21T12:00:00Z");
  const notes: Note[] = [{ id: "note-id", folderId: "folder-id", title: "things to buy",
    summary: null, body: "Buy cable, sauce and chair.", createdAt: date, updatedAt: date }];
  const captures: Capture[] = [{ id: "capture-id", body: "Also buy a lamp.", kind: "text",
    capturedAt: date, createdAt: date, processedAt: null, device: null, status: "pending" }];
  const vault = { notes, captures, folders: [{ id: "folder-id", name: "Personal" }],
    note_sources: [{ noteId: "note-id", captureId: "older-capture-id" }] };
  const asks: Ask[] = [];
  const modelCalls: unknown[][] = [];
  const writes: string[] = [];
  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        assert.match(sql, /^SELECT pg_advisory_(?:lock|unlock)\(715002\)$/);
        return { rows: [] };
      },
      release: () => {},
    }),
    query: async (sql: string, values: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT ") && normalized.includes(" FROM notes ORDER BY created_at, id")) {
        return { rows: structuredClone(notes) };
      }
      if (normalized.startsWith("SELECT ") && normalized.includes(" FROM captures WHERE status = 'pending'")) {
        assert.deepEqual(values, [null]);
        return { rows: structuredClone(captures) };
      }
      if (normalized.startsWith("SELECT count(*) AS count FROM model_calls")) {
        return { rows: [{ count: String(modelCalls.length) }] };
      }
      if (normalized.startsWith("INSERT INTO model_calls ")) {
        writes.push("model_calls");
        modelCalls.push(structuredClone(values));
        return { rows: [] };
      }
      if (normalized.startsWith("INSERT INTO asks ")) {
        assert.match(normalized, /\(question, answer, answered, citations, input_tokens, output_tokens, cost_usd\) VALUES \(\$1, \$2, \$3, \$4::jsonb, \$5, \$6, \$7\)/);
        const [question, answer, answered, citations, inputTokens, outputTokens, costUsd] = values;
        const ask = { id: `ask-${asks.length + 1}`, question, answer, answered,
          citations: JSON.parse(String(citations)), inputTokens, outputTokens, costUsd,
          createdAt: new Date(date.getTime() + asks.length) } as Ask;
        asks.push(ask);
        writes.push("asks");
        return { rows: [structuredClone(ask)] };
      }
      if (normalized.startsWith("SELECT ") && normalized.includes(" FROM asks ORDER BY created_at DESC, id DESC LIMIT $1")) {
        return { rows: structuredClone([...asks].reverse().slice(0, Number(values[0]))) };
      }
      throw new Error(`Unexpected database operation in Ask check: ${normalized}`);
    },
  } as unknown as Pool;
  return { pool, vault, asks, modelCalls, writes };
}
