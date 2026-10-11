# docs/slice-7-2-spec.md — Slice 7.2: the tidy pass (the AI improves notes, never deletes)

Written 2026-10-11. **Current slice.** Branch: `slice-7-2-tidy`. A push to `main` deploys; merge only
after the verification at the bottom passes. Read `AGENTS.md`, `ARCHITECTURE.md`, and the 2026-10-11
entries in `docs/DECISIONS.md` (TP1–TP4, OG8) first.

**Why:** slice 7.1 made *new* thoughts land well. Existing notes still only accrete: 8 scattered
Huberman notes, two `things to do` notes, duplicates in lists, nothing highlighted (RC2). Sahil's call
(TP1): the AI may reorganise, reorder, merge and highlight existing notes — **but nothing is ever
deleted, every previous version is kept, and code rejects any rewrite that loses content.** This is
the last build before real users.

---

## F0 — Number words verify their digits (OG8)

`lib/organizer/numbers.ts`: when collecting the numbers a source *said*, also count number words —
`zero`…`twenty`, `thirty`…`ninety` by tens, `hundred`, and ordinals `first`…`tenth` — as their digits
(case-insensitive, whole words). "Chapter two" then verifies a written "2". Never the reverse
direction, no arithmetic ("twenty five" verifies 20 and 5, not 25). Add cases to the existing
numbers checks.

## F1 — Schema: archive and versions (`lib/db/schema.sql`, all `IF NOT EXISTS`)

- `notes.archived_at timestamptz NULL`, `notes.archived_into uuid NULL REFERENCES notes(id)`.
- `note_versions (id uuid pk, note_id uuid NOT NULL REFERENCES notes(id), title text NOT NULL,
  summary text, body text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  with an index on `(note_id, created_at DESC)`. `reason` ∈ `tidy`, `merge`, `restore`.
- `organize_runs`: `notes_tidied`, `notes_merged`, `tidy_rejected` (integers, default 0).
- **Nothing in the repo deletes from `notes` or `note_versions`.** (The existing no-DELETE guarantee
  extends to both.)
- **Every read path excludes archived notes**: vault listing, folder pages, home counts, To do, Ask's
  context, and routing input. One shared condition in `lib/db/queries.ts`, not repeated SQL.
- `GET /api/note/[id]` still returns an archived note (with `archivedAt`, `archivedInto`).

## F2 — Stage 4: tidy (`lib/organizer/stage4-tidy.ts`, `lib/prompts/tidy.ts`)

**When:** at the end of every organise run, *after* Stage 3's transaction has committed — so a tidy
failure can never undo filing. Also `npm run tidy -- [--all] [--dry] [--folder <slug>]` for a manual
pass (the first full pass over Sahil's vault).

**Scope per run:** the notes Stage 3 created or inserted into, plus, for each, the other non-archived
notes in the same folder as **merge candidates** (title + summary only, unless chosen). Cap at
`TIDY_MAX_NOTES` (env, default 8) notes rewritten per run; the rest wait for the next run. `--all`
walks every folder, one model call per folder, same cap per call. The spend guard in `lib/model`
applies unchanged; a refused call ends tidy for that run and is recorded (J6), filing stands.

**Model output** (one call per folder; schema-validated):
`{ operations: [{ note: <ref>, absorbs: [<ref>…], title, summary, body }] }` — rewrite `note`, folding in
the full content of every `absorbs` note. An empty `operations` list is valid and common.

**What the prompt asks for** (house style from R2 still applies):
- Merge notes that are the same source or the same topic (e.g. the 8 Huberman notes into
  "Andrew Huberman podcast"; two `things to do`). Never merge two different themes.
- Order sections sensibly: chapters in numeric order; lists grouped by kind; the most important at top.
- Bold the key line or two in each section (the Distill step) — sparingly.
- Remove exact duplicate list entries with the same tick state; keep everything else.
- Keep the user's words; reword only for clarity; never add a fact, date, name, number or step.
- Keep the summary one line and current. Title stays a noun phrase.

**Code guarantees — any failure rejects that operation only; nothing is written for it:**
- **G1 content:** every sentence of the old body **and of every absorbed body** must be represented in
  the new title + summary + body. Reuse `hasDroppedContent` with stricter thresholds for rewriting
  curated text: **coverage ≥ 0.85 and no 2 consecutive unrepresented sentences** (parameterise the
  function; filing keeps 0.6 / 3).
- **G2 tasks:** the set of checkbox lines — normalised text + ticked/unticked — across old + absorbed
  bodies must equal the set in the new body (exact duplicates may collapse to one).
- **G3 numbers:** no digit run in the new text that is absent from old + absorbed text (`numbers.ts`).
- **G4 versions first:** in one transaction, lock every involved note `FOR UPDATE`; if any note's
  `updated_at` differs from what tidy read (the user edited meanwhile, UI3), skip the operation; else
  insert a `note_versions` row for the target (`tidy`) and each absorbed note (`merge`), update the
  target, set absorbed notes' `archived_at = now()` and `archived_into = target`, and copy their
  `note_sources` rows to the target.
- **G5 never delete:** archived notes keep their body; nothing is removed.
- Counts go into the run record and `printPlan`; `--dry` prints each operation with its guard result
  and writes nothing.

## F3 — See and undo (`app/note/[id]/page.tsx`, API under `app/api/note/[id]/`)

- If the note's newest version is a `tidy` or `merge` within 7 days, show under the title:
  `Tidied 2 hours ago · Previous version` (muted text, plain link).
- `Previous version` opens the stored version read-only (same `NoteBody` rendering) with a
  **Restore this version** button. Restore = in one transaction, save the current note as a `restore`
  version, then write the old title/summary/body back (same `updatedAt` conflict check as edits).
- An archived note shows a banner: `Merged into <title>` (link) and **Restore as its own note**, which
  clears `archived_at`/`archived_into` (saving a `restore` version). Content already merged stays in the
  target — nothing is removed from it.
- Every non-archived note gets a quiet **Archive** link at the bottom: hides it from folders, To do,
  Ask and routing; it stays reachable by URL with the same banner (`Archived` + **Restore**). This is
  the user's only way to remove a note, and it removes nothing (GTM13).
- No other screen changes.

---

## Out

Organiser-created folders · moving notes between folders · tidying journal day-notes (Journal is
excluded from tidy) · an AI daily to-do digest · a version-history browser beyond "previous version"
· any styling changes.

## Verification

Automated (offline, no model, no live database):
- numbers: "chapter two" verifies 2; "twenty five" verifies 20 and 5, not 25.
- tidy guards: a faithful reorder passes; dropping a section fails G1; dropping or un-ticking a
  checkbox fails G2; a new number fails G3; a merge archives the absorbed note, versions both, copies
  sources; a concurrent user edit skips the operation; no archived note appears in vault/folder/To do/
  Ask/routing queries.
- `typecheck`, `lint` (ignore `.runs/**`), `build`.

Manual (Sahil, with this terminal):
1. `npm run db:migrate` against the live database (additive columns/table).
2. Archive the 8 old Huberman notes in Personal by hand (their content is already in the Learning
   note; cross-folder merges are out of this slice).
3. `npm run tidy -- --all --dry` on the real vault — read the plan: the two `things to do` merge,
   lists lose exact duplicates, sections are ordered and key lines bolded; nothing fails a guard
   silently.
4. If the plan is right: `npm run tidy -- --all`. Open the merged notes on the phone: content complete,
   "Tidied … · Previous version" shows, Restore works, archived notes show "Merged into".
5. Dictate two captures that touch an existing note; after the next organise, that note is tidied.
