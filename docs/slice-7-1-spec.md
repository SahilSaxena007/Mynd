# docs/slice-7-1-spec.md — Slice 7.1: the organiser stops fragmenting, and a to-do view

Written 2026-10-10. **Current slice.** Branch: `slice-7-1-organiser-fixes`. A push to `main` deploys;
merge only after the verification at the bottom passes. Read `AGENTS.md`, `ARCHITECTURE.md`, and the
2026-10-10 entries in `docs/DECISIONS.md` (RC8–RC10, OG1–OG5, TD1) first.

**Why:** Sahil's real use shows the organiser *fragments*. Six captures of one podcast landed in eight
notes titled by subject; their chapter headings became empty Quick Calls; one pasted explainer about
throttling became ten Quick Calls; a task's deliberation was split from the task. 8 of 16 open Quick
Calls were leftover fragments. A stranger would read this as "it doesn't work" (GTM14's bar). None of
the fixes loosens a guarantee: nothing is lost, no existing byte is rewritten, nothing is invented.

Repro set (Sahil's real captures, used for verification):
- Huberman: `33a8d218-2d34-499d-bc0b-bb11f4bea9e6` `58baeebd-4683-4ac6-af39-b5d26d8e8c0d`
  `d6968a2a-bedb-4617-b984-32f1e9516c19` `91b3b99a-b941-434c-9c32-8158170225c2`
  `fe7dbf9b-b655-43ec-90f9-c09f3ddc21cf` `d5bf09ce-9644-4397-be6b-c127ff2b3559`
  `09176137-b422-46ba-ba14-c5e791d251a5`
- Throttling: `7c174e2a-805b-41cb-b848-b6ec08bcc6d2` `b7a2b844-4d20-4d04-8b10-cde8310d1670`
- Task with deliberation: `dec29237-8689-4a42-b48d-f2571064198e`
- Residue fragments: `1946e6fd-fd8e-48fd-abfc-05fe3e46b372`

---

## F1 — Leftover text always joins a neighbour (code; RC8)

`completeSplit` in `lib/organizer/split-coverage.ts` today makes an `unassigned` item from any unclaimed
segment that sits between two *different* items. That is where "Chapter 3 of andrew huberman:",
"? Now I know what to speak to him about." and "**Bucket4j**" came from.

New rule, applied where `neighbours.size > 1` (the single-home case is unchanged):
- If the unclaimed text, trimmed, **looks like a heading** — ends with `:`, is a Markdown heading
  (`# …`), or is a line that is entirely bold (`**…**`) — it joins the **following** item.
- Otherwise it joins the **preceding** item (it is a continuation: leading `?`, `.`, a trailing
  remark).
- Count each in `absorbedSpans` as `headingToNext` / `toPrevious`.
- An `unassigned` item is now produced only when a capture has no model items at all.

Quotes stay exact character ranges of the capture, so the verbatim and coverage guarantees are
unchanged; this only decides *which* item owns a span the model failed to claim.

## F2 — A source or a document stays whole (split prompt; RC8)

Add to `lib/prompts/split.ts`:
- When a capture names its **source** — a podcast, book, course, video, talk, article, or a person
  being learned from, often with "chapter", "episode", "part" — or is **one structured document** (a
  title line followed by headings, bullets or code), it is **one item**, whatever subjects it covers.
  Its topic label names the source: `andrew huberman podcast`, `throttling`.
- **Deliberation stays with its task:** doubts, reasons, and "should I…" about a task belong in that
  task's item, not a separate one.

## F3 — One note per source, one section per chapter (route prompt; RC9)

Add to `lib/prompts/route.ts`:
- An item that names a source goes to **one note per source**, titled by the source
  (`Andrew Huberman podcast`), in the folder whose description covers it (Learning, F4). Later items
  about the same source append to that note — match on the source name in titles and labels, not on
  the subject matter.
- Inside it, **one section per chapter or part, using the user's own heading** (`Chapter 3`,
  `Chapter 4: Yoga Mudra and Sleep`). A second capture about a chapter that already has a section
  targets that section.
- A structured document (a pasted explainer) is one note; its own headings become sections.
- A task with deliberation is a checkbox with the deliberation as nested sub-bullets (R2's main-item
  rule, applied to tasks).
- **Sure vs unsure (replaces "a connection you had to infer is unsure"):** use *sure* when the item's
  own words, or a clearly matching existing note or folder description, show where it goes. Use
  *unsure* only when two destinations are genuinely plausible or nothing fits. Never ask about a
  heading, a fragment, or a continuation.

## F4 — A Learning folder (OG1)

Add to `SEED_FOLDERS` in `lib/db/seed.ts`, after Personal:
`{ name: "Learning", slug: "learning", color: "#a07a9c", description: "Notes from podcasts, books,
courses, videos, articles and technical explainers. GROUPING: one note per source, titled by the
source (e.g. 'Andrew Huberman podcast', 'Throttling'); each chapter, episode or subtopic is a ##
section using the user's own heading; later notes on the same source join that note." }`

Re-running `npm run db:seed` on the live database adds it; existing folders are untouched
(`ON CONFLICT DO NOTHING`). Per-tester files (R6) may include it; document that in
`testers/example.json` by adding it as a second entry.

## F5 — Quick Calls say what they are about, and suggest a real rule (RC6, OG3)

- Each **unsure** placement from Stage 2 gains `subject`: 4–10 words naming *what the item is*, from its
  content (`notes from the Andrew Huberman podcast`, `a Java rate-limiting explainer`). Empty for sure
  placements. Add it to `routeSchema`, `Placement`, and the queued Quick Call.
- `quick_calls` gains `subject text NOT NULL DEFAULT ''` (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` in
  `lib/db/schema.sql`). **Migrations do not run on deploy**: the verification below includes running
  `npm run db:migrate` against the live database before merging.
- `components/QuickCallCard.tsx`: after filing, the suggested rule is
  `${subject} go in ${destination}.` — no suggestion at all when `subject` is empty, the topic is
  `unassigned`, or the reason is `not_placed`. The textarea stays editable (Q2).
- Option labels say what kind of destination they are: **`New note: <title> (in <Folder>)`** for a new
  note, **`Add to: <title> (in <Folder>)`** for an existing one.

## F6 — Home cards go back to how they were

`app/page.tsx`: restore the folder cards exactly as before slice 7 — the coloured top border
(`borderTop: 12px solid folderColor(folder)`, re-import `folderColor`) and `color: "inherit"` so folder
names are not blue underlined links. Keep slice 7's "Last organised … ago" line, the max width, and the
`min(140px, 100%)` grid fix. The note page keeps its slice 7 styling.

## F7 — The to-do view (TD1)

- `app/page.tsx`: under the folders, beside the Quick Calls link, `To do (N)` where N counts unticked
  checkbox lines across all notes. It links to `/todo`. Hidden when N is 0.
- `app/todo/page.tsx`: every unticked `- [ ]` line from every note, grouped under its note title
  (linking to the note) and folder, in folder order then note order. Each has a checkbox; ticking it
  saves the note through the existing `PATCH /api/note/[id]` with `toggleTaskLine` and the
  `updatedAt` conflict check (UI3). On a 409, reload the list and say "This note changed; refreshed."
- Nested sub-bullets under a task are shown beneath it, read-only.
- Unticked detection must match `NoteBody`'s own checkbox parsing — reuse it rather than a second
  regex. No model call, no new SQL beyond what the vault endpoint already returns; if bodies are not
  in the vault payload, add one read-only query in `lib/db/queries.ts`.

---

## Out

The tidy pass (proposals to merge or restructure existing notes — RC2, the Karpathy direction) ·
organiser-created folders · the AI daily to-do digest · archive · any other screen's styling ·
rephrasing existing notes.

## Verification

Automated (offline):
- `npm run split:check` gains cases: a heading line between two items joins the next; a `?`-led
  remainder joins the previous; a bold-only line joins the next; a capture with no model items still
  yields one `unassigned` item; every case keeps full coverage.
- `npm run organize:check`: `subject` round-trips into Quick Calls; no rule suggestion when `subject`
  is empty or topic is `unassigned`.
- A to-do extraction check: a body with ticked, unticked and nested lines yields exactly the unticked
  top-level and nested tasks once each.
- `npm run typecheck`, `npm run lint`, `npm run build`.

Manual (Sahil), in this order:
1. `npm run db:migrate` then `npm run db:seed` against the live database (adds the column and Learning;
   both idempotent). `npm run vault:print` shows Learning.
2. `npm run route:preview -- --ids <the 7 Huberman ids>` — expect **one** item per capture, all routed
   to one `Andrew Huberman podcast` note in Learning with chapter sections, and **zero** unassigned
   items. Writes nothing; a few cents.
3. Same for the two throttling ids (expect one note in Learning, few or no unsure), the Ayush id
   (expect checkboxes with the Manchester deliberation nested beneath), and the Dingbra id (expect no
   fragment).
4. Locally on the branch: home shows coloured folder stripes and `To do (N)`; ticking a task on `/todo`
   ticks it in its note; a Quick Call shows `New note:` / `Add to:` and a content-specific rule.

---

## Round 2 (2026-10-10) — found by replaying the repro set on e822b70

Result of round 1: Huberman became **one** note in Learning with chapter sections, zero Quick Calls;
throttling became **one** note with both documents intact; the Dingbra fragment is gone. But:

- **Content was dropped (must fix).** Capture `33a8d218…` (Chapters 1 *and* 2 *and* "The real
  question…") was one item with one `section`, and the written markdown contained **only Chapter 1**.
  Capture `d6968a2a…` (Chapter 2 *and* Chapter 3) lost its Chapter 3 lines. A placement has one section,
  so a multi-chapter item cannot be expressed, and nothing in code checks that the written text still
  contains the item.
- **A task became journal prose.** In `dec29237…`, "I need to call Ayush" plus the Manchester
  deliberation went to a new Journal note as a paragraph; only "message brother's friend" became a
  checkbox.
- (Not a bug: replaying `1946e6fd…` wrote only its last sentence because the existing Dingbra note
  already holds the rest — correct de-duplication against the target note.)

### F8 — A source capture splits at the user's own chapter headings (split prompt; amends OG2)
Replace F2's "one item whatever it covers" for sources with: a capture about a named source splits
**only at the user's own chapter / part / episode headings**, one item per heading, **every item
carrying the same source label** (`andrew huberman podcast`). Never split it by subject. Text before
the first heading (a title line like "Andrew Huberman Podcast Notes:") joins the first item; trailing
remarks ("The real question: …") join the last. A structured document with no chapter headings stays
one item, as in F2. Route then gives each item its own `section`.

### F9 — Dropped-content guard (code; OG7)
After Stage 2 and before Stage 3, for every *sure* placement compare the item to the markdown:
- Split the item text into lines/sentences (reuse `split-coverage`'s sentence segmentation). For each,
  take its words of 3+ letters, lowercased, markdown and punctuation stripped.
- A sentence is **represented** if ≥ 70% of those words appear in the placement's markdown, **or** the
  sentence already appears (same normalisation) in the target note's current body (legitimate
  de-duplication, as with Dingbra).
- If any sentence is unrepresented, code **replaces the markdown with the item's own text, verbatim**
  (its quotes joined as captured), keeping the chosen note and section. Never queue; never drop.
- Count it in the run record as `contentFallbacks` and print it in `printPlan`.
- Offline cases in `organize:check`: a faithful rephrase passes; a markdown missing one sentence falls
  back to verbatim; a sentence already in the target body passes.

### F10 — "I need to…" is a task, deliberation and all (route prompt)
Add: an item whose own words say the user needs to do something ("I need to call Ayush") is a task:
it goes to the Tasks folder as a checkbox, and any deliberation ("not sure if I should go…") is nested
sub-bullets beneath it. Journal is for reflections with no action in them.

### Round 2 verification
Re-run the two previews from the bottom of this spec (Huberman with `--no-notes`; the other four).
Expect: every Huberman chapter's bullets present, Chapter 2 and Chapter 3 each one section holding
both captures' bullets, "The real question…" present; `contentFallbacks` 0 or small and listed; the
Ayush capture as Tasks checkboxes with the Manchester deliberation nested.
