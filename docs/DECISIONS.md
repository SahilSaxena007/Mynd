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

---

# 2026-09-18 — Slice 3b planning (route, write, guarantees)

Spec: `docs/slice-3b-spec.md`.

## Folders

### 2026-09-18 — F1 The organiser never creates folders in v1; the areas are fixed
Journal, Mynd, Work, Personal, Inbox. New folders arrive only through a Quick Call the user
approves (slice 6). No code under `lib/organizer/` may call `createFolder`.
**Why:** raised by the human — a confused model tends to invent folders, because a new folder is
never *wrong* the way a bad existing choice is. A per-run cap only rations that failure; removing
folder creation from the organiser's path removes it. The model is a newsroom reporter: it files
into fixed sections and never invents one; the user is the editor. Supersedes the same-day pick of
"broad folders, capped at 3 per run", which the human reopened after raising this.

### 2026-09-18 — F2 Folders are subjects, never formats; topics become notes, not folders
No "Lists", "Meetings" or "Ideas" folders. "things to buy" is a note in Personal.
**Why:** format folders are the biggest cause of ambiguity — a meeting agenda is both a Meeting and
Work, and a model that cannot choose invents a third place. Subjects give each item one natural
home, and the 3a topic labels map onto notes rather than folders.

## Data model (continued)

### 2026-09-18 — DM9 A capture status `skipped`, ignored by the organiser forever and never deleted
Set by `npm run captures:skip -- <ids>`, only on `pending` captures. The capture smoke test marks
its own rows skipped after checking them.
**Why:** the inbox held test junk ("one", "two", "sdsd", six smoke-test rows) that the first real
run would have filed into the vault, and every future smoke test run would have added more. An
explicit status keeps them visible in the Captures log, needs no special-casing in the organiser,
and deletes nothing (CAP4). Status has always been the pipeline (DM1), so this is a new state, not
an edit to the capture.

## Environment / config (continued)

### 2026-09-18 — E6 `USER_TIMEZONE=Europe/London`, used only to decide a Journal entry's day
Invalid or missing fails closed.
**Why:** captures are stored in UTC, and Journal notes are titled by date. Without the user's zone,
a late-evening thought can land on the wrong day's page.

## The organiser pipeline (continued)

### 2026-09-18 — P13 Lists are written as Markdown checkboxes; the organiser never removes an item
An unticked item already on the list is not added again; an item ticked `- [x]` and mentioned
again is added fresh. The user ticks and clears items in the note view (slice 4).
**Why:** raised by the human — lists are temporary, and the vault only ever grows (D1, CAP4).
Checkboxes let a list show what is done without the organiser ever deleting anything, and they
answer the repetition problem for lists specifically.

### 2026-09-18 — P14 Stage 2 uses short per-run references (N1, I1, X1), mapped to real ids by code
**Why:** asking a model to copy UUIDs invites a mangled id, and a mangled id is either a failure or
— worse — a write to the wrong note. Code issues every reference and rejects any it did not issue.

### 2026-09-18 — P15 Confidence is categorical — `sure` or `unsure` — not a numeric score
The D2 ~90% target is measured per run as the sure rate.
**Why:** a model's self-reported probability is poorly calibrated, so a threshold on it would be
false precision. "Would you bet the user agrees?" is a question a model answers more honestly.

### 2026-09-18 — P16 An item the plan fails to place is queued (`not_placed`), not a reason to abort the run
**Revises `ARCHITECTURE.md`**, which said a coverage failure should abort and write nothing.
**Why:** both satisfy R1 — the item is preserved either way — but aborting blocks every other item
in the run and retries the same failure next run, indefinitely. D2 says the queue must never block
the 90%. After coverage, `filed + queued = items` is asserted in code.

### 2026-09-18 — P17 A placement naming a folder or note that does not exist is demoted to a Quick Call
**Why:** code never writes to a target it cannot find. This is also what enforces F1 on the output
side: a plan that invents a folder cannot get anything written into it.

### 2026-09-18 — P18 An organise run processes at most 10 pending captures, oldest first
**Why:** Stage 2 pools every item from the run into one call. Bounding the batch keeps its input
and its output within limits, so a large backlog is worked through over several runs rather than
failing one huge call.

## Cost (continued)

### 2026-09-18 — C7 Stage 2 receives full note bodies while the vault is small
Stage 2's input size is printed on every run.
**Why:** summaries alone cannot show which items are already on a list, so P13's no-duplicate rule
needs the body. At tens of notes this costs well under a cent per run. Revisit with embeddings
(C4) once the vault reaches around a hundred notes or Stage 2 input passes ~20K tokens.

## Stack (continued)

### 2026-09-18 — S11 Optional `ROUTE_MODEL` for Stage 2, defaulting to `ORGANIZE_MODEL`
**Why:** Stage 2 is where organisation quality is decided, and it runs once per run. If Haiku's
routing disappoints, trying Sonnet 5 there costs about a cent per run and is one env line, with no
code change — the swappable layer doing what S4 promised.

---

# 2026-09-19 — Slice 3b review, before first real run

`organize:check` passes 8/8 with zero model calls, including the injected-failure rollback (R2).
F1 holds by construction: nothing under `lib/organizer/` references `createFolder`. Beyond the
spec, Codex added `assertOutsideTransaction()`, so a model call inside a vault transaction is
impossible rather than merely avoided, and it re-locks and re-checks target folders and notes
inside the apply transaction.

## Carried into 3c

### 2026-09-19 — P19 The apply transaction must lock the run's captures and confirm they are still `pending` before writing
**Found in review:** `applyPlan` locks target folders and notes but not captures, and
`markCaptureProcessed` does not require `status = 'pending'`. Two overlapping organise runs would
both gather the same captures, both plan, and both write — duplicate notes and appended blocks.
A capture skipped between planning and applying would also still be filed.
**Why it waits for 3c:** nothing is lost either way (R1 holds), and overlap is impossible while
runs are started by hand one at a time. The cron in 3c is what makes two runs able to overlap, so
the fix must land before, or with, the cron: lock the captures `FOR UPDATE` inside the
transaction, require every one to still be `pending`, and roll back the whole apply if any is not.
**Until then:** never run two `organize` commands at the same time.

---

# 2026-09-19 — Slice 3b first real run; revision 3b.1

Spec: `docs/slice-3b1-spec.md`. Seven real captures, one dry run and one real run, about four cents
in total. The guarantees held throughout: nothing lost, nothing invented, no half-writes. The
quality did not.

## What the first real run left in the vault

### 2026-09-19 — O3 The first real run filed one item into the wrong note, and it stays there
The Mynd idea "the organizer could use two prompts instead of one" was filed `sure` into the Work
note "meeting with Dingerva". Nine Quick Calls are open, four of them sentence scraps.
**Why this is recorded:** it is the failure no code check can catch — the folder and the note both
existed — and append-only notes (D1) mean the organiser cannot undo it. The user will move the line
by hand once slice 4 adds note editing. Nothing was lost.

## Decisions made by the human

### 2026-09-19 — P23 The real run applies exactly the plan the user reviewed
`organize --dry` saves an applyable plan; `organize --apply <run file>` writes it with no model call,
after re-checking inside the transaction that every capture is still `pending` and every target
still exists.
**Why:** the dry run and the real run of the same seven captures disagreed on the two most important
calls — whether Dingerva and Dingbra share a note, and whether the "two prompts" idea was filed. The
user approved one plan and got a different, worse one, which makes review meaningless. Applying the
reviewed plan exactly restores it, and the capture lock it needs is the P19 fix, so one mechanism
solves both. (Considered and rejected: only lowering randomness, which reduces the variation but
does not guarantee that the reviewed plan is the written one.)

### 2026-09-19 — S12 Stage 2 routes on `claude-sonnet-5`; splitting stays on `claude-haiku-4-5`
**Why:** the misfile was a confident judgment error in routing, the step where organisation quality
is decided, and it runs once per run — roughly a cent more per run, about $0.30 a month at two runs
a day. S11 made this a one-line env change. To be compared against Haiku on the same seven captures
with `route:preview` before being relied on.

### 2026-09-19 — O2 Name mismatches from transcription are not engineered around
**Why:** the human's call — "Dingerva" and "Dingbra" are one person misheard by Wispr, and the right
fix is at the input, in Wispr's personal dictionary, not in organiser logic. Worth knowing: the dry
run did link the two from context alone, so the model can do it; it just does not do it reliably.

## Derived decisions, flagged for review

### 2026-09-19 — P20 Randomness is at its minimum (`temperature: 0`) for split and route, only on models that accept it
A per-model capability table in `lib/model/capabilities.ts`; unknown models get no temperature.
**Why:** by default the model samples, so identical input gives different plans. Haiku accepts
`temperature`; Sonnet 5 rejects sampling parameters outright, so sending it there would fail every
call. This reduces variation; P23 is what guarantees the reviewed plan is the written one.

### 2026-09-19 — P21 A sentence is never split, and a leftover with only one possible home joins it — code, in `completeSplit()`
**Revises P10**, which said attaching a leftover is always a judgment. It is only a judgment when
there is more than one candidate. A leftover between two parts of the same item, or at the edge of
the capture next to a single item, has exactly one home, and code attaches it. A leftover between
two *different* items stays `unassigned` for the user.
**Why:** in the real run, four of nine Quick Calls were scraps like "Remember I told you" and
"? Now I know what to speak to him about." — pieces of sentences the model quoted only in part. The
guarantee preserved them, but as noise. Both rules only move the user's own text between items;
nothing is added or lost.

### 2026-09-19 — P22 Stage 2 keeps qualifiers, reasons and examples, and links captures only when the text shows a shared subject
**Why:** "I need to buy shoes, but I am not sure" became `Shoes`, and "house, then grocery, then
list" became "a specific location". Nothing was invented, but meaning was lost — the kind of
dropped information the D3 grader exists to measure. Separately, the misfile linked a product idea to
a work meeting only because they arrived together. `sure` now requires the item's own words to
support the destination.

### 2026-09-19 — L1 "Unsure" on a new kind of item is correct behaviour, not something to tune away
Mum and the dentist went to Quick Calls because no "things to do" note exists yet.
**Why:** this is the D2 learning loop working as designed. The user answers once, the answer becomes
a rule (slice 6), and the next such item is `sure`. Prompting the model to be confident about homes
that do not exist would reintroduce exactly the confident misfiling P22 targets.

## Tooling

### 2026-09-19 — T1 `route:preview` replays any captures, in any status, against either model, and never writes to the vault
Flags: `--no-notes` routes as if the vault were empty; `--route-model` overrides the Stage 2 model
for one run.
**Why:** the first real run marked the seven test captures `processed`, so `--dry` could no longer
reach them. Tuning prompts and comparing models needs a fixed set of inputs replayed identically,
without ever touching the vault.

### 2026-09-19 — P19 superseded by P23 — the capture lock lands in 3b.1, not 3c
`markCaptureProcessed` now also requires `status = 'pending'`, so no path can re-process a capture.

---

# 2026-09-19 — Slice 3b.1 results and model comparison; revision 3b.2

Spec: `docs/slice-3b2-spec.md`. Replaying the seven test captures on Haiku after 3b.1: no sentence
scraps, qualifiers and examples kept, sure rate 69% (from 40%). New problems: an invented date,
tasks filed into the Journal, two themes merged into one note, and one rambling thought split into
four Quick Calls. The Sonnet 5 comparison failed outright.

## Observed

### 2026-09-19 — O4 First observed breach of R3: an invented, wrong date
From "meeting with Dingerva on the 12th", Haiku wrote "Meeting scheduled for 2026-09-12" — in the
note title and the body. The user never said a month or year, and dictated this on 18 September, so
"the 12th" almost certainly meant October: the invented date was also wrong. The route prompt
already forbade adding dates.
**Why this is recorded:** it proves R3 cannot rest on instruction alone for the kind of fact that
does the most damage, and led directly to P24.

### 2026-09-19 — C8 Correction to S12's cost estimate: Sonnet 5 thinks by default
S12 estimated "about a cent more per run". Sonnet 5 runs adaptive thinking when `thinking` is
omitted, and thinking is billed as output: it used all 8,000 output tokens without finishing,
`stop_reason: max_tokens`, $0.087 per attempt — two attempts, $0.17, no usable result. Measured
Haiku routing on the same input: 1,104 output tokens, $0.008.
**Why this is recorded:** cost estimates for any model with default thinking must include thinking
tokens. At full strength, Sonnet routing would cost roughly $7–12 a month and need a higher token
cap — incompatible with the 80–90% margin target.

## Decisions made by the human

### 2026-09-19 — P24 No new numbers: any number the organiser writes must appear in what the user said — enforced in code
Digit runs in written blocks, and in new notes' titles and summaries, are checked against digit runs
in the source item text, after stripping leading zeros. A mismatch queues the item as a Quick Call
with reason `added_detail`. The one exemption: a Journal note title equal to the item's local date,
which code produces.
**Why:** O4. Numbers are the one kind of fact code can verify exactly — said or not said — and
invented numbers do the most harm: a wrong meeting date, time, price or amount. This moves that part
of R3 from instruction to guarantee. Accepted cost: a number spoken as a word ("twelfth") and written
as digits becomes a Quick Call — the safe side to be wrong on. Invented *words* remain the D3
grader's job.

### 2026-09-19 — F3 Tasks is a sixth fixed area
Areas: Journal, Tasks, Mynd, Work, Personal, Inbox. Amends F1 (six areas, still fixed, still never
created by the organiser) and makes one principled exception to F2.
**Why:** raised by the human after "call mom" and "book the dentist" were filed `sure` into the
Journal. Tasks are not a format like "Lists": whether something is an *action* is the central
distinction of GTD (IA2) — actions get their own place, separate from reference material. Journal
becomes reflections only. Tasks are checklist notes per area of life, with timing kept exactly as
spoken.

### 2026-09-19 — S13 Routing runs on Haiku 4.5 with a thinking budget (default 2,048 tokens); supersedes S12
**Why:** Haiku without thinking did well after 3b.1, and its remaining errors were judgment calls a
little reasoning should help with. Haiku supports thinking with a budget, which steers how much it
thinks — more control than Sonnet 5's adaptive thinking, and no new provider. About $0.018 per run,
roughly $1.10 a month. The budget is a target, not a hard cap; `max_tokens` remains the ceiling.

### 2026-09-19 — M2 Models compared for routing; a second provider only if Haiku with thinking still misjudges
Checked 2026-09-19 against the providers' own pricing pages, per million tokens: Haiku 4.5 $1/$5;
Sonnet 5 $2/$10; Gemini 3.8 Flash $0.75/$3.75 until 31 Dec 2026, then $1.50/$7.50, with thinking
always on at level low/medium/high; Gemini 3.5 Flash-Lite $0.30/$2.50; OpenAI GPT-5 mini $0.25/$2.00.
**Why this is recorded:** every option costs between about $0.35 and $1.40 a month for routing, so
price does not separate them — quality on real captures does, and only a replay on the same captures
can show that. A second provider also means the user's private thoughts go to a second company under
its data terms (Gemini's free tier uses content to improve Google's products; its paid tier does not).
Shortlist if needed: Gemini 3.8 Flash and GPT-5 mini, via a `lib/model/` adapter as S4 intended.

## Derived decisions, flagged for review

### 2026-09-19 — P25 On Haiku, thinking and `temperature` are incompatible: split keeps temperature 0 without thinking; routing thinks without temperature
Amends P20. Per Anthropic's docs, on Haiku 4.5 "`temperature` and `top_k` are incompatible with
thinking."
**Why:** routing therefore varies somewhat from run to run. That is acceptable because P23 applies
exactly the plan the user reviewed; for unattended runs (3c), the variation is accepted.

### 2026-09-19 — P26 The route prompt keeps relative dates as spoken, one theme per note, and a continuing thought together
**Why:** O4; the "organizer prompts and user involvement" note that joined two themes (R4 — a title
needing "and" is two notes); and one rambling thought split into four Quick Calls, each proposing its
own new note.

### 2026-09-19 — DM10 Folder descriptions are editable with `npm run folders:describe`
**Why:** DM2 says folder behaviour changes by editing its description, but the seed deliberately never
overwrites an existing one, so there was no way to make that edit. This is a user tool; it changes
descriptions only and cannot create, rename or move a folder, so F1 holds.

### 2026-09-19 — P24a P24 is applied per digit run, with no exception for zero minutes
From "at 9", `09:00` is queued `added_detail`: it is two numbers, and the `00` was never said.
**Why:** raised by Codex, which found that `docs/slice-3b2-spec.md` contradicted itself — its rule
rejected `09:00` while its test case expected it to pass. The rule wins. "At 9" does not specify 9:00,
P26 already tells the model to keep times as spoken, and an exception would special-case a rule whose
value is being exact. The test case was a spec error, now corrected.

---

# 2026-09-20 — Slice 3b.2 reviewed; sequencing corrected

## Build order (continued)

### 2026-09-20 — B7 Stop revising organiser quality after 3b.2; ship 3c, 4 and 5 before tuning again
**Why:** the human asked for a recap because they were losing track, and the recap showed the drift:
three revisions deep in slice 3b, tuning filing quality against **seven** test captures, while the
vault still has no screens. Two reasons that ordering is backwards — organiser quality has no finish
line and needs fifty real captures to tune honestly, and that corpus only appears once the app is
rewarding to open, which is slice 4. The mess already in the vault (one misfiled line, nine open
Quick Calls) also cannot be cleaned until slices 4 and 6 exist. Revisit organiser quality once there
is a real corpus.

### 2026-09-20 — B8 Slice 3b.2 passes its free checks; the real-data replay is the remaining gate
12 split cases and 19 organize cases, zero model calls, typecheck and lint clean. Beyond the spec,
routing on a non-budget model now fails fast rather than spending — which would have caught the
Sonnet failure for free.

## Process (continued)

### 2026-09-20 — PR3 `docs/STATE.md` holds the one-page picture; `DECISIONS.md` stays the full history
Rewritten at the end of each session: what works, what is next, what is in the vault, known issues,
commands.
**Why:** the decision log passed a hundred entries and stopped being readable as a status report. A
human returning after a break, or a fresh session, needs the picture in thirty seconds and the
history only when a specific decision is in question.

---

# 2026-09-20 — Slice 3b.2 verified on real data

### 2026-09-20 — B9 Slice 3b.2 passes; organiser quality work is banked until there is a real corpus
Replaying the seven test captures (`--no-notes`, $0.033): **sure rate 92%** against D2's ~90% target,
one Quick Call out of 13 items, and `added_detail 0 / invalid_target 0 / not_placed 0`. Both gates
passed: "on the 12th" stayed as spoken instead of becoming an invented 2026-09-12 (P24, P26), and the
tasks landed in Tasks as checkboxes with "next week" intact (F3, P13). Qualifiers survived — "Shoes,
but I am not sure", the spiders' reason, the Goodwill Hunting reason.
**Why banked:** per B7. Every remaining problem is quality, not a broken guarantee.

### 2026-09-20 — O5 Known organiser-quality issues, for the quality pass after slice 5
Recorded from the 2026-09-20 replay (`.runs/2026-09-20T13-27-11…json`), in order of seriousness:

1. **Two themes in one note (R4).** A Mynd note titled "user involvement in organizing" also held
   the cable-deduplication and repeatability items from a different capture. The title named only one
   theme, which hides the merge better than last run's "X and Y" title did. P26's one-theme rule is not
   holding; the title may need to be the test — if the title cannot honestly cover every item in the
   note, it is more than one note.
2. **A conditional became an assertion.** "if the cable has been mentioned before and I've mentioned
   it again" was written as "The cable has been mentioned before and I've mentioned it again" — a
   hypothetical rule turned into a claim that it happened. No number is involved, so P24 cannot see
   it; this is the class of quiet meaning change the D3 grader exists to measure.
3. **Doubts still dropped selectively.** "I don't know if that's something that we should be doing
   right now, but…" lost its first clause, while "Shoes, but I am not sure" kept its qualifier in the
   same run. P22 holds unevenly.
4. **Conversational asides get filed as content.** "After looking at this example, I could paste the
   logs of the other ones too" is the user talking to the assistant, and it was filed `sure` into a
   Mynd note. There is no notion of a capture, or part of one, being conversation rather than
   material. Worth a product decision, not just a prompt line.
5. **A Quick Call offered one option**, where D2 asks for two or three.
6. **Cost per run rose** from $0.019 to $0.033 with a 2,048-token thinking budget — about $2/month at
   two runs a day. Acceptable, and worth re-measuring if the budget changes.

---

# 2026-09-20 — Deploy inserted before slice 4

### 2026-09-20 — B10 Deploy to Railway before slice 4; then slice 4, then 3c
Spec: `docs/slice-deploy-spec.md`.
**Why:** capture only worked while the laptop was awake running `npm run dev` with the phone on the
same Wi-Fi, so a thought on the train was simply lost. B7 banked the organiser-quality work in order
to build a real corpus, and that corpus cannot grow until capture works anywhere. Deploying also gives
3c's cron somewhere to run that is not the laptop, and brings HTTPS, without which the app cannot be
installed to a home screen (B3). (Considered and rejected: slice 4 first, which shows the vault sooner
but leaves capture laptop-bound; and 3c as a local cron, which automates the one thing already
triggerable by hand while solving neither problem.)

### 2026-09-20 — SEC1 The `SECRET_TOKEN` is regenerated as part of deploying
**Why:** the current value was pasted into a planning conversation on 2026-09-17 via an editor
selection, so it exists in that transcript. It is acceptable as a local-development lock and
unacceptable as the only lock on a public URL (S7).

### 2026-09-20 — SEC2 `/api/health` is the one unauthenticated endpoint, and returns only `{"ok":true}`
**Why:** the platform needs to know whether the app is alive, and a healthcheck that cannot be reached
without a token is useless. Because it is the only open door, it must be incapable of leaking
anything: no counts, no versions, no configuration, no database read.

### 2026-09-20 — SEC3 Vault screens fetch their data from the browser with the token, never during server render
**Why:** the token gate is client-side (S8), so a server component that read the database while
rendering would hand notes to anyone who opened the public URL. Slice 2 already works this way; slice 4
must keep to it. This is the most likely way a later slice could quietly undo S7.

### 2026-09-20 — E7 Railway builds with `npm install`, not `npm ci`
**Why:** the first deploy failed — `npm ci` requires `package-lock.json` to match `package.json`
exactly, and the lock was missing `@emnapi/runtime` and `@emnapi/core`. Those are optional
dependencies of sharp's wasm variants (sharp arrives with Next 16), and **npm on Windows cannot
record them**: `npm install` did not add them, and neither did `npm install --os=linux --cpu=x64`.
Any lock file generated on this machine will keep failing `npm ci` on a Linux container.
**Trade-off accepted:** `npm ci` reproduces the lock exactly; `npm install` may resolve newer
versions inside the existing semver ranges at build time. For a single-developer MVP that is a fair
price for removing a whole class of build failure. Revisit if a build ever breaks from an unexpected
dependency bump — the fix then is to generate the lock in a Linux container (CI or Docker), not to
hand-edit it.

### 2026-09-20 — B11 Deploy is done: Mynd is live at https://mynd-production-c3eb.up.railway.app
Verified on phone and laptop. Railway redeploys on every push to `main`.
**Why it counts as done:** capture no longer depends on the laptop being awake, which is what B7's
plan needed — the user can now dictate at work and through the day, and the corpus grows on its own.
Next: slice 4 (vault and note screens), then 3c (cron).

### 2026-09-20 — SEC4 The `SECRET_TOKEN` must be rotated again, and the `.env` token line kept unselected in the editor
**Why:** the rotated token was sent into the planning conversation on 2026-09-20 by the IDE's
automatic selection context, the same way the original leaked on 2026-09-17. It is now the only lock
on a public URL holding private notes (S7), so a leaked value matters more than it did locally. The
durable mitigation is behavioural: never leave that line highlighted, since the editor forwards the
selection without being asked.

---

# 2026-09-20 — Slice 4 planning (the screens)

Spec: `docs/slice-4-spec.md`.

### 2026-09-20 — UI1 Three screens: vault home → folder → note, navigated by tapping
**Why:** it mirrors how the vault is actually shaped (six areas, notes inside them) and needs no
search or filtering to be useful at this size. `GET /api/vault` returns folders and note metadata in
one call and the folder screen filters in the browser — a second endpoint would buy nothing at tens
or hundreds of notes.

### 2026-09-20 — UI2 The human may edit a note; the organiser still may not
Tapping a checkbox and Edit mode both rewrite the note body.
**Why:** D1 ("never rewrite a note") is a constraint on the *AI*, because a model rewriting prose it
did not write is how content gets silently lost. The user editing their own note is the opposite —
it is CP2's correction-not-construction, and it is what finally lets the misfiled line from O3 be
removed. Captures stay immutable regardless, so the original words are always recoverable.

### 2026-09-20 — UI3 Saving a note carries its last-modified time and is refused on conflict (409)
**Why:** this is the first code in the project that can overwrite a note instead of appending. The
organiser appends on its own schedule, so a note left open on the phone could otherwise wipe whatever
was added while it sat there. The check and the write happen in one transaction, so the race cannot be
won. On conflict the screen shows the current text rather than choosing for the user.

### 2026-09-20 — UI4 Folder colours fall back to a palette keyed by slug when the column is null
**Why:** `mynd`, `work`, `personal` and `tasks` were created without colours, and a UI fallback avoids
inventing another command to set them. The database value always wins, so DM2's principle — folder
configuration lives in the row — is intact.

### 2026-09-20 — UI5 Mynd is installable, with generated icons rather than committed binaries
**Why:** B3 deferred the manifest until there was HTTPS and a shell worth installing; deploying
delivered both. Generating the icon from JSX (`ImageResponse`) keeps binary assets out of the repo and
means no one has to draw anything. If that proves awkward to wire into the manifest, two small PNGs are
an acceptable substitute — the requirement is an installable app with a recognisable icon.

### 2026-09-20 — B12 Slice 4 is complete and verified on the live site
Checked against the running app with no token: the public HTML contains no note content — "things to
buy", "movies to watch", "Dingerva", "Shenzhen", "dentist" and "protein" all absent from 7,780 bytes
of shell — and `/api/vault`, `/api/captures` and `/api/note/<id>` all return 401. `/api/health`
returns only `{"ok":true}`; the manifest serves with 192 and 512 icons. The human confirmed the
screens work on phone and laptop.
**Why it was checked live rather than read:** SEC3 was the one way this slice could have quietly
published the vault to the internet, and reading the code is not the same as reading what the server
actually sends.

### 2026-09-20 — PR4 Terminal commands given to the human must be PowerShell, not bash
**Why:** two verification commands were handed over as `curl … | grep …`, which fails in PowerShell —
there is no `grep`, and `curl` is an alias for `Invoke-WebRequest` with different flags. The human hit
four errors in a row on commands that were never going to work. Either write PowerShell, or run the
check in this terminal, which has a real bash and can reach the live URL itself.

---

# 2026-09-20 — Slice 3c planning (the cron)

Spec: `docs/slice-3c-spec.md`.

### 2026-09-20 — J1 The schedule is a second Railway service that runs the organiser and exits
Same repo, its own start command (`npm run organize:cron`), cron `0 7,19 * * *` UTC, no domain.
**Why:** a cron on the laptop only fires when the laptop is awake, which defeats the point. A separate
service keeps the organiser **off the public surface** entirely — no `POST /api/organize-now`, so
there is no new door on a URL that anyone can reach. (Considered and rejected: an endpoint plus an
external trigger, which would later allow an "Organise now" button but adds a public door now.)
Overlap with a manual run is already safe because the apply transaction locks the captures and
requires them still pending (P19/P23).

### 2026-09-20 — J2 Blame the capture, not the provider
A `ModelProviderError` (rate limit, no credit, auth, 5xx) marks nothing and the next run retries. Any
other failure on one capture marks **that capture** `failed`, and the next run proceeds without it.
**Why:** P5 stops a run at the first failure, which is right when a human is watching and wrong when
nobody is: one unusable capture would silently block every future run and the vault would just stop
filling. Distinguishing the two causes is what makes marking safe — a rate limit is not the capture's
fault and must never brand it. Marking then stopping (rather than continuing through the batch) avoids
weakening the spend guard, which refuses every later call in a run after a failure; the cost is at most
one run's delay. A `failed` capture is not deleted and not hidden: it shows in the Captures log with
its text intact (CAP4, DM1).

### 2026-09-20 — DM11 An `organize_runs` table records every run, written outside the apply transaction
Trigger, status, counts, cost, the blamed capture if any, and a short operational error string.
**Why:** an unattended organiser that quietly stops is the worst failure mode available — you would
notice weeks later, having assumed your thoughts were being filed. The record is written outside the
transaction on purpose: a rolled-back run must still leave evidence that it tried, which is precisely
the case worth seeing. The `error` string holds the stage and the provider status only, never capture
text, because it is shown on a screen and may reach logs.

### 2026-09-20 — J3 The vault home shows "last organised …" from the newest run record
**Why:** Railway keeps logs, but nobody goes looking at logs for something they assume is working. One
line on the screen you already open turns a silent failure into an obvious one.

### 2026-09-20 — J4 Dry runs remain previews; record actual manual and cron runs only
`organize --dry` does not insert `organize_runs` or mark a capture failed. Existing model-call
accounting and the local review file still apply. Actual manual runs, including applying a reviewed
plan, and cron runs record their result outside the apply transaction.
**Why:** explicitly confirmed by the human while implementing 3c; previewing a plan must not change
capture status or present a preview as the last completed organisation.

---

# 2026-09-21 — First cron run failed; revision 3c.1

Spec: `docs/slice-3c1-spec.md`. The first scheduled run cost $0.056 and recorded `route failed.`
because the route call hit exactly 8,000 output tokens — our own ceiling — and was truncated.
Railway's default restart-on-failure policy then retried it, spending about $0.10 in twenty minutes
before the human set the policy to Never.

### 2026-09-21 — SP6 `MAX_TOKENS_PER_CALL` rises to 16,000, and the route call asks for it
**Why:** nine captures produce a plan that does not fit in 8,000 output tokens, and the 2,048-token
thinking budget is spent from the same allowance. Checked against the Models API, Haiku 4.5 allows
**64,000** output tokens, so 8,000 was our own cap being wrong rather than a model limit. Behaviour of
the guard is unchanged — it still refuses anything above the ceiling and still fails closed when a
limit is missing — and cost is only ever what is actually produced. The split stays at 8,000; its
largest output to date is 183 tokens.

### 2026-09-21 — DM12 `model_calls` records `thinking_tokens`
**Why:** the failure could not be diagnosed from our own data. `model_calls` stored total output only,
so there was no way to tell whether thinking or the plan consumed the 8,000 tokens — and the answer
decides whether to raise the ceiling or cut the thinking budget. The API returns
`usage.output_tokens_details.thinking_tokens` and we were discarding it. Measure before tuning
`ROUTE_THINKING_BUDGET`.

### 2026-09-21 — J4 A truncated route call retries once within the same run, with half the batch
Only on `stop_reason: max_tokens`, only once, reusing the Stage 1 results already in hand so no capture
is split twice. A provider error, a schema failure or a refusal still triggers no retry.
**Why:** J2 deliberately blames no capture for a Stage 2 failure, which left a gap: the same batch is
retried on the next schedule and truncates identically, unattended, at four cents a time — the vault
silently stops filling. Halving the batch inside the run recovers from *our* budget being wrong without
retrying the model into working, which is what the no-retry rule in `AGENTS.md` prohibits. The captures
left out stay `pending` for the next run.

### 2026-09-21 — J5 The cron service's Restart Policy must be **Never**
**Why:** `jobs/organize-cron.ts` exits non-zero on failure so Railway shows the run red (J1). Railway's
default "On Failure" policy reads that exit code and restarts the container — up to ten times on this
plan — and every attempt is a real, paid organise run. A single genuine failure became several in
twenty minutes. One attempt per schedule, then wait, is the whole intent of J2.

### 2026-09-21 — B13 The cron works: nine captures organised unattended
Run records: `19:36 failed (route truncated, $0.056)` → `19:51 ok — 9 processed, 10 filed, 3 queued,
6 notes created, 1 appended, $0.046` → `19:56 nothing_pending, $0.000`. The vault went from 5 notes to
11; `mynd` grew from 1 to 6 and the first `tasks` note appeared. Path 2 is closed: thoughts dictated at
work filed themselves with no terminal involved.
**The caveat worth recording:** the successful run was one of Railway's restart-policy retries, which
J5 has now disabled. It succeeded by chance — routing runs with thinking and is therefore sampled
(P25), so the second attempt produced a shorter plan that happened to fit under the 8,000-token
ceiling. With Restart Policy correctly set to Never, that first failure would have stood and nothing
would have been organised for twelve hours. This makes J4 (halve the batch and retry once, in-run, only
on truncation) the deliberate replacement for blind container restarts, rather than a nicety.

---

# 2026-09-21 — Slice 5 planning (Ask)

Spec: `docs/slice-5-spec.md`.

### 2026-09-21 — A1 Ask sees organised notes and not-yet-filed captures, the latter labelled
**Why:** as `ARCHITECTURE.md` specified. The organiser runs twice a day, so notes-only would leave a
thought dictated this morning invisible until tonight — Ask would be behind the user's own thinking.
Labelling unfiled captures keeps the distinction honest, and the prompt requires an answer resting on
one to say so.

### 2026-09-21 — A2 The answer job runs on `claude-sonnet-5` with thinking disabled
**Why:** R5 — never fabricate, say "not in your notes" — is the hardest instruction in the product, so
it gets the stronger model. But thinking is what made Sonnet cost $0.087 and truncate in 3b.1, and
answering from supplied sources is careful reading rather than hard reasoning. Thinking off puts a
question at roughly one to two cents. Sonnet 5 rejects sampling parameters, so no `temperature` is sent
either. Revisit if answers show sloppy grounding — the lever is one line.

### 2026-09-21 — A3 Ask has its own tab, with a history of recent questions
Each row shows the question and a trimmed answer, expanding on tap to the full answer and its cited
notes.
**Why:** the human asked for the history specifically, and gave the reason — the questions people ask
are the clearest signal of what they actually want from the vault. Stored questions are also the
evidence for whether R5 holds in practice: the "not in your notes" rows are the interesting ones.

### 2026-09-21 — A4 Citations are enforced in code: an answer with no valid citation becomes "not in your notes"
Citations naming a reference code never issued are dropped; if none survive, `answered` is forced to
false and the answer shown is exactly "Not in your notes."
**Why:** an answer with no source is indistinguishable from an invented one, so R5 cannot rest on the
prompt alone. Code cannot verify that an answer *follows* from its sources, but it can verify the
sources are real and that at least one was used — and it can refuse to display an unsourced answer.

### 2026-09-21 — A5 P24 (no new numbers) is deliberately NOT applied to answers
**Why:** "You have 3 things left to buy" is a correct answer whose `3` appears in no note. Counting and
summarising are legitimate in answering, where in note-writing they never were, so the rule that made
note-writing safe would reject good answers here. Instead the prompt forbids figures the notes do not
contain, citations are shown so any figure can be checked against its source, and the D3 grader
(slice 7) is the right place to measure it. Recorded because the temptation to reuse P24 here is
obvious and wrong.

### 2026-09-21 — DM13 An `asks` table stores every question, answer, citation set and cost
**Why:** A3 needs the history, and the table doubles as the record of how well R5 holds and what the
user actually wants to know. Every ask is stored, including unanswered ones. Ask writes nothing else —
no notes, no folders, no captures — so a question can never change the vault.

---

# 2026-09-21 — v2 roadmap note

### 2026-09-21 — V2-1 Post-v1 differentiators (from the Karpathy method, validated by askglitch traction)
1. **Lint** — background surfacing of contradictions, staleness and thin coverage in the vault.
   *The capability is already proven in the retrieval test.*
2. **Digest** — scheduled weekly synthesis, doubling as a re-engagement hook.

**Deliberate divergence from the method:** Karpathy's version has the AI own Layer 2 and tells the
user not to edit it. Mynd keeps the correction loop instead — **ownership without labour** (CP2).

**Our edges over the method:** voice capture, the fidelity guarantees (R1–R5 enforced in code), and
UI / mobile / cross-device. These are the parts that make it usable by someone who is not a developer.

**Status:** post-v1. Not to be built into the current slices; recorded so the v1 work does not
foreclose it.

---

# 2026-09-21 — Slice 5 verified live; UI revision 5.1

### 2026-09-21 — B14 Slice 5 works: R5 holds on real questions
Four live questions, roughly a cent each. "when is my dentist appointment?" returned **"Not in your
notes."** — there is a task to *book* the dentist and no time was ever dictated, so inventing one was
the available failure and it did not happen. "what did I say about the Dingerva meeting?" answered
with "Meeting on the 12th", keeping the partial date exactly as spoken rather than resolving it (P26).
A question about an unfiled capture was answered and labelled "Based on an unfiled capture" (A1).
Citations linked to the right notes and each answer showed its cost.
**Two things the answers incidentally proved:** the model reads checkbox state correctly ("Extension
cable, Shenzhen sauce, and Chair are already checked off as done"), and it surfaced "Dual Switch Mouse
(listed twice)" — the O5 repetition problem appearing in real data rather than in a test.

### 2026-09-21 — A6 An answer truncates and expands in place: one element, two states
**Why:** the collapsed preview and the full answer were separate blocks, so expanding a row showed the
same text twice.

### 2026-09-21 — A7 The ask you just made renders expanded; a fresh page load collapses everything
**Why:** raised by the human — hiding an answer you requested two seconds ago behind a tap is
backwards. Collapsing is for history, not for what you are currently reading.

### 2026-09-21 — A8 Unanswered asks are stored but not listed
`GET /api/asks` returns answered asks only; the row is still inserted for every ask. An unanswered
result shows at ask time as a warning above the history, styled as information rather than an error.
**Why:** the human asked for unanswered results to stay out of the history list. DM13's reason for
storing them — they are the record of what the vault could not answer, and the evidence that R5 holds
— is preserved by keeping the row and changing only what the list displays. A truthful "I don't know"
is the feature working, so the UI must not dress it as a failure.
