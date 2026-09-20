import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { updateFolderDescription } from "../lib/db/queries";

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || !args[0].trim() || !args[1].trim()) {
      throw new Error('Usage: npm run folders:describe -- <slug> "<description>"');
    }
    loadEnvConfig(process.cwd());
    const { previous, updated } = await updateFolderDescription(args[0], args[1]);
    console.log(`${updated.slug}\nOld: ${previous.description ?? "(none)"}\nNew: ${updated.description}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally { await closeDb(); }
}
void main();
