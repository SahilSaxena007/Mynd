import type { Pool } from "pg";

// Offline database double: reject every query outside the empty-vault route path.
export function organizeNowCheckDatabase() {
  const state = { busy: false, last: null as Date | null, failUnlock: false,
    gathers: 0, records: [] as unknown[][], releases: [] as boolean[], unlocks: 0 };
  async function query(sql: string, values: unknown[] = []) {
    if (sql.includes("pg_try_advisory_lock(715003)")) return { rows: [{ locked: !state.busy }] };
    if (sql.includes("pg_advisory_unlock(715003)")) {
      state.unlocks++;
      if (state.failUnlock) throw new Error("offline unlock failure");
      return { rows: [] };
    }
    if (sql.includes("max(started_at)") && sql.includes("trigger = 'button'")) {
      return { rows: [{ startedAt: state.last }] };
    }
    if (sql.includes("INSERT INTO organize_runs")) {
      state.records.push(values);
      return { rows: [] };
    }
    if (/FROM (captures|folders|notes|rules)\b/.test(sql)) {
      state.gathers++;
      return { rows: [] };
    }
    throw new Error(`Unexpected query in organise-now check: ${sql}`);
  }
  const pool = { query, connect: async () => ({ query,
    release: (discard: boolean) => state.releases.push(discard) }) } as unknown as Pool;
  return { state, pool };
}
