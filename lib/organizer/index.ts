import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import type { Folder, Note } from "../db/types";
import { insertOrganizeRun, markCaptureFailed } from "../db/queries";
import { withModelRun } from "../model";
import { estimateCost } from "../model/cost";
import { routeParameters } from "../model/capabilities";
import { ModelProviderError } from "../model/errors";
import { stopModelRun } from "../model/guard";
import { routePrompt } from "../prompts/route";
import { splitPrompt } from "../prompts/split";
import { resolveCoverage, type ResolvedPlan } from "./coverage";
import { buildRefs, localDate, routeInput, type RunRefs } from "./refs";
import { printPlan } from "./print";
import { gatherForOrganize } from "./stage0-gather";
import { splitCapture } from "./stage1-split";
import { routeItems } from "./stage2-route";
import { applyPlan, assertResolvedPlan } from "./stage3-apply";
import { appliedCounts, newRunRecord, runError, type OrganizeStage } from "./run-record";

type SavedRefs = Omit<RunRefs, "folders" | "notes" | "newNoteRefs"> & {
  folders: [string, Folder][];
  notes: [string, Note][];
  newNoteRefs: string[];
};

function assertSavedNumbers(refs: RunRefs, plan: ResolvedPlan) {
  // Older reviewed files predate the number gate. Refuse them rather than changing
  // the reviewed plan or letting --apply bypass the current guarantee.
  const checked = resolveCoverage(refs, { new_notes: plan.newNotes,
    placements: plan.filed.map((entry) => ({ item: entry.item.ref, note: entry.note,
      markdown: entry.markdown, confidence: "sure", options: [] })) });
  if (checked.filed.length !== plan.filed.length) {
    throw new Error("Saved plan contains unverified numbers; review a new dry run before applying.");
  }
}

export function savedPlan(refs: RunRefs, plan: ResolvedPlan) {
  assertResolvedPlan(refs, plan);
  assertSavedNumbers(refs, plan);
  return { version: 1, dry: true, plan, refs: { ...refs,
    folders: [...refs.folders], notes: [...refs.notes], newNoteRefs: [...refs.newNoteRefs] } };
}

const string = { type: "string" };
const strings = (names: string[]) => Object.fromEntries(names.map((name) => [name, string]));
const object = (properties: Record<string, object>) => ({ type: "object", required: Object.keys(properties), properties });
const array = (items: object) => ({ type: "array", items });
const itemSchema = object({ ...strings(["ref", "captureId", "capture", "date", "text", "topic"]),
  quotes: array(string), unassigned: { type: "boolean" } });
const pair = (value: object) => ({ type: "array", minItems: 2, maxItems: 2, items: [string, value] });
const validateSaved = new Ajv({ strict: true }).compile<{ version: number; dry: boolean; refs: SavedRefs; plan: ResolvedPlan }>({
  ...object({ version: { const: 1 }, dry: { const: true },
    refs: object({
      captures: array(object(strings(["id", "body", "capturedAt", "status"]))),
      folders: array(pair(object(strings(["id", "slug"])))),
      notes: array(pair(object(strings(["id", "folderId"])))),
      items: array(itemSchema), newNoteRefs: array(string), rules: array({ type: "object" }),
    }),
    plan: object({
      newNotes: array(object(strings(["ref", "folder", "title", "summary"]))),
      filed: array(object({ item: itemSchema, ...strings(["note", "markdown"]) })),
      queued: array(object({ ...strings(["item", "captureId", "topic", "itemText"]),
        reason: { enum: ["unsure", "invalid_target", "not_placed", "added_detail"] },
        options: { ...array(object(strings(["label", "folder", "note", "new_note_title", "new_folder_name"]))), maxItems: 3 },
      })),
    }),
  }),
});

export async function applySavedRun(file: string, directory = join(process.cwd(), ".runs")) {
  const data: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!validateSaved(data) || ("error" in data) || ("applied" in data && data.applied === true)) {
    throw new Error("Apply requires a successful dry run with a saved plan and reference map.");
  }
  const raw = data.refs;
  const refs: RunRefs = { ...raw, folders: new Map(raw.folders), notes: new Map(raw.notes),
    newNoteRefs: new Set(raw.newNoteRefs), captures: raw.captures.map((capture) => ({ ...capture,
      capturedAt: new Date(capture.capturedAt) })) };
  if (refs.folders.size !== raw.folders.length || refs.notes.size !== raw.notes.length
    || refs.newNoteRefs.size !== raw.newNoteRefs.length
    || raw.folders.some(([slug, folder]) => slug !== folder.slug)
    || raw.notes.some(([ref], index) => ref !== `N${index + 1}`)
    || raw.newNoteRefs.some((ref, index) => ref !== `X${index + 1}`)
    || raw.newNoteRefs.length !== raw.items.length
    || refs.captures.some((capture) => !Number.isFinite(capture.capturedAt.getTime()) || capture.status !== "pending")) {
    throw new Error("Invalid saved reference map.");
  }
  assertResolvedPlan(refs, data.plan);
  assertSavedNumbers(refs, data.plan);
  const run = newRunRecord("manual");
  let plan: ResolvedPlan;
  try {
    plan = await applyPlan(refs, data.plan, true);
    Object.assign(run, appliedCounts(refs, plan));
    run.status = "ok";
  } catch (error) {
    run.error = runError("apply", error);
    throw error;
  } finally {
    try { await insertOrganizeRun(run); }
    catch { throw new Error(runError("record", null)); }
  }
  await saveRunRecord({ startedAt: new Date().toISOString(), dry: false, applied: true,
    appliedFrom: resolve(file), plan, refs: raw, modelCalls: 0, cost: 0 }, directory);
  console.log(`Applied exactly the saved plan from ${file}; zero model calls.`);
  return plan;
}

export async function saveRunRecord(record: Record<string, unknown>, directory = join(process.cwd(), ".runs")) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${String(record.startedAt).replaceAll(":", "-")}-${randomUUID()}.json`);
  await writeFile(path, JSON.stringify(record, null, 2), { flag: "wx" });
  console.log(`Run saved: ${path}`);
  return path;
}

export async function runOrganize(
  { dry = false, limit = 10, trigger = "manual", directory }: {
    dry?: boolean; limit?: number; trigger?: "manual" | "cron"; directory?: string;
  } = {},
  // Tests replace only model stages; gathering, coverage, transactions and records stay real.
  stages = { splitCapture, routeItems },
) {
  const run = newRunRecord(trigger);
  const record: Record<string, unknown> = { startedAt: run.startedAt.toISOString(), dry, splitPrompt, routePrompt };
  const splits: Awaited<ReturnType<typeof splitCapture>>[] = [];
  record.splits = splits;
  let stage: OrganizeStage = "configure";
  try {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
    stage = "gather";
    const context = await gatherForOrganize(Math.min(limit, 10));
    record.context = context;
    if (!context.captures.length) {
      run.status = "nothing_pending";
      console.log("No pending captures. No model calls. Run cost $0.000000.");
      return;
    }
    stage = "configure";
    routeParameters(process.env.ROUTE_MODEL?.trim() || process.env.ORGANIZE_MODEL?.trim() || "",
      8000, process.env.ROUTE_THINKING_BUDGET);
    const timezone = process.env.USER_TIMEZONE;
    localDate(context.captures[0].capturedAt, timezone);
    return await withModelRun(async () => {
      stage = "split";
      for (const capture of context.captures) {
        try {
          splits.push(await stages.splitCapture(capture));
        } catch (error) {
          stopModelRun();
          if (!dry && !(error instanceof ModelProviderError) && await markCaptureFailed(capture.id)) {
            run.failedCaptureId = capture.id;
          }
          throw error;
        }
        if (trigger === "manual") console.log(`${capture.id}: absorbed spans ${JSON.stringify(splits.at(-1)!.data.absorbedSpans)}`);
      }
      stage = "route";
      const refs = buildRefs(context.captures, context.folders, context.notes, context.rules,
        splits.map((split) => split.data.items), timezone);
      record.input = routeInput(refs);
      const route = await stages.routeItems(refs);
      record.route = route;
      stage = "coverage";
      let plan = resolveCoverage(refs, route.data);
      record.plan = plan;
      if (dry) Object.assign(record, savedPlan(refs, plan));
      const cost = [...splits, route].reduce((sum, result) => sum + estimateCost(result.model, result.usage), 0);
      record.cost = cost;
      if (!dry) {
        stage = "apply";
        plan = await applyPlan(refs, plan);
        record.plan = plan;
        Object.assign(run, appliedCounts(refs, plan));
      }
      record.applied = !dry;
      run.status = "ok";
      printPlan(refs, plan, dry, route.usage.inputTokens, cost, trigger === "manual");
      return plan;
    }, (cost) => { run.costUsd = cost; });
  } catch (error) {
    run.status = "failed";
    run.error = runError(stage, error);
    record.error = run.error;
    // No raw cause: it can contain source text and be printed by a caller.
    throw new Error(run.error);
  } finally {
    record.cost = run.costUsd;
    // applyPlan has already committed or rolled back before this insert.
    // Insert first, so failure to write a local preview file cannot erase history.
    try {
      if (!dry) await insertOrganizeRun(run);
      if (trigger === "manual") await saveRunRecord(record, directory);
    } catch {
      throw new Error(runError("record", null));
    }
  }
}
