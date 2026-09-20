# STATE.md — where Mynd stands

The 30-second version. Rewritten at the end of each session. `DECISIONS.md` is the full
history (100+ dated entries); this page is just the picture.

**Last updated:** 2026-09-20, after slice 3b.2.

---

## What works today

| Path | Status |
|---|---|
| **1. Capture** — dictate a thought, it saves | ✅ works, on phone and laptop |
| **2. Organise** — files each thought into the vault | ✅ works, run by hand from the terminal |
| **3. View & Ask** — browse the vault, ask it questions | ❌ not built (slice 4 and 5) |

There are **no screens for the vault yet.** `npm run vault:print` is the only way to see it.

## Slices

Done: **1** schema · **2** capture · **3a** model layer, spend guard, split · **3a.1** split by
topic, with code proving no loss and no invention · **3b** route and write · **3b.1** apply the
reviewed plan · **3b.2** no invented numbers, Tasks area, thinking while routing.

Next: **3c** cron → **4** vault and note screens → **5** ask → **6** Quick Calls and the learning
loop → **7** grader.

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
- **Notes are only ever appended to**, never rewritten.
- **The organiser cannot create folders.** The capability does not exist on its path.
- **Nothing ever deletes a capture.** There is no DELETE statement anywhere in the repo.
- **Spending is capped** per call, per run, and per day, and fails closed if a limit is missing.

Still on the AI's honour: not inventing *words* when writing note text. Slice 7's grader measures
that.

## Known issues, waiting on later slices

- One line ("Two prompts instead of one in the organizer") is filed in the wrong note. Fixable by
  hand once slice 4 adds note editing.
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
