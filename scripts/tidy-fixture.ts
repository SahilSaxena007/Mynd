import type { TidyResult } from "../lib/organizer/stage4-tidy";

// Filing integration fixtures replace the model-based tidy stage. Its real guards,
// transactions and orchestration have their own offline suite (tidy:check).
export async function emptyTidy(): Promise<TidyResult> {
  return { notesTidied: 0, notesMerged: 0, tidyRejected: 0, error: null, operations: [] };
}
