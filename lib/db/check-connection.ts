import { getDb } from "./client";

export async function checkConnection(): Promise<void> {
  const result = await getDb().query<{ ok: number }>("SELECT 1 AS ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("Unexpected database connection check result.");
  }
}
