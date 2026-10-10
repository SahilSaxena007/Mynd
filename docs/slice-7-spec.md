# docs/slice-7-spec.md — Slice 7: readable notes

Rewritten 2026-09-30. **Current slice.** Branch: `slice-7-readable-notes` — a push to `main` deploys,
so nothing merges until the verification at the bottom passes. Read `AGENTS.md` and `ARCHITECTURE.md`
first.

**Superseded:** the earlier slice 7 (instant capture + the design pass, commit `4c3287e`) is parked.
Its restyle was built and rejected on 2026-09-28; `docs/design-system.md` is superseded with it. The
baseline is the plain white screens, changed as little as possible (GTM10).

**Why this slice, and only this:** the next step is watching one real person use Mynd for twenty
minutes (GTM11). If notes read as walls of text, they bounce *because of that*, and we learn nothing
about whether auto-organise + Ask land. The bar is **"not embarrassing"**, not "Obsidian". Everything
not listed here is out.

---

## R1 — Notes get sections (the organiser inserts, never rewrites)

Today `appendToNote` (`lib/db/queries.ts`) concatenates onto the end of `notes.body`, so no note has a
single heading (RC1). After this slice, Stage 2 chooses a **note + section**.

- `Placement` in `lib/organizer/route-types.ts` gains `section: string` — the text of a `##` heading,
  or `""` for no section. Add it to `routeSchema` (required) and to the saved-plan / resolved-plan
  types so `--dry` then `--apply` carries it.
- Stage 3 (`lib/organizer/stage3-apply.ts`), for an existing note:
  - If the body has a line exactly `## <section>`, insert the block at the end of that section — i.e.
    immediately before the next line starting `## `, or at the end of the body.
  - If not, add `\n\n## <section>\n` + block at the end of the body.
  - `""` keeps today's behaviour: append at the end.
  - Heading match is exact after trimming; do not fuzzy-match. The prompt is shown the existing
    headings (below), so it can reuse them.
- For a new note, group its filed blocks by section in first-seen order: no-section blocks first, then
  each `## section` followed by its blocks.
- **The guarantee (RN1, amends D1/UI2):** a pure function computes the new body, and code asserts
  that `newBody.slice(0, at) + newBody.slice(at + inserted.length) === oldBody` for the recorded
  insertion point. If the assertion fails, throw — the run's transaction writes nothing. The organiser
  may insert; it may never alter or remove an existing byte.
- The read-modify-write happens inside the existing run transaction. Notes are already row-locked by
  `lockOrganizerTargets`; read the body *after* the lock, not from the pre-run snapshot. Replace the
  concatenating `appendToNote` call in Stage 3 with a new `insertIntoNote(id, section, block)` in
  `lib/db/queries.ts` (SQL stays in `lib/db/`).
- Resolving a Quick Call keeps its plain end-append (`resolveQuickCall` in `queries.ts`). No change.
- Routing input already carries each existing note's full body (`lib/organizer/refs.ts`), so the
  headings are visible to Stage 2; R2 tells it to target an existing heading rather than invent a
  near-duplicate. No input change needed.

## R2 — House style in the route prompt (`lib/prompts/route.ts`)

One block of rules, written once:

- **Main item, then detail.** A thing (an item to buy, a task, a book, a person) is a list item or a
  checkbox. What was said *about* it is a nested sub-bullet beneath it (two-space indent), never a
  sibling line. (RC7a, within one placement.)
- **Sections name kinds of thing**, short noun phrases: `## To buy`, `## Ideas`, `## Open questions`.
  Reuse an existing heading from the routing input rather than inventing a close variant. A note with
  a single topic may use no section at all.
- **Titles are noun phrases**, not sentences: `Shopping list`, `Book ideas`, `Meeting with Priya`.
  (A6.)
- **One consistent list format**: no blank lines between items of the same list. (A3.)
- The verbatim and no-new-numbers rules are unchanged and still outrank style.

## R3 — No note is born without a summary

- `assertResolvedPlan` (or Stage 2 resolution, whichever sees it first) rejects a new note whose
  `summary` is empty after trimming. The plan fails the way an unverified number does — no partial
  write. This is the direct cause of the two `things to do` notes (A1, RC3).
- The note page shows `summary` beneath the title, in muted text. Display only.

## R4 — The note page and the home page become readable (still plain white)

Only `app/note/[id]/page.tsx`, `components/NoteBody`, and `app/page.tsx`. No other screen.

- Default system font stack; body ~17px, line-height 1.6; content max-width ~680px, centred, 16px
  side gutter on phones.
- Clear heading sizes for `##`/`###` with space above; modest spacing between list items; nested
  sub-bullets visibly indented.
- One accent colour, used for links and checkboxes only. White background. No dark mode, no tokens
  file, no animation.
- The Edit mode stays the existing Markdown textarea, given the same width and font.

## R5 — The debug line leaves the home screen

`app/page.tsx` currently prints counts, cost and failure text. Replace it with plain words:

- `Last organised 2 hours ago` (relative time), or `Not organised yet.`
- On failure: `Organising didn't finish — your thoughts are safe and will be filed next run.`
- No counts, no cost, no ids, no error strings. They stay in the run records and the CLI.

## R6 — A tester's vault is seeded with their own folders

For the watched session, each tester gets their own deployment (GTM12). Their folders are written by
Sahil from a five-minute chat.

- `lib/db/seed.ts`: when `SEED_FOLDERS_FILE` is set, read that JSON file — an array of
  `{ name, slug, color, description }` — validate every field (non-empty strings, slug
  `^[a-z0-9-]+$`, colour `#rrggbb`, unique slugs) and seed those **plus** `Inbox` and `Journal` with
  the existing `INBOX_DESC` / `JOURNAL_DESC` (skip either if the file already defines that slug).
  Invalid file → throw before writing anything. Unset → `SEED_FOLDERS` exactly as today.
- Add `testers/` to `.gitignore` (the files describe a real person's life) and commit one
  `testers/example.json` via `git add -f` as the template.
- Add `SEED_FOLDERS_FILE` (commented) to `.env.example`.

---

## Out of this slice, explicitly

Instant capture and manifest changes (old S7-1) · share target and links · the archive feature (the
principle is recorded, GTM13) · restructuring the existing notes in Sahil's vault · the eval set ·
links between notes · dates on entries · a rich-text editor · any screen other than note and home ·
accounts (slice 8).

## Verification

Automated (no model calls, no live database):
- `npm run organize:check` gains cases for: insert into an existing section (lands before the next
  `##`); insert into the last section; create a missing section; `""` section appends at the end; a
  deliberately corrupted insert fails the byte-preservation assert; a new note with an empty summary
  is rejected; a new note's blocks are grouped by section.
- A seed check: `SEED_FOLDERS_FILE` set → those folders plus Inbox and Journal; an invalid file
  throws; unset → today's six.
- `npm run typecheck`, `npm run lint`, `npm run build`.

Manual (Sahil):
1. `npm run route:preview -- --ids <8–10 real capture ids> --no-notes` — the plan shows sections and
   nested detail. A few cents; writes nothing.
2. On the branch, locally: open a long note — headings visible, sub-bullets indented, checkboxes tick,
   summary under the title. Edit, save, reload: still correct.
3. Home shows "Last organised …" in words, with no cost or counts.
4. Phone width: nothing scrolls sideways.

Then merge to `main`, and set up the first tester (`docs/first-five.md` §0).
