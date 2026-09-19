import { Pool } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

const scopedDb = new AsyncLocalStorage<Pool>();
export function withDatabase<T>(pool: Pool, fn: () => Promise<T>): Promise<T> {
  return scopedDb.run(pool, fn);
}

const globalForDb = globalThis as typeof globalThis & {
  vaultDb?: Pool;
};

export function getDb(): Pool {
  const scoped = scopedDb.getStore();
  if (scoped) return scoped;
  if (globalForDb.vaultDb) return globalForDb.vaultDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Set it in .env.");
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 10_000,
  });

  // Handle disconnected idle clients without logging credentials or connection URLs.
  pool.on("error", () => {
    console.error("Postgres pool encountered an idle connection error.");
  });

  // Reuse the pool across Next.js development reloads.
  globalForDb.vaultDb = pool;
  return pool;
}

export async function closeDb(): Promise<void> {
  const pool = globalForDb.vaultDb;
  delete globalForDb.vaultDb;
  if (pool) await pool.end();
}
