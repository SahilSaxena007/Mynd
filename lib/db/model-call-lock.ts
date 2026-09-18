import { getDb } from "./client";

let pending: Promise<void> = Promise.resolve();

// Serialize the daily check through the durable log, including across processes.
// A session lock avoids holding a transaction open during the network request.
export async function withModelCallLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = pending;
  let release!: () => void;
  pending = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await locked(fn); }
  finally { release(); }
}

async function locked<T>(fn: () => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  let discard = false;
  try {
    await client.query("SELECT pg_advisory_lock(715002)");
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(715002)");
    } catch {
      discard = true;
    }
    client.release(discard);
  }
}
