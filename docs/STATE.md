# STATE.md — where Mynd stands

The 30-second version. Rewritten at the end of each session. `DECISIONS.md` is the full
history (100+ dated entries); this page is just the picture.

**Last updated:** 2026-09-20, slice 4 implemented and checked locally; not pushed or deployed.

---

## What works today

| Path | Status |
|---|---|
| **1. Capture** — dictate a thought, it saves | ✅ **live** at the URL below, from any network |
| **2. Organise** — files each thought into the vault | ✅ works, run by hand from the terminal |
| **3. View & Ask** — browse the vault, ask it questions | View implemented locally (slice 4); Ask awaits slice 5 |

Slice 4 adds token-gated vault → folder → note screens, Markdown task checkboxes, manual
editing with transactional conflict checks, and generated install icons. Typecheck, lint,
and build pass. Local browser checks cover unauthenticated access, icon dimensions,
navigation, duplicate checkbox lines, failures, and conflicts using mocked note data.
Live persistence, concurrent database saves, and phone installation still need the spec's
manual checks after the human pushes. No live notes or `.env` were changed.

## Slices

Done: **1** schema · **2** capture · **3a** model layer, spend guard, split · **3a.1** split by
topic, with code proving no loss and no invention · **3b** route and write · **3b.1** apply the
reviewed plan · **3b.2** no invented numbers, Tasks area, thinking while routing.

Deploy repository work is prepared: Node engine requirement, explicit Railway build/start
commands, a public `/api/health` returning only `{"ok":true}`, and README dashboard steps.
No migrations run on deploy; `npm run db:migrate` remains a deliberate local command.

**Live URL:** https://mynd-production-c3eb.up.railway.app — deployed 2026-09-20, verified on phone
and laptop. Capture works with the laptop closed, so thoughts can be dictated anywhere. Railway
redeploys on every push to `main`; builds run `npm install` (E7), and no migration runs on deploy.

Next: **4** push and live phone verification →
**3c** cron → **5** ask → **6** Quick Calls and the learning loop → **7** grader (B10).

## What's in the vault

Six fixed areas the organiser can never add to: **Journal · Tasks · Mynd · Work · Personal ·
Inbox**. As of the last check: 5 notes, 9 open Quick Calls, 7 captures filed, 15 skipped.

Total AI spend since the start: about **$0.29**.

## What code guarantees (not the AI)

- **Nothing is lost.** Every part of a capture ends up in some item; every item is filed or
  queued. Asserted, not hoped for.
- **Nothing is invented.** Split output must be verbatim quotes from the capture, and any number
  the organiser writes must be one you said.
- **The vault is never half-written.** One transaction per run; a failure writes nothing.
- **The organiser only appends to notes.** Human edits check the exact last-read timestamp
  under a row lock before rewriting; conflicts return 409 and the current note.
- **The organiser cannot create folders.** The capability does not exist on its path.
- **Nothing ever deletes a capture.** There is no DELETE statement anywhere in the repo.
- **Spending is capped** per call, per run, and per day, and fails closed if a limit is missing.

Still on the AI's honour: not inventing *words* when writing note text. Slice 7's grader measures
that.

## Known issues, waiting on later slices

- One line ("Two prompts instead of one in the organizer") is filed in the wrong note. Fixable by
  hand after deploying slice 4's note editing; this session did not change that note.
- 9 open Quick Calls, some of them noise. Cleared in slice 6.
- Organiser quality is tuned against only 7 test captures. It needs 50+ real ones — which means
  using the app daily, which needs slice 4.

## Commands

```
npm run dev                     the app (add -- -H 0.0.0.0 to reach it from the phone)
npm run organize -- --dry       plan the filing, write nothing (a few cents)
npm run organize -- --apply <run file>    write exactly that reviewed plan ($0)
npm run vault:print             see the vault
npm run captures:skip -- <ids>  ignore captures (deletes nothing)
npm run folders:describe -- <slug> "<text>"   change how a folder behaves
npm run split:check             free, no AI
npm run organize:check          free, no AI
```

Every command that can spend money says what it cost when it finishes.

## How we work

Planning and decisions happen in the Claude Code terminal; **Codex writes the feature code** from
a written slice spec in `docs/`. Nothing lives in chat — read `AGENTS.md`, `ARCHITECTURE.md`,
`docs/DECISIONS.md` and the current slice spec and you are current.

Each slice is tested before the next. A slice is not done when its automated checks pass; it is
done when the manual scenarios pass on the real device (PR2).
