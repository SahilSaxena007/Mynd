import { query } from "./transaction";
import type {
  Capture, CaptureInput, Folder, FolderInput, Note, NoteInput,
  NoteMeta, NoteSummary, Rule, RuleInput, ModelCallInput,
} from "./types";

export { withTransaction } from "./transaction";
export type { Capture, Folder, Note, NoteMeta, Rule } from "./types";

const captureColumns = `id, body, kind, captured_at AS "capturedAt", device,
  status, processed_at AS "processedAt", created_at AS "createdAt"`;
const folderColumns = `id, name, slug, description, color,
  parent_id AS "parentId", created_at AS "createdAt"`;
const noteMetaColumns = `id, folder_id AS "folderId", title, summary,
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const noteColumns = `${noteMetaColumns}, body`;
const ruleColumns = `id, kind, instruction, active, created_at AS "createdAt"`;

export async function insertCapture(input: CaptureInput): Promise<Capture> {
  const result = await query<Capture>(
    `INSERT INTO captures (body, kind, captured_at, device) VALUES ($1, $2, $3, $4)
     RETURNING ${captureColumns}`,
    [input.body, input.kind ?? "text", input.capturedAt, input.device ?? null],
  );
  return result.rows[0];
}

export async function getPendingCaptures(): Promise<Capture[]> {
  return (await query<Capture>(`SELECT ${captureColumns} FROM captures
    WHERE status = 'pending' ORDER BY captured_at, id`)).rows;
}

export async function listCaptures(limit = 100): Promise<Capture[]> {
  return (await query<Capture>(`SELECT ${captureColumns} FROM captures
    ORDER BY captured_at DESC, id DESC LIMIT $1`, [limit])).rows;
}

export async function markCaptureProcessed(id: string): Promise<void> {
  const result = await query(`UPDATE captures SET status = 'processed',
    processed_at = COALESCE(processed_at, now()) WHERE id = $1`, [id]);
  if (result.rowCount !== 1) throw new Error("Capture not found.");
}

export async function listFolders(): Promise<Folder[]> {
  return (await query<Folder>(`SELECT ${folderColumns} FROM folders ORDER BY name, id`)).rows;
}

export async function getFolderBySlug(slug: string): Promise<Folder | null> {
  return (await query<Folder>(`SELECT ${folderColumns} FROM folders WHERE slug = $1`, [slug])).rows[0] ?? null;
}

export async function createFolder(input: FolderInput): Promise<Folder> {
  return (await query<Folder>(`INSERT INTO folders (name, slug, description, color, parent_id)
    VALUES ($1, $2, $3, $4, $5) RETURNING ${folderColumns}`,
  [input.name, input.slug, input.description ?? null, input.color ?? null, input.parentId ?? null])).rows[0];
}

export async function getNoteSummaries(): Promise<NoteSummary[]> {
  return (await query<NoteSummary>(`SELECT id, title, summary, folder_id AS "folderId"
    FROM notes ORDER BY created_at, id`)).rows;
}

export async function getNote(id: string): Promise<Note | null> {
  return (await query<Note>(`SELECT ${noteColumns} FROM notes WHERE id = $1`, [id])).rows[0] ?? null;
}

export async function getVault(): Promise<{ folders: Folder[]; notes: NoteMeta[] }> {
  const folders = await listFolders();
  const notes = (await query<NoteMeta>(`SELECT ${noteMetaColumns} FROM notes ORDER BY created_at, id`)).rows;
  return { folders, notes };
}

export async function createNote(input: NoteInput): Promise<Note> {
  return (await query<Note>(`INSERT INTO notes (folder_id, title, summary, body)
    VALUES ($1, $2, $3, $4) RETURNING ${noteColumns}`,
  [input.folderId, input.title, input.summary ?? null, input.body])).rows[0];
}

export async function appendToNote(id: string, block: string): Promise<Note> {
  // Atomic SQL concatenation preserves all prior bytes, including concurrent appends.
  const result = await query<Note>(`UPDATE notes
    SET body = body || E'\n' || $2, updated_at = clock_timestamp()
    WHERE id = $1 RETURNING ${noteColumns}`, [id, block]);
  if (!result.rows[0]) throw new Error("Note not found.");
  return result.rows[0];
}

export async function linkNoteToCapture(noteId: string, captureId: string): Promise<void> {
  await query(`INSERT INTO note_sources (note_id, capture_id) VALUES ($1, $2)
    ON CONFLICT (note_id, capture_id) DO NOTHING`, [noteId, captureId]);
}

export async function listActiveRules(): Promise<Rule[]> {
  return (await query<Rule>(`SELECT ${ruleColumns} FROM rules
    WHERE active = true ORDER BY created_at, id`)).rows;
}

export async function createRule(input: RuleInput): Promise<Rule> {
  return (await query<Rule>(`INSERT INTO rules (kind, instruction)
    VALUES ($1, $2) RETURNING ${ruleColumns}`, [input.kind, input.instruction])).rows[0];
}

export async function insertModelCall(input: ModelCallInput): Promise<void> {
  await query(`INSERT INTO model_calls
    (job, model, input_tokens, output_tokens, cached_tokens, est_cost_usd)
    VALUES ($1, $2, $3, $4, $5, $6)`,
  [input.job, input.model, input.inputTokens, input.outputTokens, input.cachedTokens, input.estCostUsd]);
}

const todayStart = `(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

export async function countModelCallsToday(): Promise<number> {
  const { rows } = await query<{ count: string }>(`SELECT count(*) AS count FROM model_calls
    WHERE created_at >= ${todayStart} AND created_at < ${todayStart} + interval '24 hours'`);
  return Number(rows[0].count);
}

export async function sumModelCostToday(): Promise<number> {
  const { rows } = await query<{ total: string }>(`SELECT COALESCE(sum(est_cost_usd), 0) AS total
    FROM model_calls WHERE created_at >= ${todayStart}
    AND created_at < ${todayStart} + interval '24 hours'`);
  return Number(rows[0].total);
}
