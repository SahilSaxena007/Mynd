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
      FROM unnest(ARRAY['captures', 'folders', 'notes', 'note_sources', 'rules']) AS name`);
    const count = rows.filter((row) => row.exists).length;
    if (count === 5) return "already present";
    if (count !== 0) throw new Error("Partial slice 1 schema exists; refusing to overwrite it.");
    await query(schema);
    return "created";
  });
}
