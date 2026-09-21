# STATE.md — where Mynd stands

The 30-second version. Rewritten at the end of each session. `DECISIONS.md` is the full
history (120+ dated entries); this page is just the picture.

**Last updated:** 2026-09-21, slice 3c.1 implemented; live verification pending.

**Live URL:** https://mynd-production-c3eb.up.railway.app — works on phone and laptop, on any
network, with the laptop closed. Installable to the home screen. Railway redeploys on every push to
`main`; builds run `npm install` (E7) and no migration runs on deploy.

---

## What works today

| Path | Status |
|---|---|
| **1. Capture** — dictate a thought, it saves | ✅ live, from anywhere |
| **2. Organise** — files each thought into the vault | Cron service exists; first run truncated, revision 3c.1 prepared locally |
| **3. View** — browse and edit the vault | ✅ live: folders → notes → a note, tappable checkboxes, Edit mode |
| **4. Ask** — ask questions of your notes | ❌ not built (slice 5) |

The first cron run hit the 8,000-output-token cap; Railway retries were stopped by setting
Restart Policy to Never (J5). Slice 3c.1 now requests 16,000 for routing, records thinking tokens,
and retries only a truncated route once using the oldest half of the already-split batch.
Omitted captures remain pending. Dry previews still do not change capture status or run records.
Typecheck, lint, build, and all 34 organizer checks pass (28 existing + six new), with zero
provider calls. The first check run lost its database connection during cleanup; the full rerun passed.
No production migration, paid run, push, or deploy was performed in this session; `.env` was not edited.
Before live testing, run `npm run db:migrate` and set `MAX_TOKENS_PER_CALL=16000` locally and on
both Railway services. Follow `docs/slice-3c1-spec.md` for the paid preview and cron checks;
keep Restart Policy Never.

## Slices

Done: **1** schema · **2** capture · **3a** model layer, spend guard, split · **3a.1** split by
topic, proven lossless in code · **3b** route and write · **3b.1** apply the reviewed plan ·
**3b.2** no invented numbers, Tasks area, thinking while routing · **deploy** · **4** the screens.

Next: **3c.1** migration, ceiling configuration and live verification → **5** Ask → **6** Quick Calls
and the learning loop → **7** grader.
Banked until there is a real corpus: the organiser-quality pass (B7, O5).

## What's in the vault

Six fixed areas the organiser can never add to: **Journal · Tasks · Mynd · Work · Personal ·
Inbox**. At the last check: 5 notes, 9 open Quick Calls, 7 captures filed, 15 skipped.

Last recorded AI spend before cron testing: about **$0.33**; the failed cron attempts added spend
(see the 2026-09-21 decisions). This implementation session made no provider calls.

## What code guarantees (not the AI)

- **Nothing is lost.** Every part of a capture reaches some item; every item is filed or queued.
  Asserted, not hoped for.
- **Nothing is invented.** Split output is verbatim quotes from the capture, and any number the
  organiser writes must be one you said.
- **The vault is never half-written.** One transaction per run; a failure writes nothing.
- **Every actual organise attempt leaves a run record outside the apply transaction**, including
  rollback and no-pending runs. Only a non-provider Stage 1 failure can mark its pending capture
  failed. Dry previews never write run records or mark captures failed.
- **The organiser only appends to notes.** You may edit them by hand; it may not (UI2).
- **Your edits cannot clobber the organiser, or be clobbered by it.** A save carries the note's
  exact last-read timestamp, checked under a row lock; a conflict returns 409 with the current note.
- **The organiser cannot create folders.** The capability does not exist on its path.
- **Nothing ever deletes a capture.** There is no DELETE statement anywhere in the repo.
- **Spending is capped** per call, per run and per day, and fails closed if a limit is missing.
- **The vault is never server-rendered.** The URL is public; screens fetch with the token (SEC3) —
  verified against the live site, not just the code.

Still on the AI's honour: not inventing *words* when writing note text. Slice 7's grader measures it.

## Known issues

- One line ("Two prompts instead of one in the organizer") is filed in the wrong note. Now fixable by
  hand in the note Edit mode.
- 9 open Quick Calls, some of them noise. Cleared in slice 6.
- Organiser quality is tuned against only 7 test captures; it needs 50+ real ones, which is why daily
  use matters more than more tuning right now (B7, O5).
- Production needs the 3c.1 thinking-token migration and 16,000-token ceiling on both services.
  Keep the cron service's Restart Policy Never; complete the live checklist before restoring its schedule.

## Commands

```
npm run dev                     the app locally (-- -H 0.0.0.0 to reach it from the phone)
npm run organize -- --dry       plan the filing, write nothing (a few cents)
npm run organize -- --apply <run file>    write exactly that reviewed plan ($0)
npm run organize:cron           paid unattended run; records result and exits (Railway entry point)
npm run route:preview -- --ids <ids> --no-notes    replay captures, never writes
npm run vault:print             see the vault from the terminal
npm run captures:skip -- <ids>  ignore captures (deletes nothing)
npm run folders:describe -- <slug> "<text>"   change how a folder behaves
npm run split:check             free, no AI
npm run organize:check          free, no AI
```

Every command that can spend money reports what it cost.

## How we work

Planning and decisions happen in the Claude Code terminal; **Codex writes the feature code** from a
written slice spec in `docs/`. Nothing lives in chat — read `AGENTS.md`, `ARCHITECTURE.md`,
`docs/DECISIONS.md` and the current slice spec and you are current.

A slice is not done when its automated checks pass; it is done when the manual scenarios pass on the
real device (PR2). Anything that could expose the vault is checked against the live site (B12).
