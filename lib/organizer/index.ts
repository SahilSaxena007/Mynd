import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import type { Folder, Note } from "../db/types";
import { withModelRun } from "../model";
import { estimateCost } from "../model/cost";
import { formatPreviewError } from "../model/errors";
import { routePrompt } from "../prompts/route";
import { splitPrompt } from "../prompts/split";
import { resolveCoverage, type ResolvedPlan } from "./coverage";
import { buildRefs, localDate, routeInput, type RunRefs } from "./refs";
import { printPlan } from "./print";
import { gatherForOrganize } from "./stage0-gather";
import { splitCapture } from "./stage1-split";
import { routeItems } from "./stage2-route";
import { applyPlan, assertResolvedPlan } from "./stage3-apply";

type SavedRefs = Omit<RunRefs, "folders" | "notes" | "newNoteRefs"> & {
  folders: [string, Folder][];
  notes: [string, Note][];
  newNoteRefs: string[];
};
export function savedPlan(refs: RunRefs, plan: ResolvedPlan) {
  assertResolvedPlan(refs, plan);
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
        reason: { enum: ["unsure", "invalid_target", "not_placed"] },
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
  const plan = await applyPlan(refs, data.plan, true);
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

export async function runOrganize({ dry = false, limit = 10 }: { dry?: boolean; limit?: number } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
  const context = await gatherForOrganize(Math.min(limit, 10));
  if (!context.captures.length) { console.log("No pending captures. No model calls."); return; }
  const timezone = process.env.USER_TIMEZONE;
  localDate(context.captures[0].capturedAt, timezone); // Fail closed before spending.
  const startedAt = new Date().toISOString();
  const record: Record<string, unknown> = { startedAt, dry, context, splitPrompt, routePrompt };
  const splits: Awaited<ReturnType<typeof splitCapture>>[] = [];
  record.splits = splits;
  let stage = "split";
  let captureIds = context.captures[0].id;
  try {
    return await withModelRun(async () => {
      for (const capture of context.captures) {
        captureIds = capture.id;
        splits.push(await splitCapture(capture));
        console.log(`${capture.id}: absorbed spans ${JSON.stringify(splits.at(-1)!.data.absorbedSpans)}`);
      }
      stage = "route";
      captureIds = context.captures.map((capture) => capture.id).join(", ");
      const refs = buildRefs(context.captures, context.folders, context.notes, context.rules,
        splits.map((split) => split.data.items), timezone);
      record.input = routeInput(refs);
      const route = await routeItems(refs);
      record.route = route;
      stage = "coverage";
      let plan = resolveCoverage(refs, route.data);
      record.plan = plan;
      if (dry) Object.assign(record, savedPlan(refs, plan));
      const cost = [...splits, route].reduce((sum, result) => sum + estimateCost(result.model, result.usage), 0);
      record.cost = cost;
      if (!dry) { stage = "apply"; plan = await applyPlan(refs, plan); record.plan = plan; }
      record.applied = !dry;
      printPlan(refs, plan, dry, route.usage.inputTokens, cost);
      return plan;
    });
  } catch (error) {
    const message = `${stage} failed for capture(s) ${captureIds}: ${formatPreviewError(error)}`;
    record.error = message;
    throw new Error(message, { cause: error });
  } finally {
    await saveRunRecord(record);
  }
}
