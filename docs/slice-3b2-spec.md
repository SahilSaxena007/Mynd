# docs/slice-3b2-spec.md — Slice 3b.2: no invented numbers, a home for tasks, a little thinking

**Why this exists.** 3b.1 fixed the sentence scraps and most lossy rephrasing: replaying the seven test
captures on Haiku gave a 69% sure rate (up from 40%) with qualifiers and examples kept. It also
surfaced four problems and one failed experiment:

1. **The first observed breach of R3.** "meeting with Dingerva on the 12th" was written as *"Meeting
   scheduled for 2026-09-12"* — a month and year the user never said, and the wrong month (dictated on
   18 September, so almost certainly October). The prompt already forbade adding dates.
2. **Tasks had no home.** "Call mom about Sunday lunch" and "book the dentist for next week" were filed
   `sure` into the Journal, which is for reflections.
3. **Two themes merged into one note** — "organizer prompts **and** user involvement" (R4).
4. **One rambling thought became four Quick Calls**, each proposing its own new note.
5. **Sonnet 5 failed.** It thinks by default, used all 8,000 output tokens without finishing, and cost
   $0.087 per attempt — two attempts, $0.17. S12's estimate of "about a cent more per run" was wrong
   because it ignored default thinking.

**Definition of done:** any number written into the vault is provably one the user said; tasks land
in a Tasks area; routing runs on Haiku with a thinking budget; and replaying the seven captures shows
no invented date, no two-theme note, and mum and the dentist in Tasks.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-19)

Made by the human:
- **P24** — **No new numbers, enforced in code.** Any number in text the organiser writes must appear
  in what the user said. Otherwise the item goes to Quick Calls with reason `added_detail`.
- **F3** — **Tasks is a sixth fixed area.** Amends F1 (the areas are now six) and makes one principled
  exception to F2: whether something is an *action* is the distinction GTD (IA2) is built on, not a
  format.
- **S13** — **Routing runs on Haiku 4.5 with a thinking budget** (default 2,048 tokens). Supersedes S12.

Derived, flagged for review:
- **P25** — On Haiku, thinking and `temperature` are incompatible (per Anthropic's docs). The split keeps
  `temperature: 0` and no thinking; routing thinks and sends no temperature. Amends P20. Run-to-run
  consistency for reviewed runs comes from P23 (`--apply`), not from temperature.
- **P26** — The route prompt keeps relative dates and times exactly as spoken, gives each theme its own
  note, and keeps a continuing thought from one capture together.
- **DM10** — Folder descriptions become editable through `npm run folders:describe`. A user tool;
  the organiser still cannot create or change folders (F1).

---

## 1. Files

```
lib/organizer/numbers.ts        # NEW: pure — find numbers the organiser wrote but the user never said
lib/organizer/coverage.ts       # MODIFY: gate uses numbers.ts; new reason added_detail
lib/model/capabilities.ts       # MODIFY: + thinking mode per model ("budget" | "adaptive" | none)
lib/model/anthropic.ts          # MODIFY: route may think; never send temperature while thinking
lib/prompts/route.ts            # MODIFY: P26
lib/db/seed.ts                  # MODIFY: + Tasks area
lib/db/queries.ts               # MODIFY: + updateFolderDescription(slug, description)
lib/db/types.ts                 # MODIFY: quick-call reason adds 'added_detail'
lib/model/index.ts              # MODIFY: "incomplete" errors name the stop_reason (thrown here)
scripts/folders-describe.ts     # NEW: npm run folders:describe -- <slug> "<description>"
scripts/route-preview.ts        # MODIFY: + --thinking-budget N (0 = off)
scripts/organize-check.ts       # MODIFY: + cases in §7
.env.example                    # MODIFY: + ROUTE_THINKING_BUDGET=2048
package.json                    # MODIFY: + folders:describe
```

Codex must not edit `.env`.

## 2. P24 — no new numbers (`lib/organizer/numbers.ts`, pure)

After Stage 2, before anything is filed, for every placement that would be filed:

1. **Collect the numbers the organiser wrote**: every run of digits (`\d+`) in the placement's
   `markdown`, and — if the placement targets a *new* note — in that note's `title` and `summary`.
2. **Collect the numbers the user said**: every run of digits in the verbatim text of the item. For a
   new note's title and summary, the items filed into that note together.
3. **Normalise both sides** by stripping leading zeros (`09` → `9`, `00` → `0`), so a written `09`
   matches a spoken `9`. Every digit run is checked on its own: `09:00` is two numbers, `9` and `0`,
   and both must have been said. Nothing else is normalised. A number spoken as a word ("twelfth") does not match `12` — that
   is the accepted false alarm, and it errs toward asking the user.
4. **Any written number not among the said numbers fails the check.**
5. **One exemption:** the digits of an item's local date (E6) are allowed in the **title** of a note in
   the `journal` folder, only when that title equals the local date exactly. Code produces that date;
   the model does not.

A failing placement is queued as a Quick Call with `reason: added_detail`, keeping its options. If a
new note's title or summary fails, **every** placement into it is queued and the note is not created.
The plan printout names the unverified numbers so the user can see exactly why.

This makes invented dates, times, amounts, and prices impossible to write, rather than discouraged.
It does not catch invented *words* — that remains the D3 grader's job (slice 7).

## 3. F3 — the Tasks area, and editable descriptions (DM10)

**`seed.ts`** adds, idempotently and never overwriting an edited description:

- **Tasks** — slug `tasks`: *"Things the user has to do: calls, errands, appointments to book, emails,
  follow-ups — including future tasks. GROUPING: one checklist note per area of life — 'personal
  to-dos', 'work to-dos', 'mynd to-dos'. Each task is a checkbox `- [ ] …`. Keep any timing exactly as
  said ('next week', 'on the 12th'); never turn it into a date. Shopping lists are not tasks; they
  belong in Personal."*

**`npm run folders:describe -- <slug> "<description>"`** calls `updateFolderDescription`, prints the
old and new text, and refuses an unknown slug. It can change a description only — it never creates,
renames or moves a folder. This is the DM2 promise made practical: folder behaviour changes by editing
text.

The user will run it for Journal, Personal and Work (exact text in §7), since the seed deliberately
never overwrites a description that already exists.

## 4. S13 + P25 — Haiku thinks while routing

`lib/model/capabilities.ts` gains a thinking mode per model:

```
claude-haiku-4-5  -> { supportsTemperature: true,  thinking: "budget" }
claude-sonnet-5   -> { supportsTemperature: false, thinking: "adaptive" }
```

For the **route** job on a `"budget"` model, when `ROUTE_THINKING_BUDGET` is above zero, send
`thinking: { type: "enabled", budget_tokens: <budget> }` and **do not send `temperature`** — the two
are incompatible on Haiku 4.5, and sending both fails the call.

- `ROUTE_THINKING_BUDGET` defaults to 2,048; `0` turns thinking off (and restores `temperature: 0`).
  Any other value must be at least 1,024 and below the route call's `maxTokens` (8,000) — otherwise
  refuse before any request, fail-closed. The budget is a *target* the model steers by, not a hard cap;
  `max_tokens` is the hard ceiling and still applies.
- The **split** job is unchanged: no thinking, `temperature: 0`.
- Thinking tokens are billed as output and already land in `model_calls.output_tokens`.
- Thinking blocks are ignored when reading the answer; `anthropic.ts` already reads text blocks only.
- `route:preview` gains `--thinking-budget N` for this run only, so thinking-on and thinking-off can be
  compared on the same captures.

Sonnet's adaptive mode is not configured by this slice. Routing on Sonnet stays unsupported until a
later decision sets its effort level.

## 5. P26 — the route prompt

Add to `lib/prompts/route.ts`:

- **Dates and times exactly as spoken.** "On the 12th", "next week", "Sunday" stay as said. Never
  resolve a partial or relative date into a full one — code will reject it anyway (P24).
- **One theme per note.** Never merge two different ideas into one note. If a title would need "and",
  it is two notes.
- **A continuing thought stays together.** Items from the same capture that continue one line of
  thought go to the same note.
- **Actions go to Tasks; reflections go to Journal**, following each folder's description.

## 6. Clearer failures

"Model response incomplete or refused" becomes specific: include the `stop_reason` —
`max_tokens`, `refusal`, and so on. It is operational text, never user content.

The error is thrown in `lib/model/index.ts`, the only place the stop reason is still known — the
organiser only ever sees the error. The `model_calls` row must still be written **before** the throw,
exactly as today (SP5): a truncated or refused response is billed and must be counted.

## 7. Verification

**Free first.** `npm run organize:check` — all existing cases, plus:

1. From "on the 12th", a block reading "2026-09-12" is queued `added_detail`.
2. From "on the 12th", a block reading "the 12th" or "12" is filed.
3. From "at 9", a block reading "at 9" or "09" is filed (leading zero stripped), but a block reading
   "09:00" is queued `added_detail` — its `00` was never said. Times stay exactly as spoken (P26).
4. A Journal note titled with the item's own local date is created; the same digits in a Work note's
   title are caught.
5. A new note whose title contains an unverified number is not created, and all its placements are
   queued.
6. A thinking budget of 500 is refused before any request; with thinking on, the built request carries
   no `temperature`. (Test the request builder as a pure function — no API call.)

And `npm run split:check` still passes unchanged.

**Then set up the folders.** Free.

```
npm run db:seed
npm run folders:describe -- journal "Daily journal: how the day went, feelings, reflections, what happened. Never tasks, errands or plans; those belong in Tasks. GROUPING: one note per calendar day, titled by date (YYYY-MM-DD). Same-day entries append to that day's note."
npm run folders:describe -- personal "Life outside work: things to buy, travel, health, films and books. GROUPING: one note per list or theme (e.g. 'things to buy', 'movies to watch'); lists use checkboxes and new items append to the existing list. Tasks to do go in Tasks, not here."
npm run folders:describe -- work "The day job: meetings, colleagues, projects, access and tooling requests. GROUPING: one note per meeting or ongoing piece of work; follow-ups about the same meeting or person append to that note. Standalone to-dos go in Tasks; anything to raise in a specific meeting stays with that meeting's note."
```

**Then real data — about three cents per replay.** The seven test captures, vault hidden:

```
npm run route:preview -- --ids <the seven> --no-notes
npm run route:preview -- --ids <the seven> --no-notes --thinking-budget 0
```

What good looks like:
- mum and the dentist in **Tasks**, as checkboxes, "next week" kept word for word;
- **no "2026-09-12" in anything filed** — at most a Quick Call with reason `added_detail`;
- no note title containing "and" that joins two themes;
- the cable thought in one Mynd note, or at most one Quick Call rather than four;
- thinking-on no worse than thinking-off, at roughly two cents more per run.

## 8. Out of scope

Sonnet or any second provider for routing (revisit only if Haiku with thinking still misjudges), the
grader (slice 7), moving the misfiled line already in the Work note (slice 4), resolving Quick Calls
(slice 6), the cron (3c).

Next: slice 3c.
