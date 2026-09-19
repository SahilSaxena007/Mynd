import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withModelRun } from "../model";
import { estimateCost } from "../model/cost";
import { formatPreviewError } from "../model/errors";
import { routePrompt } from "../prompts/route";
import { splitPrompt } from "../prompts/split";
import { resolveCoverage } from "./coverage";
import { buildRefs, localDate, routeInput } from "./refs";
import { printPlan } from "./print";
import { gatherForOrganize } from "./stage0-gather";
import { splitCapture } from "./stage1-split";
import { routeItems } from "./stage2-route";
import { applyPlan } from "./stage3-apply";

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
    const directory = join(process.cwd(), ".runs");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${startedAt.replaceAll(":", "-")}-${randomUUID()}.json`);
    await writeFile(path, JSON.stringify(record, null, 2), { flag: "wx" });
    console.log(`Run saved: ${path}`);
  }
}
