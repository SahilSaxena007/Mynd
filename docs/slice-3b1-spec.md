# docs/slice-3b1-spec.md — Slice 3b.1: make the plan you review the plan that gets written

**Why this exists.** 3b's first real run (2026-09-19) on seven captures showed the pipeline and its
guarantees working — nothing lost, nothing invented, no half-writes — but four quality problems:

1. **A confident wrong filing.** The Mynd idea *"the organizer could use two prompts instead of one"*
   was filed `sure` into the Work note "meeting with Dingerva". Every code check passed, because the
   folder and the note both existed. It is now in the vault, and notes are append-only.
2. **The dry run did not predict the real run.** Same seven captures, two runs: the dry run pooled
   Dingerva and Dingbra into one note and queued the "two prompts" idea; the real run did the
   opposite on both. The user reviewed one plan and got a different, worse one.
3. **The split cut sentences in half.** For the Dingbra capture the model quoted
   "I have a meeting with Dingbra" out of "Remember I told you I have a meeting with Dingbra?", and
   code restored the scraps — "Remember I told you", "? Now I know what to speak to him about." —
   as separate items. 4 of the 9 Quick Calls were scraps like these, not real uncertainty.
4. **Lossy rephrasing.** "I need to buy shoes, but I am not sure" became `Shoes`; "house, then
   grocery, then list" became "a specific location". Nothing was added, but meaning was dropped.

Also found: the seven test captures are now `processed`, so `--dry` can no longer be run on them,
leaving no fixed set to compare prompt versions against.

**Definition of done:** `organize --apply` writes exactly a reviewed dry-run plan with no new model
call; the split no longer produces sentence scraps; `route:preview` can replay any captures against
either model without writing; and on the seven test captures the "two prompts" idea is not filed
into a meeting note.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-19)

Made by the human:
- **P23** — **The real run applies exactly the reviewed plan.** `organize --dry` saves its plan;
  `organize --apply <run file>` writes that plan with no model call, after re-checking it is still
  valid. Also fixes P19.
- **S12** — **Stage 2 routes on `claude-sonnet-5`**; splitting stays on `claude-haiku-4-5`.
- **O2** — Name mismatches from transcription ("Dingerva" / "Dingbra") are not engineered around.
  The fix is Wispr's personal dictionary.

Derived, flagged for review:
- **P20** — Randomness is turned to its minimum (`temperature: 0`) for split and route **on models
  that accept it**. Never sent to a model that rejects sampling parameters (Sonnet 5 does).
- **P21** — Two deterministic rules in `completeSplit()`: a sentence is never split, and a leftover
  with only one possible home joins it. **Revises P10**, which said all attachment is judgment — it
  is only a judgment when there is more than one home.
- **P22** — The route prompt keeps qualifiers, doubts, reasons and examples, and links items across
  captures only when the text itself shows they share a subject.
- **T1** — `route:preview` replays any captures, in any status, and never writes to the vault.

---

## 1. Files

```
lib/model/capabilities.ts       # NEW: per-model table — supportsTemperature (and room for more)
lib/model/anthropic.ts          # MODIFY: send temperature 0 only when the model supports it
lib/organizer/split-coverage.ts # MODIFY: P21 — sentence integrity + single-home attachment
lib/prompts/route.ts            # MODIFY: P22
lib/organizer/index.ts          # MODIFY: dry runs save an applyable plan; --apply path
lib/organizer/stage3-apply.ts   # MODIFY: lock captures, require pending (P19)
lib/db/organizer-targets.ts     # MODIFY: + lock the run's captures FOR UPDATE
lib/db/queries.ts               # MODIFY: markCaptureProcessed requires status = 'pending'
scripts/organize.ts             # MODIFY: + --apply <run file>
scripts/route-preview.ts        # NEW: T1
scripts/split-coverage-check.ts # MODIFY: + P21 cases
scripts/organize-check.ts       # MODIFY: + P23 / P19 cases
package.json                    # MODIFY: + route:preview
```

The user sets `ROUTE_MODEL=claude-sonnet-5` in `.env` themselves (S12). Codex must not edit `.env`.

## 2. P20 — randomness down, where the model allows it

`lib/model/capabilities.ts` holds a table keyed by model id — the same keys as the rate table in
`cost.ts`:

```
claude-haiku-4-5  -> { supportsTemperature: true }
claude-sonnet-5   -> { supportsTemperature: false }   // sampling parameters are rejected
```

`anthropic.ts` sends `temperature: 0` for the `split` and `route` jobs **only** when the table says
the model supports it. An unknown model id gets no temperature — sending it to a model that rejects
it would fail every call. `answer` and `grader` jobs are unchanged.

Temperature 0 reduces variation; it does not remove it. The guarantee that what was reviewed is
what gets written comes from P23, not from this.

Sonnet 5 runs adaptive thinking by default when `thinking` is omitted. Leave it that way for
routing: it is the stronger model's advantage on exactly the kind of mistake that happened.
Thinking tokens count toward `max_tokens`; if a route call ends with `stop_reason: max_tokens`, it
already fails loudly and is logged (SP5).

## 3. P21 — the split's two deterministic rules (`completeSplit()`)

After quotes are matched and claims marked (P7, unchanged), and before unclaimed text becomes
`unassigned` items:

**Segment the capture into sentences**, deterministically: a sentence ends at `.`, `?` or `!`
followed by whitespace or the end of the text, and every line break also ends a segment (so list
lines are segments). Keep each segment's character range in the original text.

**Rule 1 — a sentence is never split.** If part of a sentence is claimed and part is not, the
unclaimed part joins the item that claims the text immediately before it in that sentence, or, if
nothing before it is claimed, the item that claims the text immediately after it.
*Dingbra:* the model claimed "I have a meeting with Dingbra"; "Remember I told you " and the "?"
join that item.

**Rule 2 — a leftover with only one possible home joins it.** Take each run of consecutive, wholly
unclaimed sentences. Look at the nearest claimed sentence before it and the nearest after it,
treating the start and end of the capture as having no neighbour. If every neighbour that exists
belongs to **one and the same item**, the run joins that item. If the neighbours belong to
**different** items, the run stays `unassigned` — that is a real choice, and a choice goes to the
user.
*Dingbra:* "Now I know what to speak to him about." sits between two parts of the same item, so it
joins it; the closing "If you could provide that…" has one neighbour, so it joins too.

Both rules only move the user's own text between items. Nothing is added, nothing is lost, and the
P7 guarantee is unchanged. A capture where the model claims nothing still returns whole as one
`unassigned` item. The preview and the run JSON report how many spans each rule absorbed.

## 4. P22 — the route prompt

Add to `lib/prompts/route.ts`:

- **Keep what carries meaning.** When rephrasing, keep every qualifier and doubt ("but I am not
  sure"), reason ("it will take up space, but I need it") and concrete example ("house, then
  grocery, then list"). Drop only word-for-word repetition. Shorter is not better if meaning is
  lost.
- **Link across captures only when the text shows it.** Put items from different captures in the
  same note only when their own words show they are about the same subject. Arriving in the same
  run, or near each other, is never a reason. An idea about the product is not an agenda item for a
  work meeting unless the user said it was.
- **`sure` means the item's own words support the destination.** A connection you had to infer is
  `unsure`.

Mum and the dentist being `unsure` is correct behaviour — no "things to do" note exists yet. That is
the learning loop's job (slice 6): the user answers once, the answer becomes a rule, and next time it
is `sure`. Do not tune it away in the prompt.

## 5. P23 — apply exactly the reviewed plan (fixes P19)

**`organize --dry`** already writes its run to `.runs/`. It must now also save everything needed to
apply the plan without any model call: the resolved plan, and the reference map from every
per-run reference (`N…`, `X…`, `I…`) to real ids, capture ids, item text and folder ids.

**`organize --apply <run file>`**:

1. Load the run. Refuse unless it is a dry run with a saved plan. Makes **no model calls** and costs
   nothing.
2. Re-assert the coverage invariant on the saved plan: `filed + queued = items`, each exactly once.
3. Inside the single transaction (R2):
   - **Lock the run's captures `FOR UPDATE` and require every one to still be `pending`** (P19). If
     any is not — already processed, skipped, or changed — refuse and write nothing.
   - Lock and re-check targets, as 3b already does (`lockOrganizerTargets`).
   - Write exactly the saved plan: create notes, append blocks, link sources, insert Quick Calls,
     mark captures processed.
4. Save a new run record noting which dry run it applied.

Applying the same dry run twice is refused by step 3, because its captures are no longer pending.

**Plain `organize`** (plan and write in one go) stays, because the unattended cron in 3c has no human
to review a dry run. It gets the same P19 capture lock.

**`markCaptureProcessed` requires `status = 'pending'`** and fails otherwise, so no path can
re-process a capture.

A `.runs/` file is the user's own local data. Editing it by hand is not a supported path, but code
still enforces every structural check above whatever the file says.

## 6. T1 — `route:preview`

```
npm run route:preview -- --ids <id> <id> …          # any status: pending, processed or skipped
npm run route:preview -- --ids … --no-notes          # route as if the vault had no notes yet
npm run route:preview -- --ids … --route-model claude-haiku-4-5
```

Runs Stage 0 for the named captures, Stage 1, Stage 2 and coverage, then prints the plan exactly
like `organize --dry`. **Writes nothing to the vault** — only `model_calls` rows. Everything goes
through `complete()` and the spend guard.

- `--no-notes` hides existing notes from Stage 2, so the seven test captures can be replayed as if
  for the first time. Otherwise they would be routed as appends to the notes they already created.
- `--route-model` overrides `ROUTE_MODEL` for this run only, and must be a model id with rates in
  `cost.ts`. That makes a Haiku-versus-Sonnet comparison on identical input one command each.

## 7. Verification

**Free first.**

`npm run split:check` — the existing seven cases, plus:
1. **Dingbra, real run:** quotes claiming only "I have a meeting with Dingbra" and "I need access to …"
   produce **one** item containing the whole capture.
2. **A sandwiched sentence** between two parts of one item joins it.
3. **A sentence between two different items** stays `unassigned`.
4. **Edges:** an unclaimed first or last sentence with one neighbour joins it.
5. **List lines** count as segments; an unclaimed list line between two lines of the same item
   joins it.

`npm run organize:check` — the existing eight cases, plus:
6. `--apply` of a saved dry-run plan writes exactly that plan and makes zero model calls.
7. Applying the same plan a second time is refused, and writes nothing.
8. If one of the run's captures is no longer `pending`, apply refuses and writes nothing (P19).
9. `markCaptureProcessed` on a non-pending capture fails.

**Then real data, about five cents.** Replay the seven processed test captures with `--no-notes`,
once per model:

```
npm run route:preview -- --ids <the seven> --no-notes --route-model claude-haiku-4-5
npm run route:preview -- --ids <the seven> --no-notes --route-model claude-sonnet-5
```

What good looks like:
- The Dingbra and cable captures come out of the split **without scraps**; no Quick Call reads
  `Right,` or `? Now I know…`.
- **"Two prompts instead of one" is not filed into a Work meeting note** — it goes to Mynd, or to a
  Quick Call.
- Shoes keeps "not sure"; the Mynd note keeps "house, then grocery, then list".
- Mum and the dentist may still be Quick Calls. That is correct (see §4).

Then, on new captures: `organize --dry`, read the plan, `organize --apply <that run file>`, and
`vault:print` matches what was read, exactly.

## 8. Out of scope

Moving the misfiled line out of the Work note (the user does that by hand once slice 4 adds note
editing), resolving Quick Calls (slice 6), the cron (3c), any change to the no-DELETE rule.

Next: slice 3c (the cron), which now inherits the P19 fix instead of having to build it.
