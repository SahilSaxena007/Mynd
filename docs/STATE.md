# STATE.md — where Mynd stands

The 30-second version. Rewritten at the end of each session. `DECISIONS.md` is the full
history (140+ dated entries); this page is just the picture.

**Last updated:** 2026-09-23. **All three original paths are working, live.** Slice 6 is
implemented locally; live phone/laptop verification is still pending.

**Live URL:** https://mynd-production-c3eb.up.railway.app — phone and laptop, any network, laptop
closed. Installable to the home screen. Railway redeploys on every push to `main`; builds run
`npm install` (E7); no migration runs on deploy.

---

## What works today

| Path | Status |
|---|---|
| **1. Capture** — dictate a thought, it saves | ✅ live, from anywhere |
| **2. Organise** — files each thought into the vault | ✅ live, **by itself**, 07:00 and 19:00 UTC |
| **3. View** — browse and edit the vault | ✅ live: folders → notes → a note, tappable checkboxes, Edit mode |
| **4. Ask** — ask questions of your notes | ✅ live, with citations and a question history |
| **5. Correct** — Quick Calls and rules | Implemented locally: file verbatim, dismiss, save a rule, turn it off |

Nothing needs a terminal any more. Dictate, and it files itself.

## Slices

Done: **1** schema · **2** capture · **3a**/**3a.1** split, proven lossless in code · **3b**/**3b.1**/
**3b.2** route and write · **deploy** · **4** the screens · **3c**/**3c.1** the cron · **5**/**5.1** Ask.

Current: **6** Quick Calls and the learning loop implemented; finish live manual verification.
The nine offline `quick-calls:check` cases pass without model calls or database connections,
including rules reaching routing input and disappearing when disabled. No organiser run was made.
`npm run typecheck`, `npm run lint`, and `npm run build` also pass. `.env` was not edited.
Next after verification: **7** the grader.
Banked until there is a real corpus: the organiser-quality pass (B7, O5).
Post-v1: lint and digest (V2-1).

## Last recorded live counts (2026-09-21; not refreshed during slice 6)

```
notes 11        journal 1 · tasks 1 · mynd 6 · work 1 · personal 2 · inbox 0
captures        16 filed · 6 waiting · 15 skipped
quick calls     12 open   <- slice 6 clears these
asks            6 asked, 4 answered
organise runs   5
spend           $0.473 across 98 model calls, all time
```

## What code guarantees (not the AI)

- **Nothing is lost.** Every part of a capture reaches some item; every item is filed or queued.
  Asserted, not hoped for.
- **Nothing is invented.** Split output is verbatim quotes; any number the organiser writes must be
  one you said; an answer with no valid citation becomes "not in your notes".
- **The vault is never half-written.** One transaction per organise run; a failure writes nothing.
- **Quick Calls resolve once.** A locked open row, verbatim append, provenance and status share
  one transaction. Dismissal records the choice without filing; the immutable capture remains (Q3).
- **Rules can be turned off without removal.** Only active rules reach the next routing input.
- **The organiser only appends to notes.** You may edit them by hand; it may not (UI2).
- **Your edits and the organiser's cannot clobber each other** — saves carry the note's exact
  last-read timestamp, checked under a row lock (UI3).
- **The organiser cannot create folders.** The capability does not exist on its path.
- **Nothing ever deletes a capture.** No DELETE statement anywhere in the repo.
- **Spending is capped** per call, per run and per day, and fails closed if a limit is missing.
- **Asking never writes to the vault** — one `asks` row and one `model_calls` row, nothing else.
- **The vault is never server-rendered.** The URL is public; screens fetch with the token (SEC3),
  verified against the live site.

Still on the AI's honour: not inventing *words* when writing note text. Slice 7's grader measures it.

## Known issues

- One line ("Two prompts instead of one in the organizer") sits in the wrong note. Fixable by hand in
  Edit mode; Ask correctly quotes it because it is genuinely there (O3).
- The last recorded 12 open Quick Calls were left untouched during implementation; clear them
  after deploying and manually checking slice 6. Folder creation from Quick Calls stays deferred (Q5).
- Shopping list has accumulated duplicates across captures ("Dual Switch Mouse listed twice") — the
  O5 repetition problem, now visible in real data.
- Organiser quality is still tuned against 7 test captures. Daily use is the fix (B7).

## Commands

```
npm run organize -- --dry                 plan the filing, write nothing (a few cents)
npm run organize -- --apply <run file>    write exactly that reviewed plan ($0)
npm run organize:cron                     the unattended run (what Railway calls)
npm run route:preview -- --ids <ids> --no-notes    replay captures, never writes
npm run vault:print                       see the vault from the terminal
npm run captures:skip -- <ids>            ignore captures (deletes nothing)
npm run folders:describe -- <slug> "…"    change how a folder behaves
npm run split:check · organize:check · ask:check    free, no AI
npm run quick-calls:check                 nine offline cases, no AI or live database
```

Every command that can spend money reports what it cost.

## How we work

Planning and decisions happen in the Claude Code terminal; **Codex writes the feature code** from a
written slice spec in `docs/`. Nothing lives in chat — read `AGENTS.md`, `ARCHITECTURE.md`,
`docs/DECISIONS.md` and the current slice spec and you are current.

A slice is not done when its automated checks pass; it is done when the manual scenarios pass on the
real device (PR2). Anything that could expose the vault is checked against the live site (B12).
Commands handed to the human are PowerShell, never bash (PR4).
