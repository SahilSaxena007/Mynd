import { AsyncLocalStorage } from "node:async_hooks";
import { countModelCallsToday } from "../db/queries";

type Run = { calls: number; costUsd: number; active: boolean; stopped: boolean; routeTruncated: boolean };
const runs = new AsyncLocalStorage<Run>();

function refuse(limit: string): never {
  console.error(`Model call refused: ${limit}. No retry.`);
  const run = runs.getStore();
  if (run) run.stopped = true;
  throw new Error(`Model call refused: ${limit}.`);
}

export async function withModelRun<T>(fn: () => Promise<T>, onCost?: (costUsd: number) => void): Promise<T> {
  // Nesting must not reset the caller's budget.
  const existing = runs.getStore();
  if (existing) {
    if (!existing.active || existing.stopped) refuse("model run is closed");
    const startCost = existing.costUsd;
    try { return await fn(); }
    finally { onCost?.(existing.costUsd - startCost); }
  }
  const run: Run = { calls: 0, costUsd: 0, active: true, stopped: false, routeTruncated: false };
  return runs.run(run, async () => {
    try { return await fn(); }
    finally { run.active = false; onCost?.(run.costUsd); }
  });
}

// Account before validating a billed response, including truncated/invalid output.
export function recordModelCost(costUsd: number): void {
  const run = runs.getStore();
  if (run) run.costUsd += costUsd;
}

export function stopModelRun(): void {
  const run = runs.getStore();
  if (run) run.stopped = true;
}

// The single J4 exception never reopens a stopped run or resets its call budget.
export function allowRouteTruncationRetry(): boolean {
  const run = runs.getStore();
  if (!run || !run.active || run.stopped || run.routeTruncated) return false;
  run.routeTruncated = true;
  return true;
}

function limit(name: string): number {
  const value = process.env[name]?.trim();
  if (!value || !/^\d+$/.test(value)) refuse(`${name} missing or invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) refuse(`${name} invalid`);
  return parsed;
}

function budget(maxTokens: number) {
  const run = runs.getStore();
  if (!run || !run.active || run.stopped) refuse("active withModelRun required");
  const tokenCap = limit("MAX_TOKENS_PER_CALL");
  const runCap = limit("MAX_CALLS_PER_RUN");
  const dailyCap = limit("DAILY_CALL_CAP");
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) refuse("maxTokens invalid");
  if (maxTokens > tokenCap) refuse("MAX_TOKENS_PER_CALL exceeded");
  if (run.calls >= runCap) refuse("MAX_CALLS_PER_RUN exceeded");
  return { run, dailyCap };
}

export function checkModelBudget(maxTokens: number): void {
  budget(maxTokens);
}

export async function guardModelCall(maxTokens: number): Promise<void> {
  const { run, dailyCap } = budget(maxTokens);
  const today = await countModelCallsToday();
  if (!Number.isSafeInteger(today) || today < 0) refuse("DAILY_CALL_CAP count unavailable");
  if (today >= dailyCap) refuse("DAILY_CALL_CAP exceeded");
  if (!run.active || run.stopped) refuse("model run is closed");
  // Reserve before the provider request; even a failed attempt consumes the run budget.
  run.calls += 1;
}
