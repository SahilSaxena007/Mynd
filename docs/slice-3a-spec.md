# docs/slice-3a-spec.md — Slice 3a: model layer + spend guard + Stage 1 split (read-only)

**Goal of this slice:** point the organiser's first AI stage at your real captures and read what
it produces. Judge whether the splitting is any good *before* any code can write to the vault.

**Definition of done:** `npm run split:preview` reads pending captures, calls Stage 1 once per
capture, and prints the atomic items grouped under their source capture with a rough coverage
figure and the run's token cost. The vault is untouched — no notes, no folders, captures all
still `pending`. Safe to re-run as often as you like.

Slice 3 was split into three because it was the largest step in the build order and the first
that can spend money (B5). **3a is this spec. 3b** adds Stage 2 + Stage 3, the coverage
guarantee, the transaction, and `quick_calls`. **3c** adds the cron.

---

## Decisions settled for this slice (logged in `docs/DECISIONS.md`)

- **B5** — slice 3 splits into 3a (split, read-only) / 3b (route, write, guarantees) / 3c (cron).
- **DM8** — a `model_calls` table: one row per model call. Backs the daily cap *and* gives real
  cost observability from the first call.
- **SP2** — the spend guard lives inside `lib/model/` so no caller can bypass it, and it
  **fails closed**: a missing or unparseable limit refuses the call.
- **P3** — Stage 1 and Stage 2 use **structured outputs**, not a prompt asking for JSON.
- **C5** — prompt caching helps only *within* a run; it cannot help across runs (5-minute TTL,
  1-hour max, cron runs 12h apart). Do not claim a saving that cannot arrive.
- **C6** — synchronous model calls, not the Batch API.
- **S10** — `ANSWER_MODEL` becomes `claude-sonnet-5` ($2/$10, newer and cheaper than
  `claude-sonnet-4-6` at $3/$15). `ORGANIZE_MODEL=claude-haiku-4-5` is unchanged.
- **E3** — migrations become idempotent so tables can be added without a rebuild.

---

## 1. Files this slice

```
lib/model/
  index.ts          # [CODE] the swappable interface: complete(). The ONLY door to a provider.
  anthropic.ts      # [CODE] Claude implementation (@anthropic-ai/sdk)
  guard.ts          # [CODE] spend guard: per-call tokens, per-run calls, daily cap
  cost.ts           # [CODE] token -> USD estimate; per-model rate table
lib/prompts/
  split.ts          # Stage 1 prompt text — the ONLY place split behaviour is tuned
lib/organizer/
  stage0-gather.ts  # [CODE] pending captures, folders, note summaries, active rules
  stage1-split.ts   # [AI]   one call per capture -> single-topic items
lib/db/
  schema.sql        # MODIFY: + model_calls; make every statement IF NOT EXISTS (E3)
  migrate.ts        # MODIFY: idempotent; drop the refuse-partial-schema guard
  queries.ts        # MODIFY: + insertModelCall, countModelCallsToday, sumModelCostToday
  types.ts          # MODIFY: + ModelCall, ModelCallInput
scripts/
  split-preview.ts  # the runner. Prints. Writes nothing to the vault.
.env.example        # MODIFY: ANSWER_MODEL=claude-sonnet-5
package.json        # MODIFY: + @anthropic-ai/sdk dependency, + "split:preview" script
```

No Stage 2, no Stage 3, no `quick_calls`, no cron, no vault writes, no UI.

## 2. New table — `model_calls`

```sql
CREATE TABLE IF NOT EXISTS model_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job           text        NOT NULL,          -- split | route | answer | grader
  model         text        NOT NULL,          -- the exact model id sent
  input_tokens  integer     NOT NULL,
  output_tokens integer     NOT NULL,
  cached_tokens integer     NOT NULL DEFAULT 0,
  est_cost_usd  numeric(10,6) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_calls_created_at_idx ON model_calls (created_at);
```

New query contracts (all SQL stays in `lib/db/`):

```
insertModelCall({ job, model, inputTokens, outputTokens, cachedTokens, estCostUsd }) -> void
countModelCallsToday() -> number          // UTC day, for the daily cap
sumModelCostToday() -> number             // for the run summary
```

UTC deliberately: a local-midnight rollover is ambiguous, and this is a safety limit, not a
report.

## 3. `lib/model/` — the swappable layer

```ts
export type Job = "split" | "route" | "answer" | "grader";

export type CompleteInput = {
  job: Job;              // selects the model from env, and labels the model_calls row
  system: string;
  user: string;
  schema: object;        // JSON Schema — structured outputs (P3)
  maxTokens: number;
};

export type CompleteResult<T> = {
  data: T;                                    // parsed and schema-valid
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
  model: string;
};

complete<T>(input: CompleteInput): Promise<CompleteResult<T>>
withModelRun<T>(fn: () => Promise<T>): Promise<T>   // establishes the per-run call budget
```

- Job to model: `split`/`route` use `ORGANIZE_MODEL`, `answer` uses `ANSWER_MODEL`,
  `grader` uses `GRADER_MODEL`. Never a literal model id at a call site.
- `withModelRun` holds the per-run counter in `AsyncLocalStorage`, exactly as
  `lib/db/transaction.ts:6` holds the transaction client. `complete()` called outside a run
  throws — that is what makes `MAX_CALLS_PER_RUN` unbypassable rather than advisory.
- Every successful call writes a `model_calls` row before returning.
- **Thinking is omitted.** Splitting is mechanical, and on Haiku 4.5 `effort` is rejected while
  thinking would need the older `budget_tokens` form. Send neither.
- **No prompt caching in 3a.** The system prompt is far below the 512–4096-token minimum
  cacheable prefix, so a `cache_control` breakpoint would silently do nothing. Revisit in 3b,
  where the folder catalog and note summaries make the prefix big enough, and only claim a
  saving once `usage.cache_read_input_tokens` proves it (C5).
- `lib/model/anthropic.ts` is the only file in the repo allowed to import
  `@anthropic-ai/sdk` (S4).

### Spend guard (`lib/model/guard.ts`) — SP2

Checked inside `complete()`, before the request goes out:

1. `MAX_TOKENS_PER_CALL`, `MAX_CALLS_PER_RUN`, `DAILY_CALL_CAP` are read from env. Missing,
   empty, or non-numeric means **refuse the call and throw.** Fail closed.
2. `input.maxTokens` above `MAX_TOKENS_PER_CALL` is refused. Callers ask within budget; the
   guard does not silently clamp, because a silent clamp changes behaviour invisibly.
3. Calls already made in this run at or above `MAX_CALLS_PER_RUN` is refused.
4. `countModelCallsToday()` at or above `DAILY_CALL_CAP` is refused.

On any breach: log which limit tripped, throw, and **do not retry** (per `AGENTS.md`). A breach
is a stop, not a backoff.

### Cost estimate (`lib/model/cost.ts`)

Per-million-token rates keyed by model id: `claude-haiku-4-5` $1 in / $5 out,
`claude-sonnet-5` $2 in / $10 out. Cached input at 10% of the input rate. An unknown model id
must throw rather than estimate zero — a silent $0 would make the cost log lie.

Comment the file with the date the rates were checked; they are hardcoded and will drift.

## 4. Stage 0 — gather (`stage0-gather.ts`) [CODE]

Reads, through `lib/db/` only: pending captures, folders with descriptions, note summaries,
active rules. Returns them as one plain object. Stage 1 needs only the captures; the rest is
gathered now because 3b's Stage 2 needs it and gathering costs nothing.

## 5. Stage 1 — split (`stage1-split.ts`) [AI]

One `complete()` call per capture, `job: "split"`. Each capture is split in isolation; pooling
across captures is Stage 2's job (P2), not this one's.

Output schema (structured outputs, P3):

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
        "required": ["text", "topic"],
        "properties": {
          "text":  { "type": "string" },
          "topic": { "type": "string" }
        }
      }
    }
  }
}
```

`text` is the item's content in the user's own words. `topic` is a short label Stage 2 uses for
routing and for one-topic-per-note (R4).

### What `lib/prompts/split.ts` must instruct

This file is the moat. It will be edited more than any other file in the repo. Requirements:

- Decompose the capture into single-topic items (R4). One topic each, no mixing.
- **Split only. Never invent.** No fact, step, detail, or tidy-up that is not in the source (R3).
- **Never drop.** Every part of the capture must appear in some item (R1). Filler and asides
  included — if it was said, it lands somewhere.
- Prefer the user's own wording. Rephrase only as much as it takes to make a fragment stand
  alone.
- A single-topic capture returns exactly **one** item. Do not force a split.
- **Unintelligible input is still returned as one item, verbatim.** Never discard a capture for
  being gibberish, half-dictated, or cut off — that is silent loss, and the current corpus
  contains plenty of it. If it cannot be understood, pass it through so a human can see it.
- No summarising, no merging of unrelated fragments, no reordering into a narrative.

## 6. The runner — `scripts/split-preview.ts`

```
npm run split:preview -- --dry          # gather and print captures only; NO model calls, free
npm run split:preview -- --id <uuid>    # one capture; one call
npm run split:preview -- --limit 5      # the 5 most recent pending captures
npm run split:preview                   # all pending, bounded by MAX_CALLS_PER_RUN
```

Wraps everything in `withModelRun`. Per capture it prints the capture id and its first line,
then each item numbered with its topic, then a **word-coverage figure** — the share of the
capture's words that appear somewhere in the items. That figure is a *diagnostic*, an early read
on whether content is being dropped; it is explicitly **not** the R1 guarantee, which is code in
`lib/organizer/coverage.ts` in 3b. Then a run summary: calls, tokens, estimated USD, and today's
running total.

It also writes the run to a timestamped JSON file under a gitignored `.runs/` directory, so two
prompt versions can be diffed against the same captures. Add `.runs/` to `.gitignore`.

**It writes nothing to the vault.** No notes, no folders, no `note_sources`, and captures are
left `pending`. The only rows it creates are `model_calls`.

## 7. Verification

1. `npm run lint`, `npm run typecheck`, `npm run build` clean.
2. `npm run db:migrate` — re-runnable, adds `model_calls`, leaves the five existing tables and
   all their data intact (E3). Run it twice; the second run must be a no-op, not an error.
3. `npm run split:preview -- --dry` — **costs nothing.** Proves Stage 0 reads real captures.
4. `npm run split:preview -- --id <one capture>` — one call. Read the items. Check the
   `model_calls` row: correct job, correct model, real token counts, non-zero cost.
5. The guard, each case proven to refuse *and* to make no call:
   - `MAX_TOKENS_PER_CALL=10` refused.
   - `DAILY_CALL_CAP=1`, run twice: the second refused.
   - `MAX_CALLS_PER_RUN=1` with three or more pending: one call, then refused.
   - `DAILY_CALL_CAP=` (empty) refused, proving fail-closed.
6. After any run: `getPendingCaptures()` returns the same captures, and the vault still holds
   only the two seed folders and no notes.
7. The judgement call, which is the actual point of this slice: **read the items.** Are they
   genuinely one topic each? Is anything invented? Is anything missing? Tune
   `lib/prompts/split.ts` and re-run. That loop is what 3a exists for.

## 8. Out of scope (do not build)

Stage 2 routing, Stage 3 apply, the coverage guarantee, the write transaction, `quick_calls`,
the cron, prompt caching, the Batch API, the grader, any UI, any vault write.

Next: slice 3b (Stage 2 route + Stage 3 verify and apply + `quick_calls` + the transaction).
