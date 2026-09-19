import assert from "node:assert/strict";
import { completeSplit } from "../lib/organizer/split-coverage";
import { formatPreviewError, ModelProviderError } from "../lib/model/errors";

const item = (quotes: string[], topic = "test") => ({ topic, quotes });
const unassigned = (text: string) => ({ topic: "unassigned", quotes: [text], unassigned: true });
const cases: [string, () => void][] = [
  ["Skipped sentence is restored verbatim", () => {
    const result = completeSplit("First. Skipped sentence. Last.", [item(["First.", "Last."])]);
    assert.deepEqual(result.items[0].quotes, ["First. Skipped sentence. Last."]);
    assert.equal(result.items.length, 1);
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
    assert.deepEqual(result.items[1].quotes, [" Second. Third."]);
    assert.equal(JSON.stringify(model), before, "inputs must not be mutated");
    assert.deepEqual(completeSplit("First. Second. Third.", model), result, "deterministic output");
  }],
  ["Dingbra sentence scraps rejoin the whole capture", () => {
    const source = "Remember I told you I have a meeting with Dingbra? Now I know what to speak to him about. I need access to the system. If you could provide that, thanks!";
    const result = completeSplit(source, [item(["I have a meeting with Dingbra", "I need access to the system"], "Work")]);
    assert.deepEqual(result.items, [{ topic: "work", quotes: [source], unassigned: false }]);
    assert.ok(result.absorbedSpans.sentenceIntegrity > 0);
    assert.equal(result.absorbedSpans.singleHome, 2);
    assert.ok(result.claimedFraction < 1, "model diagnostic excludes code repairs");
  }],
  ["Sandwiched sentence joins its one possible item", () => {
    const source = "First! Keep this example? Last.";
    const result = completeSplit(source, [item(["First!", "Last."])]);
    assert.deepEqual(result.items[0].quotes, [source]);
    assert.equal(result.items.length, 1);
    assert.equal(result.absorbedSpans.singleHome, 1);
  }],
  ["Sentence between different items remains unassigned", () => {
    const source = "Work. Maybe this belongs elsewhere. Home.";
    const result = completeSplit(source, [item(["Work."], "work"), item(["Home."], "home")]);
    assert.deepEqual(result.items[1], unassigned(" Maybe this belongs elsewhere."));
    assert.equal(result.absorbedSpans.singleHome, 0);
    assert.equal(result.items.flatMap((entry) => entry.quotes).join(""), source);
    // A sentence claimed by multiple items is not a single possible home either.
    const mixed = completeSplit("Work and home. Unclear. Home.", [item(["Work"], "work"), item(["home", "Home."], "home")]);
    assert.equal(mixed.items.find((entry) => entry.unassigned)?.quotes[0], " Unclear.");
  }],
  ["First and last unclaimed sentences join their only neighbour", () => {
    const source = "Opening. Claimed. Closing.";
    const result = completeSplit(source, [item(["Claimed."])]);
    assert.deepEqual(result.items[0].quotes, [source]);
    assert.equal(result.items.length, 1);
    assert.equal(result.absorbedSpans.singleHome, 2);
  }],
  ["List lines are segments and keep their original line breaks", () => {
    const source = "- milk\r\n- shoes, but I am not sure\r\n- bread";
    const result = completeSplit(source, [item(["- milk", "- bread"])]);
    assert.deepEqual(result.items[0].quotes, [source]);
    assert.equal(result.items.length, 1);
    const separate = completeSplit("Work\nUnknown\nHome", [item(["Work"], "work"), item(["Home"], "home")]);
    assert.deepEqual(separate.items[1], unassigned("Unknown\n"));
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
console.log("PASS: All 12 coverage cases; zero model calls (no model or database imports).");
