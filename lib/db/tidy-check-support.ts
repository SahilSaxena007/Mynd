import assert from "node:assert/strict";
import type { Pool } from "pg";
import type { EditableNote } from "./queries";
import type { NoteVersion } from "./note-versions";

// Offline SQL boundary: reject unknown statements and enforce versions-before-write.
export function tidyCheckDatabase(notes: EditableNote[]) {
  let state = { notes: structuredClone(notes), versions: [] as NoteVersion[], sources: notes.map((note) => ({ noteId: note.id, captureId: note.id })) };
  let snapshot: typeof state | undefined;
  const events: string[] = [];
  let fail = "";
  let counter = 0;
  const run = async (sql: string, values: unknown[] = []) => {
    const text = sql.replace(/\s+/g, " ").trim();
    events.push(text);
    if (fail && text.startsWith(fail)) { fail = ""; throw new Error("Injected failure"); }
    const rows = (data: unknown[]) => ({ rows: structuredClone(data), rowCount: data.length });
    if (text === "BEGIN") { assert.equal(snapshot, undefined); snapshot = structuredClone(state); return rows([]); }
    if (text === "COMMIT") { snapshot = undefined; return { ...rows([]), command: "COMMIT" }; }
    if (text === "ROLLBACK") { state = snapshot!; snapshot = undefined; return rows([]); }
    if (text.startsWith("SELECT ") && text.includes(" FROM folders ")) return rows([]);
    if (text.startsWith("SELECT ") && text.includes(" FROM notes ")) {
      let selected = state.notes;
      if (text.includes("id = ANY")) selected = selected.filter((note) => (values[0] as string[]).includes(note.id));
      else if (text.includes("WHERE id = $1")) selected = selected.filter((note) => note.id === values[0]);
      else assert.ok(text.includes("archived_at IS NULL"), "collection reads must exclude archived notes");
      if (text.includes("archived_at IS NULL")) selected = selected.filter((note) => !note.archivedAt);
      if (text.endsWith("FOR UPDATE")) assert.ok(snapshot);
      return rows(selected);
    }
    if (text.startsWith("SELECT ") && text.includes(" FROM note_versions ")) {
      return rows(state.versions.filter((version) => text.includes("note_id = $2")
        ? version.id === values[0] && version.noteId === values[1] : version.noteId === values[0]).slice(-1));
    }
    if (text.startsWith("INSERT INTO note_versions ")) {
      assert.ok(snapshot);
      state.versions.push({ id: `version-${++counter}`, noteId: String(values[0]), title: String(values[1]),
        summary: values[2] as string | null, body: String(values[3]), reason: values[4] as NoteVersion["reason"], createdAt: new Date() });
      return rows([]);
    }
    if (text.startsWith("UPDATE notes SET ")) {
      assert.ok(snapshot);
      const note = state.notes.find((note) => note.id === values[0])!;
      if (text.includes("title = $2") || text.includes("archived_into = $2") || text.includes("archived_at = NULL")) {
        assert.ok(state.versions.some((version) => version.noteId === note.id && version.body === note.body));
      }
      if (text.includes("title = $2")) Object.assign(note, { title: values[1], summary: values[2], body: values[3] });
      if (text.includes("archived_at = now()")) note.archivedAt = new Date();
      if (text.includes("archived_at = NULL")) note.archivedAt = null;
      if (text.includes("archived_into = $2")) note.archivedInto = String(values[1]);
      if (text.includes("archived_into = NULL")) note.archivedInto = null;
      note.updatedAt = `2026-10-11T12:00:00.${String(++counter).padStart(6, "0")}Z`;
      return rows([note]);
    }
    if (text.startsWith("INSERT INTO note_sources ")) {
      assert.ok(snapshot);
      for (const source of [...state.sources].filter((source) => source.noteId === values[1])) {
        if (!state.sources.some((entry) => entry.noteId === values[0] && entry.captureId === source.captureId)) {
          state.sources.push({ noteId: String(values[0]), captureId: source.captureId });
        }
      }
      return rows([]);
    }
    throw new Error(`Unexpected offline query: ${text}`);
  };
  const pool = { query: run, connect: async () => ({ query: run, release: () => {} }) } as unknown as Pool;
  return { pool, events, get state() { return state; }, failNext(prefix: string) { fail = prefix; } };
}
