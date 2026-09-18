# DECISIONS.md — Mynd / vault decision log

Append-only. Every decision (new or changed) gets a dated entry with a one-line rationale.
A future planning session reads `AGENTS.md`, `ARCHITECTURE.md`, `docs/`, and this file —
and is current. The context lives on disk, never in chat history.

Format: `### YYYY-MM-DD — <ID> <decision>` followed by a `**Why:**` line.
A superseded decision is never deleted — a later entry says what replaced it and why.

---

# 2026-09-15 — Backlog entry: decisions made before this log existed

These were settled in earlier sessions and are recorded here on the day the log was
created. The dates below are the log date, not the original decision date.

## Naming

### 2026-09-15 — N1 "Mynd" is the product/brand name; "vault" is the internal system name
Used in the repo, the database, and the code. Keep the two separate.
**Why:** the internal noun stays stable while the brand is free to change; the split is
deliberate, not drift.

## Stack

### 2026-09-15 — S1 Next.js + TypeScript (App Router); ONE web app, installable as a PWA on phone and laptop
**Why:** one surface and one deploy for both devices; no native app to maintain.

### 2026-09-15 — S2 Database access is plain `pg` + raw SQL — no ORM
**Why:** readability and familiarity beat generated types here; we always see exactly what
runs. (`docs/slice-1-spec.md` recommended Drizzle as Option A; the human chose Option B —
this entry overrides that recommendation.)

### 2026-09-15 — S3 Postgres on Railway; public networking during local dev, switch to internal on deploy
**Why:** one database, one host, no local Postgres to babysit; internal networking later
removes the public surface.

### 2026-09-15 — S4 Every model call goes through `lib/model/` — never a provider SDK directly
**Why:** routing cheap/strong models and swapping providers must be a config change, not a
rewrite.

### 2026-09-15 — S5 v1 uses ONE model, but Stage 1 (split) and Stage 2 (route/write) are two SEPARATE prompts with isolated context
**Why:** isolated context stops split-stage reasoning from leaking into routing, and makes
splitting to two different models later a one-line change.

### 2026-09-15 — S6 Model defaults: organise = Haiku, answer = Sonnet; both swappable by env
**Why:** the high-volume step gets the cheap model; the quality-critical answer gets the
strong one.

### 2026-09-15 — S7 Single user, one shared secret token, for now
**Why:** accounts are deferred; a token in a header is enough for one person and costs
nothing to build.

## Cost (target: 80–90% margin)

### 2026-09-15 — C1 Route the high-volume split step to the cheapest capable model
**Why:** split is the per-capture volume driver — the cheapest place to save the most.

### 2026-09-15 — C2 Prompt-cache the repeated organise context (folder catalog, note summaries, system prompt)
**Why:** that block is near-identical every run, so caching takes ~90% off its input cost.

### 2026-09-15 — C3 Run the background organise job on the Batch API
**Why:** it is asynchronous by nature, so the batch discount is free.

### 2026-09-15 — C4 Defer embeddings; load relevant notes directly while the vault is in the low hundreds of notes
**Why:** at this size direct loading is cheaper and simpler than an embedding index;
revisit when the vault grows.

## Data model — 5 tables

### 2026-09-15 — DM1 `captures` — raw and immutable; `status` IS the pipeline (pending|processed|failed); `kind` reserved for future media
**Why:** the source of truth must never be edited, so any organising mistake stays
recoverable from the original dump.

### 2026-09-15 — DM2 `folders` — `description` carries BOTH the folder's purpose AND its grouping rule (e.g. journal = one note per calendar day); plus `color` and `parent_id`
**Why:** the organiser reads folder behaviour as prose, so a folder's rule is changed by
editing text, never by changing pipeline code.

### 2026-09-15 — DM3 `notes` — `title`, `summary` (drives append-vs-create), `body` in Markdown; `embedding` column reserved
**Why:** the one-line summary lets Stage 2 decide append-vs-create without loading every
full body.

### 2026-09-15 — DM4 `note_sources` — many-to-many notes↔captures provenance
**Why:** one topic can grow across many days' captures, and this table is what the
code-side coverage check reads to prove nothing was dropped.

### 2026-09-15 — DM5 `rules` — the user's corrections in their own words, read at the start of every organise run
**Why:** the learning loop is stored as the user's own language, not as compiled logic.

## The organiser pipeline

### 2026-09-15 — P1 Four stages, alternating code/AI
Stage 0 gather [code] → Stage 1 split [AI prompt #1] → pool all items → Stage 2 route &
write [AI prompt #2, emits a confidence per item] → Stage 3 verify & apply [code: coverage
check, confidence gate, single transaction].
**Why:** every AI judgment is bracketed by code that checks it; Stage 2 emits a PLAN, and
only code writes.

### 2026-09-15 — P2 Pool all items from the whole run before routing
**Why:** items from different captures can belong to one topic-thread; pooling is what lets
them meet.

## The four organiser decisions

### 2026-09-15 — D1 Safe-append in v1 — never rewrite a whole note; a "tidy/regenerate" pass is v2
**Why:** appending cannot destroy existing content, so the worst failure is an untidy note
rather than a lost one. (Already true in code: `appendToNote` concatenates in one SQL
statement.)

### 2026-09-15 — D2 High-confidence (~90%) auto-files silently; low-confidence (~10%) goes to a Quick Calls queue with 2–3 options
The user's pick files the item AND becomes a rule. The queue must never lose an item and
must never block the 90%.
**Why:** the user's attention is the scarce resource — spend it only where the model is
genuinely unsure, and convert each spend into a permanent rule.

### 2026-09-15 — D3 "Never add information" is enforced by instruction in v1 (the softer guarantee), PLUS a separate offline grader model that scores added/dropped info — measurement only, never in the write path
**Why:** we cannot yet verify semantic faithfulness in code, so we instruct for it and
measure it independently; a grader in the write path would make a model responsible for a
guarantee.

### 2026-09-15 — D4 One model for v1, two separate prompts, isolated context, behind the swappable layer
**Why:** fewer moving parts now, and splitting into two models later is a config change.

## The five non-negotiable rules (the product IS these)

### 2026-09-15 — R1 No silent loss — enforced by a CODE coverage check, never by trusting the model

### 2026-09-15 — R2 The vault is never half-written — all writes for one run in ONE transaction

### 2026-09-15 — R3 Never add information — the organiser may rephrase, never augment

### 2026-09-15 — R4 One topic per note

### 2026-09-15 — R5 Ask never fabricates — answer only from the notes, else "not in your notes"; cite sources

**Why (all five):** these are the reasons to trust the product with your own thinking. If
any one of them fails, the vault stops being worth using.

## Core principle

### 2026-09-15 — CP1 THE LLM MAKES DECISIONS; CODE MAKES GUARANTEES
**Why:** judgment lives in `lib/prompts/`, where organisation quality is tuned; guarantees
(coverage check, transaction) live in code files. A model is never responsible for a
guarantee.

### 2026-09-15 — CP2 Human-in-the-loop is "correction, not construction"
**Why:** the user never does cold filing; they nudge, and each correction becomes a rule
that feeds the next run — ownership through correction.

## Organising philosophy (information architecture)

### 2026-09-15 — IA1 Wurman/LATCH for structure — category now; time and alphabet views later

### 2026-09-15 — IA2 GTD/Allen for the capture-then-organise pipeline

### 2026-09-15 — IA3 Zettelkasten/Luhmann for one-idea-per-note — note links are a v2 Wiki stage

### 2026-09-15 — IA4 Forte/PARA for the discipline not to over-engineer the taxonomy

**Why (all four):** the filing behaviour is grounded in established IA practice rather than
invented per-feature, which keeps the taxonomy small and the rules explainable.

## Spend protection

### 2026-09-15 — SP1 Mandatory before ANY model call ships: provider monthly cap ($20) + billing alerts, PLUS code-level guards in `lib/model` (max tokens/call, max calls/run, daily cap — all from env)
**Why:** the provider cap is the last line of defence, not the first; a runaway loop must be
stopped by our own code before it ever reaches the provider. The env vars are already
reserved in `.env.example`; enforcement lands with `lib/model/` in slice 3.

## Deferred — do NOT build in v1

### 2026-09-15 — X1 Not in v1
Native float-anywhere capture widget · accounts/multi-user · offline capture ·
embeddings/semantic search · image/link/video capture · note-to-note links (Wiki stage) ·
multi-lens views · UI polish.
**Why:** each one is a whole project; shipping the three paths end-to-end first is what
proves the idea. If a task seems to require one of these, STOP and ask the human.

## Build order

### 2026-09-15 — B1 Seven slices; each runs and is verified before the next
1. Schema + db layer — **DONE**
2. Capture endpoint + mic capture screen (Path 1) — **NEXT**
3. Model layer + organiser + cron (Path 2)
4. Vault home + note view (the magic moment)
5. Ask endpoint + ask logic (Path 3)
6. Quick Calls + rules (the learning loop)
7. Grader (measurement)

**Why:** no big-bang build; every slice is independently runnable and testable.

### 2026-09-15 — B2 Slice 1 is complete and verified
**Why:** the five tables exist on Railway Postgres, `lib/db/` holds every query (no SQL
elsewhere), `withTransaction` is in place for R2, `appendToNote` is an atomic concat (D1),
Journal and Inbox are seeded, and `npm run smoke` passes all seven acceptance steps.

## Process

### 2026-09-15 — PR1 Every decision, new or changed, is appended to this file — dated, with a one-line rationale — at the end of each planning session, along with the relevant slice spec
**Why:** the context must live on disk; chat history does not survive a session.

---

# 2026-09-15 — Slice 2 planning (capture, Path 1)

Spec: `docs/slice-2-spec.md`.

## Capture (Path 1)

### 2026-09-15 — CAP1 No speech code in Mynd — the capture screen is an autofocused textarea and Wispr (or the iOS keyboard mic key) types into it
**Why:** dictation is already solved at the OS level on both devices, so writing a Web
Speech path would add a stateful recording UI, permission prompts, and an iOS Safari
fallback to maintain — for a feature the user would rarely reach. No audio ever touches
our server. (Considered and rejected: an in-app mic button, and a mic-with-fallback.)

### 2026-09-15 — CAP2 Send is not optimistic — the textarea clears only after a 2xx; on any failure the text stays put, with the error shown and Send still live
**Why:** an optimistic clear means a dropped connection silently eats a thought, which is
the spirit of R1 even though R1 formally governs the organiser. A real retry buffer would
be offline capture, deferred by X1.

### 2026-09-15 — CAP3 The captures log screen ships in slice 2, not later
**Why:** without it, nothing in the app confirms a thought was saved, and the slice could
only be verified at a terminal; with it, slice 2 is verifiable on the phone and slice 3
gets a free progress view as captures flip pending→processed. Costs one query, one GET
endpoint, one read-only screen — all already planned in `vault-codebase-skeleton.md`.

### 2026-09-15 — CAP4 Nothing in Mynd ever deletes a capture — no delete endpoint, no UI action, and no DELETE statement anywhere in the codebase, including test scripts
**Why:** DM1 makes the raw dump the recoverable source of truth, and the cheapest way to
guarantee that is for the capability not to exist at all — a delete path written "just for
tests" is still a delete path. Rows created by `scripts/smoke-capture.ts` stay in the inbox
as real pending captures and get organised by slice 3 like any other dump.
(Supersedes the same-day draft of CAP4, which allowed the smoke script to remove rows it
had inserted itself; the human ruled that out as an unnecessary risk.)

## Stack (continued)

### 2026-09-15 — S8 Auth for the browser: the token is typed once into an unlock screen, kept in `localStorage`, and sent as the `SECRET_TOKEN` header on every request
**Why:** it needs no cookie handling, no login route, and no session, and the existing
`lib/auth.ts::requireToken` stub already works as written. (Considered and rejected: an
httpOnly cookie via a login route — safer against XSS but a second auth path to build; and
a bookmarked `?t=…` URL — fastest phone setup but the token lands in history and logs.)

### 2026-09-15 — S9 Add a `withAuth(handler)` wrapper in `lib/auth.ts`; do not rewrite `requireToken`
**Why:** `requireToken` signals failure by throwing a `Response`, which every one of the
seven eventual endpoints would otherwise catch by hand; one wrapper gives them all a single
auth path and keeps misconfiguration from leaking a 500 body.

## Data model (continued)

### 2026-09-15 — DM6 The server sets `captured_at`; a client-supplied value is ignored, as is a client-supplied `kind`
**Why:** with offline capture deferred, the phone clock buys nothing and a skewed device
clock would silently file a thought under the wrong journal day, poisoning DM2's grouping
rule. `captured_at` and `created_at` are identical in v1 by design and diverge only when
offline capture makes "when you spoke it" different from "when it synced".

## Build order (continued)

### 2026-09-15 — B3 No PWA manifest until slice 4
**Why:** slice 2 works in a browser tab, and the manifest is worth writing when there is a
real shell worth installing to a home screen.

### 2026-09-16 — S10 Vault at `/` is the home screen; Capture lives at `/capture`
**Why:** Vault as home is the locked design. The slice-2 wording calling Capture the
default landing place was an error, corrected in the spec. Do not redirect `/` to
`/capture` or move Vault. The product's mic navigation opens Capture; slice 2 supplies
the specified Capture tab without adding speech recording or audio handling.

---

# 2026-09-17 — Slice 2 manual testing: two defects fixed

Slice 2 was built by Codex, then manually tested. `typecheck`, `lint`, and the 8-check
`npm run smoke:capture` all passed; two manual scenarios failed. Both fixes are UI-only —
no endpoint, schema, or SQL change.

## Capture (Path 1, continued)

### 2026-09-17 — CAP5 The capture draft lives in `localStorage`, not React state, and is cleared only after a confirmed 2xx
**Why:** CAP2's send logic was already correct (a failed send never cleared the box), but the
draft existed only in React state, so *any* page reload destroyed it — a dev-server restart,
a pull-to-refresh, a browser crash, or iOS Safari discarding a backgrounded tab, which is
routine on the phone this is built for. CAP2's letter was satisfied and its intent — never
lose a thought — was not. One draft, no queue, no retry, no sync: this is a draft buffer, so
the deferred offline capture in X1 stays deferred. Implemented as an external store
(`components/draft.ts`) mirroring `components/token.ts`, with an in-memory fallback so a
private window with site storage blocked still types normally.

### 2026-09-17 — CAP6 Unlock verifies the token against an authenticated endpoint before storing it
**Why:** `TokenGate` tested only that a token *existed*, so any typed string opened the
capture screen and the mistake surfaced later as a 401 on first send — the user saw a working
app that silently could not save. Unlock now calls `GET /api/captures` with the candidate and
stores it only on a 200; a 401 says the token is wrong, and a network error or 5xx says the
server is unreachable, so a down server is never misreported as a bad token. Reuses the
existing endpoint rather than adding an eighth. This was a gap in `docs/slice-2-spec.md`
(which specified post-401 behaviour but never required validation at unlock), not a Codex
error.

## Process

### 2026-09-17 — PR2 A slice is not done when its automated test passes — it is done when the manual scenarios pass on the real device
**Why:** both CAP5 and CAP6 were invisible to a green 8/8 HTTP smoke test; they were only
found by a human typing into a box and pulling the plug. Every future slice gets a written
manual checklist alongside its script.

## Environment / config

### 2026-09-18 — E1 `next.config.ts` sets `allowedDevOrigins` so the app can be opened from the phone over the LAN
**Why:** Next 16 refuses to serve its dev/HMR client to a non-localhost origin unless that
origin is named. The failure is silent and very misleading: the LAN address returns HTTP 200,
the page renders, every `/_next/static/*` asset loads with identical bytes — but React never
hydrates, so the Unlock button stays disabled forever and the app looks broken. It presents
as a UI bug and is actually a dev-server origin check. (Diagnosed the long way on 2026-09-18
after wrongly suspecting `TokenGate` and the draft store; `curl` masked it because script
tags and curl send no `Origin` header, while the HMR websocket and RSC requests do.)
**Watch out:** the listed address is DHCP-assigned and changes when the laptop rejoins
Wi-Fi. When phone access breaks again, re-run `ipconfig` and update this list first — it is
almost never the application code. Dev-only; no effect on a production build.

### 2026-09-18 — E2 Phone testing during development uses the LAN IP with `npm run dev -- -H 0.0.0.0`, over plain HTTP
**Why:** the default binding accepts only connections from the laptop itself. Plain HTTP is
sufficient — `localStorage` works on insecure origins, so the token gate and draft buffer
behave normally; HTTPS matters only for PWA install, deferred to slice 4 by B3. A public
tunnel would also work but exposes the dev server and the real Railway database to the
internet behind nothing but the token, so LAN is the default.

## Build order (continued)

### 2026-09-18 — B4 Slice 2 is complete and verified
**Why:** `typecheck`, `lint`, and the 8-check `npm run smoke:capture` all pass; the manual
scenarios pass on both laptop and phone, including the two that found CAP5 and CAP6 and the
one that found E1. Capture works end to end: dictate on the phone with Wispr, send, and see
the dump in the inbox as `pending`. Path 1 is done. Next: slice 3 (model layer + spend guard
+ organiser + cron) — still to be scoped; see the three open questions parked on 2026-09-16.

---

# 2026-09-18 — Slice 3 planning (the organiser)

Specs: `docs/slice-3a-spec.md`. 3b and 3c to be specced when 3a is verified.

## Build order (continued)

### 2026-09-18 — B5 Slice 3 splits into 3a / 3b / 3c
**3a:** `lib/model/` + spend guard + Stage 0 gather + Stage 1 split, read-only — reads real
captures, prints the atomic items, writes nothing to the vault. **3b:** Stage 2 route + Stage 3
verify and apply + the coverage guarantee + the transaction + `quick_calls`. **3c:** the cron.
**Why:** it was the largest step in the build order and the first that can spend money, so a
prompt bug and a write bug could hide behind each other. 3a makes split quality judgable for
pennies before any code can touch the vault, and it is cheap to re-run as the capture corpus
grows. (Considered and rejected: keeping slice 3 whole; splitting only pipeline-then-cron.)

## Data model (continued) — now 7 tables

### 2026-09-18 — DM7 A `quick_calls` table is the destination for low-confidence items (created in 3b)
Holds the item text, its source capture, the 2–3 options Stage 2 proposed, and a status.
**Why:** D2 queues the unsure ~10% and R1's coverage check is "every item filed OR queued", but
none of the five tables could hold a queued item — so slice 3 could not satisfy R1 as written.
A real table makes coverage provable, and slice 6 then builds UI over a table that already holds
real data. (Considered and rejected: filing low-confidence items into the Inbox folder, which
discards Stage 2's proposed options and piles up review notes in a real folder; and leaving the
capture pending for retry, which breaks R1 in spirit because nothing changes between runs, so
the same item scores the same forever and silently never lands.)

### 2026-09-18 — DM8 A `model_calls` table logs one row per model call
Job, model id, input/output/cached tokens, estimated USD, timestamp.
**Why:** the SP1 daily cap needs a durable count — in-process memory does not survive a restart
and a file does not survive Railway's ephemeral filesystem — so the cap becomes a COUNT over
today's rows. The same table then gives real cost observability from the first call: cost per
run, per day, per capture, which is the only way to know whether the 80–90% margin holds rather
than assuming it. (Considered and rejected: a single counter row, which satisfies the cap with
less schema but leaves margin a guess; and deferring the daily cap to 3b, which would ship model
calls without the full SP1 guard in exactly the slice where a fresh prompt is most likely to
loop.)

## Spend protection (continued)

### 2026-09-18 — SP2 The spend guard lives inside `lib/model/complete()` and fails closed
A missing, empty, or non-numeric `MAX_TOKENS_PER_CALL` / `MAX_CALLS_PER_RUN` / `DAILY_CALL_CAP`
refuses the call. A request above the per-call ceiling is refused, never silently clamped. The
per-run counter lives in `AsyncLocalStorage` via `withModelRun`, mirroring
`lib/db/transaction.ts`, and `complete()` outside a run throws. On breach: log, throw, no retry.
**Why:** a guard a caller can forget to invoke is not a guard, and this is the file every model
call must pass through anyway (S4). Fail-closed matters because the failure it prevents costs
money, and a silent clamp would change behaviour invisibly.

## The organiser pipeline (continued)

### 2026-09-18 — P3 Stage 1 and Stage 2 use structured outputs (`output_config.format`), not a prompt requesting JSON
**Why:** the API then guarantees the response shape, so the parse cannot fail. This is CP1
exactly — the model decides content, code guarantees form — and it removes a whole class of
"the model returned prose instead of JSON" failure from the write path.

## Cost — revisions to earlier decisions

### 2026-09-18 — C5 Revises C2: prompt caching can only help *within* a single run, never across runs
**Why:** cache entries live 5 minutes by default and 1 hour at most, while the cron runs roughly
12 hours apart — so every run starts cold, always. The minimum cacheable prefix is also
512–4096 tokens depending on model, and the organise context starts far below that with two
folders and no notes, so an early `cache_control` breakpoint silently does nothing. C2 remains
worth doing for the per-capture Stage 1 calls inside one run, which do share a prefix. Claim a
saving only when `usage.cache_read_input_tokens` proves one.

### 2026-09-18 — C6 Revises C3: the organise job runs synchronous model calls, not the Batch API
**Why:** `vault-codebase-skeleton.md:98` called batch "a flag set in `jobs/organize-cron.ts`",
which understates it badly. Batch is asynchronous and the pipeline is strictly sequential —
Stage 2 cannot start until every Stage 1 result is pooled — so batching turns one cron
invocation into a three-invocation state machine with persisted state and its own failure modes
(an expired batch, a half-collected run). Measured prize at expected volume: a ten-capture run
on Haiku 4.5 is roughly 15K input / 5K output, about **$0.04**; twice daily is about
**$2.40/month**; batch saves about **$1.20/month**. Revisit at ten times the volume.

## Stack (continued)

### 2026-09-18 — S10 `ANSWER_MODEL` becomes `claude-sonnet-5`
**Why:** `.env.example` specified `claude-sonnet-4-6` at $3/$15 per MTok. `claude-sonnet-5` is
$2/$10 — newer and cheaper, with no tradeoff. `ORGANIZE_MODEL=claude-haiku-4-5` was already
correct. Checked against the live model reference on 2026-09-16, not from memory.

## Environment / config (continued)

### 2026-09-18 — E3 `schema.sql` becomes fully idempotent and `migrate.ts` stops refusing a partial schema
Every statement becomes `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so
`npm run db:migrate` is safe to re-run and can add a table to a live database.
**Why:** `README.md:52` recorded that the migration was initial setup only, "not an upgrade
mechanism for later schema changes", and it refuses a partially existing schema — so adding
`model_calls` in 3a and `quick_calls` in 3b was impossible without a rebuild that would destroy
the capture corpus. Idempotency is the right mechanism at this scale; a numbered-migrations
table is more machinery than a single-user project needs.

---

# 2026-09-18 — Slice 3a review: implementation choices recorded

Made by Codex while implementing `docs/slice-3a-spec.md`, beyond what the spec required.
Reviewed and accepted in the planning terminal. Recorded because each one is load-bearing
for SP2 and non-obvious enough that a later change could quietly undo it.

## Spend protection (continued)

### 2026-09-18 — SP3 The provider SDK is constructed with `maxRetries: 0`
**Why:** the Anthropic SDK retries 408/409/429/5xx twice by default, *inside* the SDK, where
the per-run counter cannot see it — so one guarded call could silently become three billed
requests. Retries off makes `MAX_CALLS_PER_RUN` an honest count and matches the `AGENTS.md`
rule that a breach stops rather than backs off. **Never re-enable retries in
`lib/model/anthropic.ts`**; if retrying is ever wanted, it goes through `complete()` so each
attempt passes the guard.

### 2026-09-18 — SP4 Model calls are serialized by a Postgres advisory lock (`lib/db/model-call-lock.ts`)
The daily-cap check, the provider request, and the `model_calls` insert run under
`pg_advisory_lock`, so two processes cannot both read "499 calls today" and both proceed.
**Why:** without it the daily cap has a check-then-act race across processes — the cron and a
manual preview running together could overshoot it. Cost: model calls never run in parallel,
and a slow provider response holds one pool connection for its duration. Acceptable at
single-user volume; revisit if Stage 1 ever needs parallel calls for speed.

### 2026-09-18 — SP5 Every billed response is logged before it is validated
A refused, truncated (`stop_reason` other than `end_turn`), or schema-invalid response is
still written to `model_calls` first, then rejected.
**Why:** the provider bills it either way. Logging only successful calls would make the cost
log and the daily cap undercount exactly the calls most likely to be repeated.

## The organiser pipeline (continued)

### 2026-09-18 — P4 Stage prompts state that the user message is source material, not instructions
**Why:** captures are the user's own dictation and will eventually contain phrases like
"ignore that" or "forget the last part". Without this line, a capture could steer the
organiser that is supposed to be filing it.

### 2026-09-18 — P5 A preview run stops at the first failed capture
Any model error calls `stopModelRun()`, so every later call in that run is refused.
**Why:** conservative by design — it mirrors "a breach is a stop, not a backoff", and it
means a misconfiguration fails once rather than once per capture. The cost is that one bad
capture hides the results for every capture after it. Revisit for 3b, where the run is a
single all-or-nothing transaction anyway.

---

# 2026-09-18 — Slice 3a tested against real captures; revision 3a.1

Spec: `docs/slice-3a1-spec.md`. Six real captures were split for a total of under one cent, with
no vault writes. The model never invented content, but it split by sentence rather than by topic,
and three times it silently dropped the sentence framing everything else. Also found: the API
credit balance ran out mid-test, and the runner disguised it as `(preview error)`.

## The organiser pipeline (continued)

### 2026-09-18 — P6 Stage 1 is extractive: an item is a topic label plus exact quotes from the capture, with no free-text field
**Why:** the model's real job at this stage is deciding which of the user's sentences belong
together. Letting it also write prose gave it room to drop and to rephrase, and made its output
uncheckable. With quotes only, every piece of output is verifiable against the source, and
rephrasing moves to Stage 2, which writes the note text anyway.

### 2026-09-18 — P7 Code completes Stage 1 coverage: quotes are verified as substrings of the capture, and any unclaimed text becomes an `unassigned` item verbatim
Implemented as a pure function, `completeSplit()`, called inside `stage1-split.ts` so every caller
gets a complete split.
**Why:** 3a proved "never drop" cannot be enforced by instruction — the same prompt dropped the
framing sentence from one list and kept it in another. R1 requires code to hold the guarantee, and
the coverage check planned for 3b only covered items → filed; nothing covered capture → items.
This closes that gap. It also enforces R3 at Stage 1 in code: a quote not found in the capture is
rejected, so nothing invented can pass. The model can now group badly; it can no longer lose text
or add it.

### 2026-09-18 — P8 A topic is what one note would be about
Lists stay with the sentence that introduces them; examples with their point; corrections with what
they correct; follow-up references with what they refer to. Split only where content belongs in
different notes. Labels are short, lowercase, reusable categories — `things to buy`, not
`[Godfather]`.
**Why:** the 3a prompt said "single-topic" without defining it, so the model split every sentence
and list line into its own topic: a seven-sentence thought became seven items and a shopping list
became nine, with entries like "Monitors." carrying no hint they were things to buy. Filed as-is,
that would have produced notes titled "We need to look at small things."

### 2026-09-18 — P9 A self-correction keeps both the original statement and the correction, in order
**Why:** "the cable for my plugs, I don't know what it's called … it was an extension cable" should
not be collapsed to "extension cable" at the split stage — that discards the user's own words, and
the split stage is lossless by design. Stage 2 may phrase the resulting note as "extension cable";
that is a writing decision for 3b, and the source stays recoverable in `captures` either way.

## Environment / config (continued)

### 2026-09-18 — E4 Provider errors surface as HTTP status, error type, and the provider's message
A `ModelProviderError` in `lib/model/errors.ts`; `anthropic.ts` translates SDK errors into it, so the
SDK stays confined to one file.
**Why:** the runner replaced every error with `(preview error)` to avoid logging user text, which
also hid "your credit balance is too low to access the Anthropic API" — an operational message
containing nothing of the user's. That cost three failed runs and a debugging round. Provider
messages are shown; errors of unknown origin still show only their name.

## Measurement

### 2026-09-18 — M1 The word-coverage diagnostic is removed and replaced by claimed-character coverage from `completeSplit()`
**Why:** bag-of-words matching reported 94.3% while two whole sentences were missing, because their
common words ("I", "need", "to", "buy") appeared in other items. A metric that looks healthy while
content is being lost is worse than no metric.

## Observed, for 3b

### 2026-09-18 — O1 Wispr mis-transcribes names, and the same entity can arrive spelt differently across captures
"Vault and the Mynd" arrived as "Walt and the mind"; one colleague arrived as both "Dingerva" and
"Dingbra" in two captures about the same meeting.
**Why this is recorded:** Stage 2 must link captures by context, not by exact spelling, and must
never "correct" a transcription itself — that would be guessing, and guessing is adding
information. Mitigation on the input side: add product and people names to Wispr's personal
dictionary. The Dingerva/Dingbra pair (`917a2ef4-…`, `1946e6fd-…`) is kept as a real test case for
3b's cross-capture pooling.

---

# 2026-09-18 — Slice 3a.1 verified

## Build order (continued)

### 2026-09-18 — B6 Slice 3a.1 is complete and verified; 3a is done
`npm run split:check` passes all seven coverage cases with zero model calls. On real captures:
the movie list became one `movies to watch` item and the shopping list one `things to buy` item,
each with its framing sentence inside; the Walt capture split correctly into a day recap and a
product idea with its framing kept. Zero rejected quotes across every run. Cost about $0.0012 per
split — lower than 3a, because copying the user's words produces fewer output tokens than
paraphrasing them.
**Why it counts as done:** the two `unassigned` items that appeared ("What else do I need?",
"Right, okay,") are the P7 guarantee working on real data, not a failure: the model skipped text
and code restored it verbatim. Nothing was lost in any run.

## Carried into 3b

### 2026-09-18 — P10 Filler and questions-to-self attach to the item beside them — prompt change, not code
**Why:** the model skips verbal filler ("Right, okay,") and rhetorical questions ("What else do I
need?"). The guarantee restores them, but as standalone `unassigned` items — which in 3b would
reach the Quick Calls queue as unfileable noise. Deciding which neighbour a fragment belongs to is
a judgment, so it stays with the model (CP1); code keeps only the guarantee that nothing is lost.

### 2026-09-18 — P11 Code lowercases topic labels
**Why:** the model returned both `meeting with dingerva` and `meeting with Dingbra`. Labels are
the organiser's own text, never the user's words, so normalising them is safe for code — and 3b
relies on labels to notice that two captures are about the same thing. The spelling difference is
a separate problem (O1) that only Stage 2's reading of context can resolve.

### 2026-09-18 — P12 The split stays verbatim; trimming repetition and rewording belong to Stage 2 and the v2 tidy pass
Restatements ("This is my movie list" after "a list of movies I've been wanting to watch") and
wording that could be tightened are left intact by the split.
**Why:** the split is provably lossless only because it copies the user's words exactly (P6,
P7). Stage 2 writes the actual note and may rephrase and drop pure repetition, never adding
(R3). Rewriting a note that already exists is the tidy pass deferred to v2 by D1. Raised by the
human on 2026-09-18 as a known future refinement, not a v1 requirement.
