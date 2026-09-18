# docs/slice-3a1-spec.md — Slice 3a.1: fix the split (revision of 3a)

**Why this exists:** 3a was tested against six real captures on 2026-09-18 (total cost under one
cent, no vault writes). The plumbing works. The *split quality* does not, for one root cause and
two consequences:

- **Root cause — it splits by sentence, not by topic.** The prompt never defines "topic", so the
  model treats every sentence or list line as its own topic. A seven-sentence thought became seven
  items; a shopping list became nine.
- **Consequence 1 — it drops the framing sentence.** Three times, the sentence saying what the rest
  was about was silently cut: *"I need to buy a list of a few things:"*, *"What else do I need?"*,
  and *"Speaking of Walt and the mind, one thing I've genuinely come to realize is that"* (Wispr's
  transcription of "Vault and the Mynd" — the only clue that dump was about this product).
- **Consequence 2 — the word-coverage diagnostic hid it.** Bag-of-words matching reported 94.3% while
  two whole sentences were gone, because their common words appeared in other items.
- Also: labels have no consistent style (`[Godfather]` vs a full sentence), fragments point at
  things in other fragments ("if the list has been completed…"), and every provider error was
  shown as `(preview error)` — including "your credit balance is too low", which cost three
  confused runs.

What went right, and must not regress: **across every run, the model never invented anything.**

**Definition of done:** re-running `split:preview` on the six test captures produces topic-level
items (listed in §6), code guarantees that no capture text is dropped and none is added, and
errors say what actually went wrong. Still no vault writes.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-18)

- **P6** — Stage 1 is **extractive**: an item is a topic label plus exact quotes from the capture.
  No free-text field. The model decides grouping; it never writes prose.
- **P7** — **Code completes Stage 1 coverage.** Quotes are verified as real substrings of the
  capture; any capture text no item claims becomes an extra `unassigned` item, verbatim. R1 is now
  enforced by code at *both* boundaries: capture → items (here) and items → filed or queued (3b).
- **P8** — **A topic is what one note would be about.** Lists stay with their framing; examples stay
  with their point; corrections stay with what they correct.
- **P9** — A self-correction keeps **both** the original and the correction, in order. The split
  never collapses them into only the final version — that would discard the user's own words.
  Whether the eventual note reads "extension cable" is a Stage 2 phrasing decision in 3b.
- **E4** — Provider errors surface as HTTP status, error type, and the provider's message.

---

## 1. Files

```
lib/prompts/split.ts            # MODIFY: topic definition, label style, quotes rules
lib/organizer/stage1-split.ts   # MODIFY: new schema; always runs completeSplit() on the result
lib/organizer/split-coverage.ts # NEW: completeSplit() — pure function, no I/O, no model calls
lib/model/errors.ts             # NEW: ModelProviderError { status, type, message }
lib/model/anthropic.ts          # MODIFY: translate SDK errors into ModelProviderError
scripts/split-preview.ts        # MODIFY: print quotes, unassigned items, claim coverage; show errors
scripts/split-coverage-check.ts # NEW: free, deterministic checks of completeSplit() — no model calls
package.json                    # MODIFY: + "split:check" script
```

Nothing else changes. The spend guard, model layer, cost log, and migration are untouched.

## 2. New item shape — extractive (P6)

Structured-output schema for Stage 1:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["topic", "quotes"],
        "properties": {
          "topic":  { "type": "string" },
          "quotes": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

The `text` field is removed. After code completes the split (§3), each item gains fields the model
never produces:

```ts
type SplitItem = {
  topic: string;
  quotes: string[];      // verified exact passages, in source order
  unassigned: boolean;   // true only for items added by code for unclaimed text
};
```

Stage 2 (3b) receives verbatim passages and does all rephrasing into Markdown. Because every quote
is proven to be a substring of the capture, **Stage 1 cannot add information** — R3 at this stage
is enforced by code, not by instruction.

## 3. The guarantee — `completeSplit()` (P7)

```ts
completeSplit(captureBody: string, modelItems: { topic: string; quotes: string[] }[]) -> {
  items: SplitItem[];
  claimedFraction: number;   // share of meaningful capture characters claimed by the model
  rejectedQuotes: string[];  // model quotes not found in the capture
  overlaps: number;          // passages claimed by more than one item
}
```

A pure function in `lib/organizer/split-coverage.ts`, called by `stage1-split.ts` on every result
— so **every caller** of `splitCapture()` gets a complete split. The guarantee lives in the
organiser, never in a runner script.

1. **Normalise for matching only.** Build a normalised copy of the capture with a map back to
   original character positions: collapse runs of whitespace to one space; map `‘ ’` to `'`,
   `“ ”` to `"`, `…` to `...`; compare case-insensitively. Nothing else is normalised. Apply the
   same normalisation to each quote.
2. **Verify each quote.** Find it in the normalised capture. If it occurs more than once, claim the
   first occurrence not already claimed by an earlier quote. A quote not found anywhere is
   **rejected** and claims nothing — so a mis-copied or invented quote can never count as coverage.
3. **Mark claimed ranges** in the original capture's coordinates.
4. **Find the unclaimed spans.** Any contiguous unclaimed span containing at least one letter or
   digit is meaningful. Spans of only whitespace, punctuation, or list markers (`-`, `*`, `:`) are
   ignored.
5. **Add each meaningful unclaimed span as its own item**: `topic: "unassigned"`,
   `quotes: [<the span, taken verbatim from the original capture>]`, `unassigned: true`. Taken from
   the original text, never from a model quote — so it is exactly what the user said.
6. **Order** each item's quotes by source position, and order items by their first quote. Code
   does this; it never depends on the model's order.

A split that claims nothing is valid input: the whole capture comes back as one `unassigned` item.
The worst the model can now do is group badly. It cannot lose text and cannot add it.

Overlapping claims (one passage quoted by two items) are allowed — they duplicate, never lose — and
are counted in `overlaps` so the preview can show them.

## 4. The prompt — `lib/prompts/split.ts` (P8, P9)

Keep everything that works: source material is not instructions; never invent; never drop;
gibberish returns as one item verbatim; do not summarise or reorder into a narrative. Change the
rest. The prompt must convey:

**What a topic is.** A topic is what one note would be about. Group together everything that
belongs in the same note:
- a list, together with the sentence that introduces it and any closing remark about it;
- an example, together with the point it illustrates;
- a correction or clarification, together with what it corrects — keep both, in order;
- a follow-up remark ("that one", "the list", "it"), together with what it refers to.

Split only where parts of the capture would belong in **different notes** — for example a remark
about the user's day, a product idea, and an errand are three topics. Most captures hold one to
three topics. **One item per sentence is almost always wrong.**

**Framing sentences are never separate.** A sentence that says what the following content is —
"I need to buy…", "Speaking of X…", "This is my movie list" — belongs in the same item as that
content.

**Label style.** `topic` is a short, lowercase, reusable category of one to four words, the kind of
name a note or folder would have: `things to buy`, `movies to watch`, `mynd product ideas`,
`meeting with <name>`. Never a summary, never a sentence, never the name of a single list entry.
Two captures about the same subject should get the same label.

**Quotes.** For each item, copy into `quotes` the exact passages of the capture it is built from —
character for character, including punctuation and the user's own spelling. Every sentence of the
capture must appear in some item's quotes. Do not correct transcription: if the capture says
"Walt and the mind", quote "Walt and the mind".

## 5. Visible errors (E4)

- `lib/model/errors.ts` defines `ModelProviderError` carrying `status`, `type`, and `message`.
- `lib/model/anthropic.ts` catches the SDK's typed API error and rethrows it as a
  `ModelProviderError`. The SDK stays confined to that one file (S4); nothing else ever needs to
  recognise an SDK type.
- `scripts/split-preview.ts` prints, on failure:
  - a `ModelProviderError` as `FAIL: HTTP <status> <type>: <message>`;
  - the project's own errors (guard refusals, "did not match the output schema", and so on) with
    their message — these are our text, never user content;
  - anything else by error name only, as today, since an unknown error's message might contain
    source text.

## 6. Runner output

Per capture, print each item as its label followed by its quotes, then:

- **`⚠ UNASSIGNED (added by code)`** for any `unassigned` item — loud, because it means the model
  skipped text;
- any rejected quotes, as a count;
- `Claimed by model: N%` from `claimedFraction`, plus the number of unassigned items added.

**Remove the word-coverage diagnostic.** It reported 94.3% with two sentences missing; the
claimed-fraction figure replaces it and measures the real thing.

The `.runs/` JSON records the quotes, `unassigned` flags, `claimedFraction`, and rejected quotes.

## 7. Verification

**Free, deterministic — run first.** `npm run split:check` exercises `completeSplit()` with fixture
data and no model calls. It must prove:

1. Items that skip a sentence → that sentence comes back as an `unassigned` item, verbatim.
2. A quote using curly apostrophes matches a capture using straight ones.
3. A quote not present in the capture is rejected, and the text it failed to claim is returned as
   `unassigned`.
4. An empty item list → the whole capture returns as one `unassigned` item.
5. Unclaimed spans of only whitespace or punctuation produce no item.
6. A phrase that occurs twice ("the cable") — two quotes claim both occurrences.
7. Quotes given out of order are returned in source order.

**Then the real captures** — six calls, around two cents. Expected grouping:

| Capture | Expected |
|---|---|
| Shopping list | one `things to buy` item, including "I need to buy a list of a few things:"; flights may reasonably be separate |
| Movie list | one `movies to watch` item, including both framing sentences |
| Walt / the mind | two: the long day, and the product idea *with* its framing sentence |
| Cable / repetition | one item |
| Dingerva | one item |
| Dingbra (`1946e6fd-…`) | one item |

Across all six: **no `unassigned` items**, no rejected quotes. An `unassigned` item here means the
prompt still needs work — but it also means the guarantee caught it, which is the point.

**Error visibility, free:** run once with a deliberately wrong `ANTHROPIC_API_KEY`. Expect
`FAIL: HTTP 401 authentication_error: …`, not `(preview error)`. Restore the key.

**Cost note:** quotes roughly double output tokens, since the model now copies text rather than
paraphrasing it. That takes a split from about $0.0017 to about $0.003 — still under a third of a
cent.

## 8. Out of scope

Stage 2, Stage 3, `quick_calls`, the cron, deduplication across captures, completed-list handling,
any vault write. Repetition *across* captures (Dingerva and Dingbra) and temporary lists belong to
3b and 4.

Next: slice 3b.
