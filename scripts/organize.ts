import { loadEnvConfig } from "@next/env";
import { parseArgs } from "node:util";
import { closeDb } from "../lib/db/client";
import { runOrganize } from "../lib/organizer";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const { values } = parseArgs({ options: { dry: { type: "boolean", default: false }, limit: { type: "string" } } });
    if (values.limit !== undefined && !/^[1-9]\d*$/.test(values.limit)) throw new Error("--limit must be a positive integer.");
    await runOrganize({ dry: values.dry, limit: values.limit === undefined ? 10 : Number(values.limit) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Organize failed.");
    process.exitCode = 1;
  } finally { await closeDb(); }
}
void main();
