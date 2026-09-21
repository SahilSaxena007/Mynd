# docs/slice-3c1-spec.md — Slice 3c.1: give routing room, and see where the tokens go

**Why this exists.** The first cron run failed and cost $0.056:

```
19:36:04  route  claude-haiku-4-5  in 3920 | out 8000 | $0.0439
```

Output hit exactly 8,000 — our `MAX_TOKENS_PER_CALL` ceiling — so the plan was truncated and the run
recorded `route failed.` Nine captures produce a long plan, and the 2,048-token thinking budget is
spent from that same allowance. Checked against the Models API, **Haiku 4.5 allows 64,000 output
tokens**, so 8,000 was our own cap being too tight, not a model limit.

Two failures sit behind that one:

1. **We cannot see where the tokens went.** `model_calls` records total output only, so there is no way
   to tell whether thinking or the plan consumed the budget. The API returns
   `usage.output_tokens_details.thinking_tokens`; we were discarding it.
2. **A Stage 2 truncation repeats forever.** J2 blames a capture only for Stage 1 failures, and
   correctly marks nothing for Stage 2 — so the same batch is retried on the next schedule and
   truncates again, unattended, at four cents a time. (Railway's restart-on-failure policy turned that
   into several attempts in twenty minutes; the human has set it to Never.)

**Definition of done:** the cron clears the nine pending captures in one run; `model_calls` shows how
many output tokens were thinking; and a truncated route call recovers within the same run instead of
failing until someone notices.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-21)

- **SP6** — `MAX_TOKENS_PER_CALL` rises to **16,000**, and the route call asks for it. Well inside the
  model's 64,000 limit, and cost is still only what is produced.
- **DM12** — `model_calls` gains `thinking_tokens`, so thinking and answer are separable.
- **J4** — **A truncated route call retries once within the same run, with half the batch.** Only for
  truncation (`max_tokens`), only once.

---

## 1. Files

```
lib/db/schema.sql          # MODIFY: + model_calls.thinking_tokens (IF NOT EXISTS, E3)
lib/db/types.ts            # MODIFY: ModelCallInput gains thinkingTokens
lib/db/queries.ts          # MODIFY: insertModelCall writes it
lib/model/anthropic.ts     # MODIFY: read usage.output_tokens_details.thinking_tokens (default 0)
lib/model/index.ts         # MODIFY: carry thinkingTokens through CompleteResult.usage
lib/organizer/stage2-route.ts  # MODIFY: ask for 16,000; accept a batch for the retry
lib/organizer/index.ts     # MODIFY: J4 — retry once on truncation with half the batch
lib/organizer/print.ts     # MODIFY: show thinking tokens in the run summary
scripts/organize-check.ts  # MODIFY: + the cases in §4
.env.example               # MODIFY: MAX_TOKENS_PER_CALL=16000
```

`schema.sql` gains the column with `ADD COLUMN IF NOT EXISTS` — additive, so `db:migrate` stays
re-runnable (E3). No data is altered.

## 2. SP6 — the ceiling

`MAX_TOKENS_PER_CALL` becomes 16,000 in `.env.example`; the human sets it on **both** Railway services
and locally. `stage2-route.ts` asks for 16,000; the split keeps 8,000, which it has never come close
to (its largest output so far is 183 tokens).

The spend guard is unchanged in behaviour: it still refuses a request above the ceiling and still fails
closed when the variable is missing. Raising a ceiling that was demonstrably too low is configuration,
not a weakening — and `DAILY_CALL_CAP` still bounds the day.

## 3. J4 — recover from truncation inside the run

When the route call fails with `stop_reason: max_tokens`:

1. If the batch was more than one capture, **halve it** (round down), take that many of the oldest
   captures, and run Stage 2 once more over just their items. Stage 1 results already in hand are
   reused — **no capture is split twice**.
2. Allow this **once per run**. A second truncation ends the run, recorded as now.
3. Record the retry in the run summary and the run record's `error` when it still fails, so the reason
   is visible: `route truncated; retried with 4 captures`.
4. The captures left out simply stay `pending` for the next run.

Only truncation triggers this. A `ModelProviderError`, a schema failure, or a refusal behaves exactly as
before — the point is to recover from *our* budget being wrong, not to retry the model into working.

Each attempt is a real call, so the retry is bounded at one and the whole run still sits under
`MAX_CALLS_PER_RUN`.

## 4. Verification

**Free.** `npm run organize:check` — all existing cases, plus:

1. A route call reporting `stop_reason: max_tokens` triggers exactly **one** retry, with half the
   captures, and no capture is split a second time.
2. A second truncation ends the run: recorded `failed`, nothing written, captures still `pending`.
3. A `ModelProviderError` from route triggers **no** retry (unchanged).
4. A schema-invalid route response triggers **no** retry.
5. `thinking_tokens` is written to `model_calls` and defaults to 0 when the provider omits it.
6. A request above the (new) ceiling is still refused, and a missing ceiling still fails closed.

**Then live**, about 5 cents:

1. `npm run db:migrate` locally — adds the column, and a second run is a no-op.
2. Set `MAX_TOKENS_PER_CALL=16000` locally and on **both** Railway services.
3. `npm run organize -- --dry` against the nine pending captures: it should complete, and the summary
   should show how much of the output was thinking.
4. Then the cron: re-add the schedule `0 7,19 * * *`, keep Restart Policy **Never**, and trigger it
   once by hand. The nine captures should come out `processed`, and the vault home should show a
   successful "last organised".

If step 3 shows thinking eating most of the output, the next lever is `ROUTE_THINKING_BUDGET` — but
measure before changing it.

## 5. Out of scope

Changing the batch size (P18 stays at 10 — J4 handles the case it was protecting against), changing
the thinking budget before it has been measured, Ask (slice 5), Quick Calls (slice 6).
