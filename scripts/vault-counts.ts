import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { vaultCounts } from "../lib/db/vault-counts";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const { counts, folders } = await vaultCounts();
    for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);
    for (const folder of folders) console.log(`${folder.slug} · ${folder.name} · ${folder.notes}`);
  } catch {
    console.error("Could not read vault counts.");
    process.exitCode = 1;
  } finally { await closeDb(); }
}
void main();
