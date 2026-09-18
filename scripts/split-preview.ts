import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "../lib/db/client";
import { countModelCallsToday, sumModelCostToday } from "../lib/db/queries";
import type { Capture } from "../lib/db/types";
import { withModelRun, type CompleteResult } from "../lib/model";
import { estimateCost } from "../lib/model/cost";
import { gather } from "../lib/organizer/stage0-gather";
import { splitCapture, splitSchema, type SplitItem } from "../lib/organizer/stage1-split";
import { splitPrompt } from "../lib/prompts/split";

// Lexical diagnostic only: this does not prove semantic or atomic-item coverage.
function wordCoverage(source: string, items: SplitItem[]): number {
  const words = (text: string) => text.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [];
  const original = words(source);
  const output = new Set(items.flatMap((item) => words(item.text)));
  return original.length ? original.filter((word) => output.has(word)).length / original.length : 1;
}

async function preview() {
  const { values } = parseArgs({ options: {
    dry: { type: "boolean", default: false }, id: { type: "string" }, limit: { type: "string" },
  } });
  if (values.id && values.limit) throw new Error("Choose --id or --limit, not both.");
  if (values.id && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(values.id)) {
    throw new Error("--id must be a UUID.");
  }
  if (values.limit !== undefined && (!/^[1-9]\d*$/.test(values.limit)
    || !Number.isSafeInteger(Number(values.limit)))) throw new Error("--limit must be a positive integer.");

  const startedAt = new Date().toISOString();
  const context = await gather();
  let captures = context.captures;
  if (values.id) {
    captures = captures.filter((capture) => capture.id === values.id);
    if (!captures.length) throw new Error("No pending capture with that id.");
  }
  if (values.limit) captures = [...captures].sort((a, b) =>
    b.capturedAt.getTime() - a.capturedAt.getTime() || b.id.localeCompare(a.id)).slice(0, Number(values.limit));

  const beforeCalls = await countModelCallsToday();
  const beforeCost = await sumModelCostToday();
  const results: { capture: Capture; result?: CompleteResult<{ items: SplitItem[] }>; wordCoverage?: number }[] = [];
  const summary = { calls: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, estCostUsd: 0,
    todayCostUsd: beforeCost };
  let failed = false;
  try {
    for (const capture of captures) {
      console.log(`\n${capture.id}: ${capture.body.split(/\r?\n/, 1)[0]}`);
      if (values.dry) {
        console.log(capture.body);
        results.push({ capture });
        continue;
      }
      const result = await splitCapture(capture);
      summary.calls += 1;
      summary.inputTokens += result.usage.inputTokens;
      summary.outputTokens += result.usage.outputTokens;
      summary.cachedTokens += result.usage.cachedTokens;
      summary.estCostUsd += estimateCost(result.model, result.usage);
      const coverage = wordCoverage(capture.body, result.data.items);
      results.push({ capture, result, wordCoverage: coverage });
      result.data.items.forEach((item, index) => console.log(`  ${index + 1}. [${item.topic}] ${item.text}`));
      console.log(`  Word coverage: ${(coverage * 100).toFixed(1)}% (diagnostic, NOT the no-loss guarantee)`);
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    summary.todayCostUsd = await sumModelCostToday();
    const afterCalls = await countModelCallsToday();
    console.log(`\n${values.dry ? "DRY: " : ""}${summary.calls} completed calls; `
      + `${summary.inputTokens} input / ${summary.outputTokens} output / ${summary.cachedTokens} cached tokens; `
      + `estimated $${summary.estCostUsd.toFixed(6)}; today $${summary.todayCostUsd.toFixed(6)}.`);
    if (values.dry) console.log(`Model-call rows today: ${beforeCalls} before, ${afterCalls} after.`);
    if (failed) console.log("Run stopped. Summary covers completed splits; today's total also includes logged unusable responses.");
    const directory = join(process.cwd(), ".runs");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${startedAt.replaceAll(":", "-")}-${randomUUID()}.json`);
    await writeFile(path, JSON.stringify({ startedAt, dry: values.dry, failed,
      prompt: splitPrompt, schema: splitSchema, selectedCaptures: captures, results, summary }, null, 2), { flag: "wx" });
    console.log(`Run saved: ${path}`);
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  try {
    await withModelRun(preview);
  } catch (error) {
    // Provider errors can contain source text or credentials. Guard failures log their own limit.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "preview error";
    console.error(`FAIL: Split preview stopped (${code}); no vault writes were made. Check arguments, configuration, and connectivity.`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
