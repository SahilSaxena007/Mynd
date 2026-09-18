import assert from "node:assert/strict";
import { completeSplit } from "../lib/organizer/split-coverage";
import { formatPreviewError, ModelProviderError } from "../lib/model/errors";

const item = (quotes: string[], topic = "test") => ({ topic, quotes });
const unassigned = (text: string) => ({ topic: "unassigned", quotes: [text], unassigned: true });
const cases: [string, () => void][] = [
  ["Skipped sentence is restored verbatim", () => {
    const result = completeSplit("First. Skipped sentence. Last.", [item(["First.", "Last."])]);
    assert.deepEqual(result.items[1], unassigned(" Skipped sentence. "));
    assert.equal(result.claimedFraction, 9 / 24);
  }],
  ["Curly apostrophes match straight originals", () => {
    const source = "It's my cable.";
    const result = completeSplit(source, [item(["It’s my cable."])]);
    assert.equal(result.claimedFraction, 1);
    assert.deepEqual(result.items[0].quotes, [source]);
    const expanded = '“WAIT…”,\n\tI said.';
    const matched = completeSplit(expanded, [item(['"wait...", I said.'])]);
    assert.deepEqual(matched.items[0].quotes, [expanded]);
    assert.equal(matched.claimedFraction, 1);
  }],
  ["Invented quotes claim nothing", () => {
    const result = completeSplit("Buy milk.", [item(["Buy bread."])]);
    assert.deepEqual(result.rejectedQuotes, ["Buy bread."]);
    assert.equal(result.claimedFraction, 0);
    assert.deepEqual(result.items, [unassigned("Buy milk.")]);
    assert.deepEqual(completeSplit("Original", [item([""])]).items, [unassigned("Original")]);
  }],
  ["Empty item list restores the whole capture", () => {
    const source = "  Unfinished…\n— 我的笔记 𐐀42";
    assert.deepEqual(completeSplit(source, []).items, [unassigned(source)]);
    assert.equal(completeSplit(source, []).claimedFraction, 0);
    assert.deepEqual(completeSplit("", []).items, []);
  }],
  ["Whitespace and punctuation gaps are ignored", () => {
    const result = completeSplit(" - * : Alpha.\n\t— Beta! ...", [item(["Alpha", "Beta"])]);
    assert.equal(result.items.length, 1);
    assert.equal(result.claimedFraction, 1);
    assert.deepEqual(completeSplit(" - * : … \n", []).items, []);
  }],
  ["Repeated phrases claim distinct occurrences", () => {
    const result = completeSplit("the cable, the cable", [item(["the cable"]), item(["the cable"])]);
    assert.equal(result.claimedFraction, 1);
    assert.equal(result.overlaps, 0);
    assert.equal(result.items.length, 2);
    const overlap = completeSplit("the cable", [item(["the cable"]), item(["cable"])]);
    assert.equal(overlap.overlaps, 1);
    assert.equal(overlap.claimedFraction, 1);
    assert.equal(overlap.items.length, 2);
  }],
  ["Quotes and items are returned in source order", () => {
    const model = [item(["Third.", "Second."], "later"), item(["First."], "earlier")];
    const before = JSON.stringify(model);
    const result = completeSplit("First. Second. Third.", model);
    assert.deepEqual(result.items.map((entry) => entry.topic), ["earlier", "later"]);
    assert.deepEqual(result.items[1].quotes, ["Second.", "Third."]);
    assert.equal(JSON.stringify(model), before, "inputs must not be mutated");
    assert.deepEqual(completeSplit("First. Second. Third.", model), result, "deterministic output");
  }],
];

for (const [name, check] of cases) {
  check();
  console.log(`PASS: ${name}`);
}
assert.equal(formatPreviewError(new ModelProviderError(401, "authentication_error", "Invalid API key")),
  "FAIL: HTTP 401 authentication_error: Invalid API key");
assert.equal(formatPreviewError(new Error("Model response did not match the output schema.")),
  "FAIL: Model response did not match the output schema.");
assert.equal(formatPreviewError(new Error("Model call refused: DAILY_CALL_CAP exceeded.")),
  "FAIL: Model call refused: DAILY_CALL_CAP exceeded.");
assert.equal(formatPreviewError(new SyntaxError("private capture text")), "FAIL: SyntaxError");
assert.equal(formatPreviewError(new Error("private capture text")), "FAIL: Error");
console.log("PASS: Error visibility and unknown-message redaction");
console.log("PASS: All 7 coverage cases; zero model calls (no model or database imports).");
