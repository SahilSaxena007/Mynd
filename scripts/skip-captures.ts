import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { skipCaptures } from "../lib/db/queries";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const ids = process.argv.slice(2).map((id) => id.toLowerCase());
    if (!ids.length || ids.some((id) => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id))) {
      throw new Error("Provide one or more capture UUIDs.");
    }
    console.log(`Skipped ${await skipCaptures(ids)} captures.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Skip failed.");
    process.exitCode = 1;
  } finally { await closeDb(); }
}
void main();
