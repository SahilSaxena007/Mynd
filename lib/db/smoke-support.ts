import { randomUUID } from "node:crypto";
import { readSchema } from "./migrate";
import { query, withTransaction } from "./transaction";

// Test-only: the real DB executes the exact DDL in an isolated schema. Rolling
// back removes both that schema and all fixtures, even if an assertion fails.
export async function withSmokeSchema(fn: () => Promise<void>): Promise<void> {
  const schemaName = `smoke_${randomUUID().replaceAll("-", "")}`;
  const schema = await readSchema();
  const rollback = new Error("Successful smoke test rollback");
  try {
    await withTransaction(async () => {
      // Identifier is generated locally from a UUID, never from user input.
      await query(`CREATE SCHEMA "${schemaName}"`);
      await query("SELECT set_config('search_path', $1, true)", [`${schemaName}, public`]);
      await query(schema);
      await fn();
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  const result = await query<{ present: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present", [schemaName],
  );
  if (result.rows[0].present) throw new Error("Smoke schema was not rolled back.");
}

export async function hasNoteSource(noteId: string, captureId: string): Promise<boolean> {
  const result = await query<{ present: boolean }>(`SELECT EXISTS (
    SELECT 1 FROM note_sources WHERE note_id = $1 AND capture_id = $2
  ) AS present`, [noteId, captureId]);
  return result.rows[0].present;
}

export async function deactivateSmokeRule(id: string): Promise<void> {
  await query("UPDATE rules SET active = false WHERE id = $1", [id]);
}
