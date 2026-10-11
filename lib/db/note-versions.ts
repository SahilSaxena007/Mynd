import { editableNoteColumns, type EditableNote } from "./queries";
import { query, withTransaction } from "./transaction";

export type NoteVersion = { id: string; noteId: string; title: string; summary: string | null;
  body: string; reason: "tidy" | "merge" | "restore"; createdAt: Date };
const versionColumns = `id, note_id AS "noteId", title, summary, body, reason, created_at AS "createdAt"`;

export async function latestVersion(id: string): Promise<NoteVersion | null> {
  return (await query<NoteVersion>(`SELECT ${versionColumns} FROM note_versions
    WHERE note_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [id])).rows[0] ?? null;
}

export async function saveVersion(note: EditableNote, reason: NoteVersion["reason"]) {
  await query(`INSERT INTO note_versions (note_id, title, summary, body, reason)
    VALUES ($1, $2, $3, $4, $5)`, [note.id, note.title, note.summary, note.body, reason]);
}

export async function changeNoteState(id: string, expected: string,
  action: "archive" | "unarchive" | "restore", versionId?: string) {
  return withTransaction(async () => {
    const current = (await query<EditableNote>(`SELECT ${editableNoteColumns} FROM notes
      WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!current) return { status: 404, note: null };
    if (current.updatedAt !== expected) return { status: 409, note: current };
    if (action === "restore") {
      const old = (await query<NoteVersion>(`SELECT ${versionColumns} FROM note_versions
        WHERE id = $1 AND note_id = $2`, [versionId, id])).rows[0];
      if (!old) return { status: 404, note: current };
      await saveVersion(current, "restore");
      const note = (await query<EditableNote>(`UPDATE notes SET title = $2, summary = $3, body = $4,
        updated_at = clock_timestamp() WHERE id = $1 RETURNING ${editableNoteColumns}`,
      [id, old.title, old.summary, old.body])).rows[0];
      return { status: 200, note };
    }
    if (action === "unarchive") await saveVersion(current, "restore");
    const note = (await query<EditableNote>(`UPDATE notes SET archived_at = ${action === "archive" ? "now()" : "NULL"},
      archived_into = NULL, updated_at = clock_timestamp() WHERE id = $1 RETURNING ${editableNoteColumns}`, [id])).rows[0];
    return { status: 200, note };
  });
}
