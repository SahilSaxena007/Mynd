import { editableNoteColumns, type EditableNote } from "./queries";
import { saveVersion } from "./note-versions";
import { query, withTransaction } from "./transaction";
import { tidyGuard, type TidyOperation } from "../organizer/tidy-guards";

export async function applyTidy(operation: TidyOperation, snapshots: EditableNote[]): Promise<string[]> {
  return withTransaction(async () => {
    const ids = [operation.note, ...operation.absorbs];
    if (new Set(ids).size !== ids.length) return ["references"];
    const locked = (await query<EditableNote>(`SELECT ${editableNoteColumns} FROM notes
      WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids])).rows;
    const target = locked.find((note) => note.id === operation.note);
    if (!target || locked.length !== ids.length || locked.some((note) => note.archivedAt
      || note.folderId !== target.folderId || !snapshots.some((old) => old.id === note.id
        && old.updatedAt === note.updatedAt && old.folderId === note.folderId))) return ["G4 changed"];
    const errors = tidyGuard(locked, operation);
    if (errors.length) return errors;
    for (const note of locked) await saveVersion(note, note.id === target.id ? "tidy" : "merge");
    await query(`UPDATE notes SET title = $2, summary = $3, body = $4, updated_at = clock_timestamp()
      WHERE id = $1`, [target.id, operation.title, operation.summary, operation.body]);
    for (const id of operation.absorbs) {
      await query(`UPDATE notes SET archived_at = now(), archived_into = $2, updated_at = clock_timestamp()
        WHERE id = $1`, [id, target.id]);
      await query(`INSERT INTO note_sources (note_id, capture_id)
        SELECT $1, capture_id FROM note_sources WHERE note_id = $2 ON CONFLICT DO NOTHING`, [target.id, id]);
    }
    return [];
  });
}
