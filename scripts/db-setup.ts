import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { migrate } from "../lib/db/migrate";
import { seedWithResult } from "../lib/db/seed";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const action = process.argv[2];
    if (action === "migrate") console.log(`PASS: Schema ${await migrate()}.`);
    else if (action === "seed") {
      const { folders, skipped } = await seedWithResult();
      console.log(skipped ? `PASS: Vault already has ${folders.length} folders; seed skipped.`
        : `PASS: Seed folders present: ${folders.map((folder) => folder.name).join(", ")}.`);
    } else throw new Error("Expected migrate or seed.");
  } catch (error) {
    // Avoid logging provider errors, which can include credentials or row contents.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "setup error";
    console.error(`FAIL: Database setup (${code}).`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
