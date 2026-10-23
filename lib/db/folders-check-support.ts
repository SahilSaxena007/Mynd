import type { Pool } from "pg";
import type { Folder } from "./types";

// Offline transaction double shared by folder and seed checks. Unknown SQL fails
// closed, so these checks cannot accidentally contact the configured live vault.
export function foldersCheckDatabase() {
  const state = { folders: [] as Folder[], locks: [] as number[], commits: 0, rollbacks: 0 };
  const pool = { connect: async () => {
    let snapshot: Folder[] = [];
    return {
      release() {},
      async query(sql: string, values: unknown[] = []) {
        if (sql === "BEGIN") { snapshot = structuredClone(state.folders); return { rows: [] }; }
        if (sql === "COMMIT") { state.commits++; return { rows: [], command: "COMMIT" }; }
        if (sql === "ROLLBACK") { state.folders = snapshot; state.rollbacks++; return { rows: [] }; }
        const lock = sql.match(/^SELECT pg_advisory_xact_lock\((\d+)\)$/);
        if (lock) { state.locks.push(Number(lock[1])); return { rows: [] }; }
        if (sql === "SELECT count(*) FROM folders") return { rows: [{ count: String(state.folders.length) }] };
        if (sql.includes("FROM folders WHERE lower(name)")) return { rows: state.folders.filter((f) =>
          f.name.toLowerCase() === String(values[0]).toLowerCase() && (values[1] === null || f.slug !== values[1])) };
        if (sql.includes("FROM folders WHERE slug = $1")) return { rows: state.folders.filter((f) => f.slug === values[0]) };
        if (sql.includes("FROM folders ORDER BY name, id")) return { rows: [...state.folders].sort((a, b) => a.name.localeCompare(b.name)) };
        if (sql.startsWith("INSERT INTO folders")) {
          if (state.folders.some((f) => f.slug === values[1])) throw new Error("Duplicate slug");
          const folder: Folder = { id: `folder-${state.folders.length}`, name: String(values[0]), slug: String(values[1]),
            description: String(values[2]), color: String(values[3]), parentId: null, createdAt: new Date() };
          state.folders.push(folder);
          return { rows: [folder] };
        }
        if (sql.startsWith("UPDATE folders SET name")) {
          const folder = state.folders.find((f) => f.slug === values[0])!;
          Object.assign(folder, { name: values[1], description: values[2], color: values[3] });
          return { rows: [] };
        }
        throw new Error(`Unexpected folder-check query: ${sql}`);
      },
    };
  } } as unknown as Pool;
  return { pool, state };
}
