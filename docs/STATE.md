# STATE.md — where Mynd stands

The 30-second version. Rewritten at the end of each session. `DECISIONS.md` is the full
history (120+ dated entries); this page is just the picture.

**Last updated:** 2026-09-20, after slice 4 shipped and was verified on the live site.

**Live URL:** https://mynd-production-c3eb.up.railway.app — works on phone and laptop, on any
network, with the laptop closed. Installable to the home screen. Railway redeploys on every push to
`main`; builds run `npm install` (E7) and no migration runs on deploy.

---

## What works today

| Path | Status |
|---|---|
| **1. Capture** — dictate a thought, it saves | ✅ live, from anywhere |
| **2. Organise** — files each thought into the vault | ✅ works, but **run by hand** from the terminal |
| **3. View** — browse and edit the vault | ✅ live: folders → notes → a note, tappable checkboxes, Edit mode |
| **4. Ask** — ask questions of your notes | ❌ not built (slice 5) |

The one gap in daily use: captures sit as `pending` until someone runs `npm run organize`. That is
slice 3c.

## Slices

Done: **1** schema · **2** capture · **3a** model layer, spend guard, split · **3a.1** split by
topic, proven lossless in code · **3b** route and write · **3b.1** apply the reviewed plan ·
**3b.2** no invented numbers, Tasks area, thinking while routing · **deploy** · **4** the screens.

Next: **3c** the cron → **5** Ask → **6** Quick Calls and the learning loop → **7** grader.
Banked until there is a real corpus: the organiser-quality pass (B7, O5).

## What's in the vault

Six fixed areas the organiser can never add to: **Journal · Tasks · Mynd · Work · Personal ·
Inbox**. At the last check: 5 notes, 9 open Quick Calls, 7 captures filed, 15 skipped.

Total AI spend since the start: about **$0.33**.

## What code guarantees (not the AI)

- **Nothing is lost.** Every part of a capture reaches some item; every item is filed or queued.
  Asserted, not hoped for.
- **Nothing is invented.** Split output is verbatim quotes from the capture, and any number the
  organiser writes must be one you said.
- **The vault is never half-written.** One transaction per run; a failure writes nothing.
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
- A capture that makes a model call fail stops the whole run (P5). Acceptable while runs are started
  by hand; 3c has to handle it, because nobody will be watching.

## Commands

```
npm run dev                     the app locally (-- -H 0.0.0.0 to reach it from the phone)
npm run organize -- --dry       plan the filing, write nothing (a few cents)
npm run organize -- --apply <run file>    write exactly that reviewed plan ($0)
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
