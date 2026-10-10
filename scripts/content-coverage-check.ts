import assert from "node:assert/strict";
import { hasDroppedContent } from "../lib/organizer/content-coverage";
import { resolveCoverage } from "../lib/organizer/coverage";
import { buildRefs, type RunRefs } from "../lib/organizer/refs";
import { savedPlan } from "../lib/organizer";
import { printPlan } from "../lib/organizer/print";

export function checkContentCoverage(base: RunRefs, pass: (label: string) => void) {
  const text = "Morning sunlight helps reset the body clock.\r\nAvoid drinking coffee before breakfast.";
  const existing = [...base.notes.values()][0];
  const refs = buildRefs([{ ...base.captures[0], body: text }], [...base.folders.values()], [existing], [],
    [[{ topic: "podcast", quotes: [text], unassigned: false }]], "Europe/London");
  const placement = { item: "I1", confidence: "sure" as const, subject: "", note: "N1", section: "Morning",
    markdown: "- Morning sunlight resets the body clock.\n- Avoid coffee before breakfast.", options: [] };
  const resolve = (markdown: string, context = refs) => resolveCoverage(context,
    { new_notes: [], placements: [{ ...placement, markdown }] });
  const faithful = resolve(placement.markdown);
  assert.equal(faithful.contentFallbacks, 0);
  assert.equal(faithful.filed[0].markdown, placement.markdown);
  pass("faithful rephrase retains at least 70% of each sentence's words");

  const missing = "- Morning sunlight helps reset the body clock.";
  const fallback = resolve(missing);
  assert.equal(fallback.contentFallbacks, 1);
  assert.equal(fallback.filed[0].markdown, text);
  assert.equal(fallback.filed[0].note, placement.note);
  assert.equal(fallback.filed[0].section, placement.section);
  assert.equal(fallback.queued.length, 0);
  assert.equal(savedPlan(refs, fallback).plan.contentFallbacks, 1);
  const logs: string[] = [];
  const log = console.log;
  try { console.log = (value: string) => { logs.push(value); }; printPlan(refs, fallback, true, 0, 0, false); }
  finally { console.log = log; }
  assert.ok(logs.includes("contentFallbacks 1"));
  assert.throws(() => savedPlan(refs, { ...fallback,
    filed: [{ ...fallback.filed[0], markdown: missing }] }), /dropped content/);
  pass("missing sentence falls back to verbatim with note/section retained; count saved/printed and saved-plan bypass refused");

  const dedup = { ...refs, notes: new Map([["N1", { ...existing,
    body: "## Earlier\n- AVOID **drinking** coffee before breakfast!" }]]) };
  const represented = resolve(missing, dedup);
  assert.equal(represented.contentFallbacks, 0);
  assert.equal(represented.filed[0].markdown, missing);
  assert.equal(resolve(missing, { ...refs, notes: new Map([["N1", {
    ...existing, body: "Avoid coffee before breakfast.",
  }]]) }).contentFallbacks, 1, "existing body requires the full normalised sentence");
  pass("already-present sentence permits de-duplication using normalised whole words");

  const ten = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
  assert.equal(hasDroppedContent(ten, "alpha bravo charlie delta echo foxtrot golf"), false);
  assert.equal(hasDroppedContent(ten, "alpha bravo charlie delta echo foxtrot"), true);
  assert.equal(hasDroppedContent("Buy milk.", "buy milkshake", "Buy milkshake."), true);
  assert.equal(hasDroppedContent("I am 12!", ""), false);
  assert.equal(resolve("").filed[0].markdown, text);
  pass("70% boundary, whole-word matching, short-word sentences and empty model text handled deterministically");
}
