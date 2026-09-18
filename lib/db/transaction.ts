import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient, QueryResultRow } from "pg";
import { getDb } from "./client";

type Transaction = { client: PoolClient; active: boolean };
const transaction = new AsyncLocalStorage<Transaction>();

// Every query inside withTransaction uses the same checked-out connection.
export function query<Row extends QueryResultRow>(sql: string, values: unknown[] = []) {
  const context = transaction.getStore();
  if (context && !context.active) {
    throw new Error("Transaction has ended. Await every query in its callback.");
  }
  return (context?.client ?? getDb()).query<Row>(sql, values);
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (transaction.getStore()) {
    throw new Error("Nested transactions are not supported.");
  }
  const client = await getDb().connect();
  const context: Transaction = { client, active: true };
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await transaction.run(context, fn);
    const commit = await client.query("COMMIT");
    if (commit.command !== "COMMIT") {
      throw new Error("Transaction was aborted; no changes were committed.");
    }
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    context.active = false;
    client.release(discard);
  }
}
