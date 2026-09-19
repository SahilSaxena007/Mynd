import { loadEnvConfig } from "@next/env";
import { parseArgs } from "node:util";
import { closeDb } from "../lib/db/client";
import { getCapturesByIds, getNotesWithBodies, listActiveRules, listFolders } from "../lib/db/queries";
import { withModelRun } from "../lib/model";
import { estimateCost } from "../lib/model/cost";
import { formatPreviewError } from "../lib/model/errors";
import { resolveCoverage } from "../lib/organizer/coverage";
import { saveRunRecord } from "../lib/organizer";
import { printPlan } from "../lib/organizer/print";
import { buildRefs, localDate } from "../lib/organizer/refs";
import { splitCapture } from "../lib/organizer/stage1-split";
import { routeItems } from "../lib/organizer/stage2-route";

async function main() {
  loadEnvConfig(process.cwd());
  const previousModel = process.env.ROUTE_MODEL;
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      ids: { type: "boolean" }, "no-notes": { type: "boolean" }, "route-model": { type: "string" },
    } });
    const ids = [...new Set(positionals.map((id) => id.toLowerCase()))];
    if (!values.ids || !ids.length || ids.some((id) => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id))) {
      throw new Error("--ids requires capture UUIDs.");
    }
    const model = values["route-model"] ?? process.env.ROUTE_MODEL ?? process.env.ORGANIZE_MODEL ?? "";
    estimateCost(model, { inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
    process.env.ROUTE_MODEL = model;
    const [captures, folders, notes, rules] = await Promise.all([
      getCapturesByIds(ids), listFolders(), values["no-notes"] ? Promise.resolve([]) : getNotesWithBodies(), listActiveRules(),
    ]);
    const missing = ids.filter((id) => !captures.some((capture) => capture.id === id));
    if (missing.length) throw new Error(`Captures not found: ${missing.join(", ")}`);
    localDate(captures[0].capturedAt, process.env.USER_TIMEZONE);
    await withModelRun(async () => {
      const splits: Awaited<ReturnType<typeof splitCapture>>[] = [];
      for (const capture of captures) {
        const split = await splitCapture(capture);
        splits.push(split);
        console.log(`${capture.id}: absorbed spans ${JSON.stringify(split.data.absorbedSpans)}`);
      }
      const refs = buildRefs(captures, folders, notes, rules, splits.map((split) => split.data.items), process.env.USER_TIMEZONE);
      const route = await routeItems(refs);
      const plan = resolveCoverage(refs, route.data);
      const cost = [...splits, route].reduce((total, result) => total + estimateCost(result.model, result.usage), 0);
      printPlan(refs, plan, true, route.usage.inputTokens, cost);
      // A replay is deliberately not an applyable dry run.
      await saveRunRecord({ startedAt: new Date().toISOString(), preview: true, captures, splits, route, plan, cost });
    });
  } catch (error) {
    console.error(formatPreviewError(error)); process.exitCode = 1;
  } finally {
    if (previousModel === undefined) delete process.env.ROUTE_MODEL;
    else process.env.ROUTE_MODEL = previousModel;
    await closeDb();
  }
}
void main();
