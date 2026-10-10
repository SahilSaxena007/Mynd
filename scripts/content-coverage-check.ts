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

  function checkPlacement(source: string, title: string, section: string, markdown: string, fresh = false) {
    const context = buildRefs([{ ...base.captures[0], body: source }], [...base.folders.values()],
      [{ ...existing, title }], [], [[{ topic: "podcast", quotes: [source], unassigned: false }]], "Europe/London");
    const plan = resolveCoverage(context, {
      new_notes: fresh ? [{ ref: "X1", folder: [...base.folders.keys()][0], title, summary: "Podcast notes" }] : [],
      placements: [{ ...placement, note: fresh ? "X1" : "N1", section, markdown }],
    });
    assert.equal(plan.contentFallbacks, 0);
    assert.equal(plan.filed[0].markdown, markdown);
    assert.equal(savedPlan(context, plan).plan.contentFallbacks, 0);
  }
  checkPlacement("Chapter: Morning cortisol and energy\nSleep well.", "Podcast", "Chapter: Morning cortisol and energy", "Sleep well.");
  pass("heading moved to section counts as written content");
  for (const fresh of [false, true]) {
    checkPlacement("Andrew Huberman Podcast Notes:\nSleep well.", "Andrew Huberman Podcast Notes", "", "Sleep well.", fresh);
  }
  pass("title line moved to existing or new note title counts as written content, including saved plans");
  checkPlacement("Sure, okay. Morning sunlight helps reset the body clock.", "Podcast", "", "Morning sunlight helps reset the body clock.");
  pass("one dropped filler sentence passes when overall coverage remains sufficient");

  const missing = "- Avoid drinking coffee before breakfast.";
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

  const block = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa. red. blue. green.";
  const kept = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa.";
  assert.equal(hasDroppedContent(block, kept), true);
  assert.equal(hasDroppedContent(block, kept, "**BLUE**!"), false);
  assert.equal(hasDroppedContent(block, kept, "blueberry"), true);
  assert.equal(hasDroppedContent("red. " + kept + " blue. " + kept + " green.", kept), false);
  const boundary = "quartz zebra velvet amber bronze copper denim ebony fuchsia golden. red. blue. " + kept;
  assert.equal(hasDroppedContent(boundary, "quartz zebra velvet amber bronze copper denim " + kept), false);
  assert.equal(hasDroppedContent(boundary, "quartz zebra velvet amber bronze copper " + kept), true);
  pass("already-present normalised sentence interrupts an otherwise dropped block");
  const blockRefs = buildRefs([{ ...base.captures[0], body: block }], [...base.folders.values()], [existing], [],
    [[{ topic: "podcast", quotes: [block], unassigned: false }]], "Europe/London");
  const blockFallback = resolve(kept, blockRefs);
  assert.equal(blockFallback.contentFallbacks, 1);
  assert.equal(blockFallback.filed[0].markdown, block);
  pass("three consecutive dropped sentences fall back despite overall coverage above 60%; scattered omissions pass");

  const ten = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
  assert.equal(hasDroppedContent(ten, "alpha bravo charlie delta echo foxtrot golf"), false);
  assert.equal(hasDroppedContent(ten, "alpha bravo charlie delta echo foxtrot"), false);
  assert.equal(hasDroppedContent(ten, "alpha bravo charlie delta echo"), true);
  assert.equal(hasDroppedContent("Buy milk.", "buy milkshake", "Buy milkshake."), true);
  assert.equal(hasDroppedContent("I am 12!", ""), false);
  assert.equal(resolve("").filed[0].markdown, text);
  pass("60% boundary, coverage 0.5, whole-word matching, short-word sentences and empty model text");
}
