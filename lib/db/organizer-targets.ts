import { query } from "./transaction";
import type { Capture } from "./types";

export async function lockOrganizerCaptures(captures: Capture[]) {
  const { rows } = await query<{ id: string; status: string; body: string; capturedAt: Date }>(
    `SELECT id, status, body, captured_at AS "capturedAt" FROM captures
     WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [captures.map((capture) => capture.id)]);
  const invalid = captures.filter((capture) => !rows.some((row) => row.id === capture.id
    && row.status === "pending" && row.body === capture.body
    && row.capturedAt.getTime() === capture.capturedAt.getTime()));
  if (invalid.length) throw new Error(`Captures missing, changed, or no longer pending: ${invalid.map((capture) => capture.id).join(", ")}`);
}

// Called inside the apply transaction: hold the targets stable through all writes.
export async function lockOrganizerTargets(folderIds: string[], noteIds: string[]) {
  const folders = await query<{ id: string }>(
    "SELECT id FROM folders WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE", [folderIds]);
  const notes = await query<{ id: string; folderId: string }>(
    'SELECT id, folder_id AS "folderId" FROM notes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [noteIds]);
  return { folders: new Set(folders.rows.map((folder) => folder.id)),
    notes: new Map(notes.rows.map((note) => [note.id, note.folderId])) };
}
