import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query, withTransaction } from "./transaction";

export function readSchema(): Promise<string> {
  return readFile(join(process.cwd(), "lib/db/schema.sql"), "utf8");
}

export async function migrate(): Promise<"created" | "already present"> {
  const schema = await readSchema();
  return withTransaction(async () => {
    await query("SELECT pg_advisory_xact_lock(715001)");
    const { rows } = await query<{ name: string; exists: boolean }>(`
      SELECT name, to_regclass(name) IS NOT NULL AS exists
      FROM unnest(ARRAY['captures', 'folders', 'notes', 'note_sources', 'rules',
        'model_calls', 'quick_calls', 'quick_calls_status_idx', 'captures_status_idx', 'notes_folder_id_idx',
        'note_sources_capture_id_idx', 'model_calls_created_at_idx',
        'organize_runs', 'organize_runs_finished_at_idx']) AS name`);
    await query(schema);
    return rows.every((row) => row.exists) ? "already present" : "created";
  });
}
