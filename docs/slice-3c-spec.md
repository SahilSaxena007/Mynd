# docs/slice-3c-spec.md — Slice 3c: it organises itself

**Goal of this slice:** captures dictated during the day get filed without anyone running a command,
and you can tell at a glance that it happened.

**Definition of done:** a Railway cron service runs the organiser twice a day; the vault home shows
"last organised …" with what the run did; and a single unusable capture cannot stop the vault filling
forever.

This closes Path 2. After it, Mynd works end to end without a terminal — dictate, and it files itself.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-20)

- **J1** — The schedule lives in a **second Railway service** from the same repo whose only job is to
  run the organiser and exit. Nothing new is exposed to the internet.
- **J2** — **Blame the capture, not the provider.** If the model's output is unusable for one specific
  capture, that capture is marked `failed` and the next run proceeds without it. If the *provider*
  failed, nothing is marked and the next run retries.
- **J3** — A **run record** per organise run, shown as "last organised …" on the vault home.

---

## 1. Files

```
lib/db/schema.sql          # MODIFY: + organize_runs (IF NOT EXISTS, as E3 requires)
lib/db/types.ts            # MODIFY: + OrganizeRun, OrganizeRunInput
lib/db/queries.ts          # MODIFY: + insertOrganizeRun, getLastOrganizeRun, markCaptureFailed
lib/organizer/index.ts     # MODIFY: failure policy (J2) and record every run (J3)
jobs/organize-cron.ts      # NEW: the cron entry point; exits non-zero on failure
app/api/vault/route.ts     # MODIFY: + lastRun in the response
app/page.tsx               # MODIFY: + the "last organised …" line
scripts/vault-print.ts     # MODIFY: + show the last run
scripts/organize-check.ts  # MODIFY: + the cases in §5
package.json               # MODIFY: + "organize:cron": "tsx jobs/organize-cron.ts"
.env.example               # MODIFY: note that ORGANIZE_CRON is informational only
```

## 2. J3 — the run record

```sql
CREATE TABLE IF NOT EXISTS organize_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger            text        NOT NULL,          -- cron | manual
  status             text        NOT NULL,          -- ok | failed | nothing_pending
  started_at         timestamptz NOT NULL,
  finished_at        timestamptz NOT NULL DEFAULT now(),
  captures_processed integer     NOT NULL DEFAULT 0,
  items_filed        integer     NOT NULL DEFAULT 0,
  items_queued       integer     NOT NULL DEFAULT 0,
  notes_created      integer     NOT NULL DEFAULT 0,
  notes_appended     integer     NOT NULL DEFAULT 0,
  cost_usd           numeric(10,6) NOT NULL DEFAULT 0,
  failed_capture_id  uuid REFERENCES captures(id),  -- set only when J2 blames a capture
  error              text                            -- short, operational; never capture text
);
CREATE INDEX IF NOT EXISTS organize_runs_finished_at_idx ON organize_runs (finished_at DESC);
```

**Written outside the apply transaction, always** — on success, on failure, and when there was nothing
pending. If it were inside, a rolled-back run would leave no trace of having tried, which is exactly
the case worth recording.

`error` holds operational text only: which stage failed and the provider's status and type. **Never a
capture's words**, because this string is shown on a screen and may end up in logs.

New contracts:

```
insertOrganizeRun(input)  -> void
getLastOrganizeRun()      -> OrganizeRun | null
markCaptureFailed(id)     -> boolean      // only a 'pending' capture; false if it was not
```

`markCaptureFailed` is an `UPDATE … WHERE id = $1 AND status = 'pending'`. It deletes nothing (CAP4)
and cannot touch an already-processed capture.

## 3. J2 — the failure policy

In `runOrganize`, around each capture's Stage 1 call:

- **`ModelProviderError`** (rate limit, no credit, auth, 5xx) → **not the capture's fault.** Mark
  nothing. Stop the run, record `status: failed` with the stage and the provider status, write nothing
  to the vault. The next run retries the same captures.
- **Any other error** on a specific capture — unusable output, a `stop_reason` that is not
  `end_turn`, a response failing the schema → **that capture is at fault.** `markCaptureFailed(id)`,
  then stop the run and record it with `failed_capture_id`. The next run proceeds without it.

Marking the capture and then stopping (rather than carrying on through the batch) is deliberate: a
failure already calls `stopModelRun()`, so every later call in the run would be refused anyway.
Continuing would mean weakening the spend guard's fail-closed behaviour, which is not worth it — the
cost is one run's delay, at most twelve hours.

A **Stage 2** failure cannot be blamed on one capture, so it never marks anything: stop, record, retry
next run. If that ever recurs, the run records will show it and the batch size (P18) is the lever.

A `failed` capture is **not deleted and not hidden**: it shows as `failed` in the Captures log, its
text intact, and `vault:print` counts it. Nothing is lost — it simply stops blocking everything else.

## 4. J1 — the cron service

`jobs/organize-cron.ts` calls `runOrganize({ trigger: "cron" })`, prints the same summary the manual
run prints, and **exits non-zero if the run failed**, so Railway marks the scheduled run as failed
rather than silently green.

Unattended runs plan and write in one go — there is no human to review a dry run, so P23's
`--apply` path does not apply here. That is exactly why the code guarantees matter: coverage,
the confidence gate, the numbers rule, and one transaction all hold whether or not anyone is watching.

**The human's setup in Railway** (no code):

1. **+ New → GitHub Repo → the same `Mynd` repo.** A second service beside the web service.
2. **Settings → Deploy → Custom Start Command:** `npm run organize:cron`
3. **Settings → Deploy → Custom Build Command:** `npm install --no-audit --no-fund` — it never serves
   pages, so it does not need `npm run build`.
4. **Settings → Cron Schedule:** `0 7,19 * * *`
5. **Variables:** the twelve the organiser needs — `DATABASE_URL` (`${{Postgres.DATABASE_URL}}`),
   `ANTHROPIC_API_KEY`, `MODEL_PROVIDER`, `ORGANIZE_MODEL`, `ANSWER_MODEL`, `GRADER_MODEL`,
   `MAX_TOKENS_PER_CALL`, `MAX_CALLS_PER_RUN`, `DAILY_CALL_CAP`, `USER_TIMEZONE`,
   `ROUTE_THINKING_BUDGET`, and no `ROUTE_MODEL`. `SECRET_TOKEN` is not needed: this service serves no
   requests.
6. **Do not generate a domain for it.** It is not a web service.

Railway's schedule is **UTC**, so `0 7,19` is 08:00 and 20:00 British Summer Time and 07:00/19:00 in
winter. The drift is acceptable; `ORGANIZE_CRON` in `.env.example` is documentation only — Railway
holds the real schedule.

Two runs overlapping is already safe: the apply transaction locks the run's captures and requires them
still `pending` (P19/P23), so a cron firing during a manual run writes nothing twice.

## 5. Verification

**Free first.** `npm run organize:check` — all existing cases, plus:

1. A successful run writes one `organize_runs` row with `status: ok` and the right counts.
2. A run with nothing pending writes `status: nothing_pending`, makes no model calls, and costs zero.
3. A `ModelProviderError` during Stage 1 → run recorded `failed`, **no capture marked**, nothing
   written to the vault, captures still `pending`.
4. A schema-invalid or truncated response for one capture → that capture becomes `failed`,
   `failed_capture_id` is set, nothing is written to the vault, and the other captures stay `pending`.
5. A Stage 2 failure marks no capture.
6. The run record survives a rolled-back apply — the row exists even though nothing was written.
7. `markCaptureFailed` returns false for a processed or skipped capture and changes nothing.
8. `error` never contains capture text (assert on a fixture whose capture body is a distinctive
   string).

**Then live.** After the human sets up the service:

1. Dictate two or three thoughts and leave them pending.
2. In Railway, trigger the cron service manually (or wait for 07:00/19:00 UTC).
3. Its logs show the same summary a manual run prints; the deployment is green.
4. The vault home shows **"last organised … "** with the counts, and the new notes are there.
5. The Captures log shows those captures as `processed`.
6. `npm run vault:print` locally agrees — one database, two front doors.

## 6. Out of scope

Ask (slice 5), Quick Calls (slice 6), the grader (slice 7), an "Organise now" button or
`POST /api/organize-now` (deliberately not built — J1 keeps the organiser off the public surface),
alerting on a failed run beyond Railway's own, retrying a `failed` capture (it stays visible; a retry
path can come with slice 6's corrections).

Next: slice 5 (Ask).
