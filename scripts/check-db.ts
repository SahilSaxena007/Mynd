import { loadEnvConfig } from "@next/env";
import { checkConnection } from "../lib/db/check-connection";
import { closeDb } from "../lib/db/client";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  try {
    await checkConnection();
    console.log("PASS: Postgres connection works (SELECT 1 returned 1).");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "connection/configuration error";
    console.error(`FAIL: Postgres connection check (${code}). Check DATABASE_URL and network access.`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
