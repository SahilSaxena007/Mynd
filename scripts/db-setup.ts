import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { migrate } from "../lib/db/migrate";
import { seed } from "../lib/db/seed";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    const action = process.argv[2];
    if (action === "migrate") console.log(`PASS: Slice 1 tables ${await migrate()}.`);
    else if (action === "seed") {
      const folders = await seed();
      console.log(`PASS: Seed folders present: ${folders.map((folder) => folder.name).join(", ")}.`);
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
