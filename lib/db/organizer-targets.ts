import { query } from "./transaction";

// Called inside the apply transaction: hold the targets stable through all writes.
export async function lockOrganizerTargets(folderIds: string[], noteIds: string[]) {
  const folders = await query<{ id: string }>(
    "SELECT id FROM folders WHERE id = ANY($1::uuid[]) FOR SHARE", [folderIds]);
  const notes = await query<{ id: string; folderId: string }>(
    'SELECT id, folder_id AS "folderId" FROM notes WHERE id = ANY($1::uuid[]) FOR UPDATE', [noteIds]);
  return { folders: new Set(folders.rows.map((folder) => folder.id)),
    notes: new Map(notes.rows.map((note) => [note.id, note.folderId])) };
}
