import type { OrganizeRunInput } from "../db/types";
import { ModelProviderError } from "../model/errors";
import type { ResolvedPlan } from "./coverage";
import type { RunRefs } from "./refs";

export type OrganizeStage = "gather" | "configure" | "split" | "route" | "coverage" | "apply" | "record";

export function runError(stage: OrganizeStage, error: unknown): string {
  // Guard errors are plain Error objects: only their complete, fixed vocabulary is safe.
  const guardMessage = /^Model call refused: (?:active withModelRun required|model run is closed|maxTokens invalid|(?:MAX_TOKENS_PER_CALL|MAX_CALLS_PER_RUN|DAILY_CALL_CAP) (?:missing or invalid|invalid|exceeded)|DAILY_CALL_CAP count unavailable)\.$/;
  if (!(error instanceof ModelProviderError) && error instanceof Error && guardMessage.test(error.message)) {
    return `${stage} failed: ${error.message}`;
  }
  if (!(error instanceof ModelProviderError)) return `${stage} failed.`;
  // Provider fields are external input too. Only fixed operational names may escape.
  const types = new Set(["api_error", "authentication_error", "permission_error", "not_found_error",
    "invalid_request_error", "rate_limit_error", "overloaded_error", "request_too_large", "billing_error"]);
  const type = types.has(error.type) ? error.type : "api_error";
  const status = Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599 ? error.status : "unknown";
  return `${stage} failed: HTTP ${status} ${type}.`;
}

export function newRunRecord(trigger: OrganizeRunInput["trigger"]): OrganizeRunInput {
  return { trigger, status: "failed", startedAt: new Date(), capturesProcessed: 0, itemsFiled: 0,
    itemsQueued: 0, notesCreated: 0, notesAppended: 0, costUsd: 0, failedCaptureId: null, error: null };
}

export function appliedCounts(refs: RunRefs, plan: ResolvedPlan) {
  return { capturesProcessed: refs.captures.length, itemsFiled: plan.filed.length,
    itemsQueued: plan.queued.length, notesCreated: plan.newNotes.length,
    notesAppended: new Set(plan.filed.filter((entry) => refs.notes.has(entry.note)).map((entry) => entry.note)).size };
}
