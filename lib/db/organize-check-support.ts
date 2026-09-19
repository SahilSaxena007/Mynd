import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getDb, withDatabase } from "./client";
import { readSchema } from "./migrate";
import { query } from "./transaction";

// A committed isolated schema lets applyPlan exercise its own real transaction.
// The entire schema is removed in finally; no test rows enter the public schema.
export async function withOrganizeCheckSchema(fn: () => Promise<void>) {
  const name = `organize_check_${randomUUID().replaceAll("-", "")}`;
  const db = getDb();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${name},public`, max: 2, connectionTimeoutMillis: 10000 });
  await db.query(`CREATE SCHEMA "${name}"`);
  try {
    await withDatabase(pool, async () => {
      await query(await readSchema());
      await fn();
    });
  } finally {
    await pool.end();
    await db.query(`DROP SCHEMA "${name}" CASCADE`);
    const result = await db.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present", [name]);
    if (result.rows[0].present) throw new Error("Organize check schema was not removed.");
  }
}

export async function injectOrganizeFailure() {
  // Fail at capture processing, after notes, provenance and Quick Calls were written.
  await query(`CREATE FUNCTION fail_organize_check() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected organize failure'; END $$`);
  await query(`CREATE TRIGGER fail_organize_check BEFORE UPDATE ON captures
    FOR EACH ROW EXECUTE FUNCTION fail_organize_check()`);
}

export async function organizeRowCounts() {
  const { rows } = await query<{ notes: number; sources: number; calls: number; modelCalls: number }>(`
    SELECT (SELECT count(*)::int FROM notes) AS notes,
      (SELECT count(*)::int FROM note_sources) AS sources,
      (SELECT count(*)::int FROM quick_calls) AS calls,
      (SELECT count(*)::int FROM model_calls) AS "modelCalls"`);
  return rows[0];
}
