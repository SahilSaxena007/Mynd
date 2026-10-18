import { loadEnvConfig } from "@next/env";
import { closeDb } from "../lib/db/client";
import { runOrganize } from "../lib/organizer";
import { OrganizeBusyError, withOrganizeLock } from "../lib/db/organize-lock";

async function main() {
  loadEnvConfig(process.cwd());
  try {
    await withOrganizeLock(() => runOrganize({ trigger: "cron" }));
  } catch (error) {
    if (error instanceof OrganizeBusyError) {
      console.log("Already organising");
      return;
    }
    // runOrganize exposes only its sanitized operational error, never a raw cause.
    console.error(error instanceof Error ? error.message : "Organize failed.");
    process.exitCode = 1;
  } finally {
    try { await closeDb(); } catch {
      console.error("Database close failed.");
      process.exitCode = 1;
    }
  }
}
void main();
