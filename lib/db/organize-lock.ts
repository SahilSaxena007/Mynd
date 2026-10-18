import { getDb } from "./client";

export class OrganizeBusyError extends Error {
  constructor() { super("Already organising — give it a minute."); }
}

export async function withOrganizeLock<T>(fn: () => Promise<T>): Promise<T> {
  let client;
  try { client = await getDb().connect(); }
  catch { throw new Error("Could not start organising."); }
  let acquired = false;
  let discard = false;
  try {
    try {
      const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(715003) AS locked");
      acquired = result.rows[0].locked;
    } catch {
      discard = true;
      throw new Error("Could not start organising.");
    }
    if (!acquired) throw new OrganizeBusyError();
    return await fn();
  } finally {
    if (acquired) {
      try { await client.query("SELECT pg_advisory_unlock(715003)"); }
      catch { discard = true; }
    }
    client.release(discard);
  }
}

export async function lastButtonRunStartedAt(): Promise<Date | null> {
  try {
    const result = await getDb().query<{ startedAt: Date | null }>(
      `SELECT max(started_at) AS "startedAt" FROM organize_runs WHERE trigger = 'button'`,
    );
    return result.rows[0].startedAt;
  } catch { throw new Error("Could not check the last organise run."); }
}
