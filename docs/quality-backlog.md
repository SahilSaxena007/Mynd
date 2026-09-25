# docs/quality-backlog.md — organiser quality: observations and root causes

Evidence for the quality pass banked by B7/O5. **Nothing here is scheduled.** It is the list to work
from once v1 is complete, ordered by root cause rather than by symptom, because most of the symptoms
are the same three or four problems wearing different clothes.

Sources: the human's observations on 2026-09-23 (numbered H1–H11 below), plus a full read of the
20-note vault on the same date.

---

## The six root causes

### RC1 — A note is modelled as a string, not as a document with sections

`notes.body` is text and `appendToNote` concatenates. Stage 2 chooses a *note*; it can never choose a
*place within* a note. **All 20 notes contain zero headings.**

Every power-user tool disagrees with this model. In Obsidian and Notion a note is a tree — H2/H3
sections, blocks beneath them — and the unit people append to is the *section*, not the file. That is
what makes a long note navigable instead of a wall.

Covers: **H1** (two to-dos with no context binding them), **H4** (one-item list never becomes a
checklist), **H6** (no sub-headings separating two lists in one area), **H8** (tiny orphan notes), and
my **A3**, **A7**, **A9** below.

*Direction:* Stage 2 targets `note + section`. New content either joins an existing heading or creates
one. The coverage guarantee is unchanged — a section is just a finer address.

### RC2 — Append-only means the vault can only accrete

D1 (safe-append, never rewrite) was the right call for safety and it is why nothing has ever been lost.
But it also means: no consolidation, no splitting, no retitling, no de-duplication, no promoting a line
into its own note. The vault can only grow more cluttered, never tidier.

Covers: **H2** (small Mynd notes that should be one), **H8**, and my **A1**, **A2**, **A5**.

*Direction:* the "tidy pass" deferred to v2 by D1 is no longer optional — at 20 notes it is already
needed. It must be a **proposal** the user approves, not an autonomous rewrite, and the captures stay
immutable so any tidy is reversible in principle.

### RC3 — Append-vs-create is decided on summaries that are often missing

DM3 says the one-line `summary` is what lets Stage 2 decide whether to append to an existing note.
**Five of twenty notes have no summary at all** — both `things to do` notes, `things to read`, and
`meeting with Dingbra`. A note with no summary is close to invisible to the next routing decision,
which guarantees a duplicate.

This is the direct cause of the worst structural failure in the vault (**A1**).

*Direction:* a note is never created without a summary; code rejects the placement if Stage 2 omits it,
the way it already rejects an unverified number (P24).

### RC4 — No model of *type* or *time orientation*

The organiser reads topic, not grammar. "I **have** a meeting with Dingbra" is a future commitment;
"I **had** a meeting" is a record. Same words, different note, different folder, different title.
Likewise "AI-assisted note features" is a list of *intended* features, and nothing in the note says so.

Covers: **H3**, **H7**, and my **A6**.

*Direction:* each item carries a small, closed vocabulary — `intent` (idea / task / event / reference /
reflection) and `time` (past / present / future) — inferred by Stage 1, where the sentence is still
intact. Titles and folder choice then key off those. This is the one item on the list that genuinely
warrants reading: Wurman on LATCH (time is one of his five), and the GTD distinction between an action
and reference material, are both about exactly this.

### RC5 — Quick Calls present choices without comparative evidence

An option list with no ranking and no reasoning makes the user do the comparison the system should
have done. And "create a new note" appearing first implies the item belongs somewhere new, when
usually it belongs in something that already exists.

Covers: **H10**, **H9** (a fragment with no surrounding context is unanswerable), **H11**.

*Direction:* each option carries a likelihood and a one-line reason ("87% — this note already lists
four shopping items"), existing notes are offered before new ones, and the card shows the **surrounding
sentences from the source capture** so a fragment can be judged at all.

### RC6 — The rule suggestion is templated from the label, not the meaning

**H11 has a specific, findable cause.** The suggestion reads
`unassigned goes in Mynd · user involvement in organization.` — "unassigned" is not a topic the model
chose, it is the literal label code assigns to residual text under P7. The template is
`<topic> goes in <folder> · <note>`, so a residual item produces a rule that is grammatically fine and
semantically worthless. Worse, saved as-is it would teach the organiser to file *all* unassigned
fragments into one Mynd note.

*Direction:* no rule is suggested at all when the topic is `unassigned` or the reason is `not_placed`;
and the suggestion is phrased from the item's content and the reason it was queued, not from its label.

---

## The human's observations, mapped

| # | Observation | Root cause |
|---|---|---|
| H1 | Two to-dos with no context saying why they're together or whether they're a list | RC1 |
| H2 | Small Mynd notes that share context should have been one note; completeness and anticipated growth should affect the choice, not just the description | RC2, RC1 |
| H3 | Needs real grammatical/semantic reading — "AI-assisted note features" is actually a *future* update, and nothing says so | RC4 |
| H4 | `things to read` isn't a checklist — possibly because it has one item | RC1 |
| H5 | *Future idea:* a gym plan becomes a daily clickable checklist with a progress meter; public organisation templates | — (v2 feature, recorded below) |
| H6 | Two distinct lists in Personal with no sub-headings to navigate by | RC1 |
| H7 | "meeting with Dingbra" should read as a *future* meeting — the note says "I have", not "I had" | RC4 |
| H8 | Tiny notes like "observations about London tech talent" (36 chars) — unclear what to do with them | RC2, RC1 |
| H9 | A queued fragment with no surrounding context is impossible to place | RC5 |
| H10 | Quick Calls push "create a note" and make comparison hard; want likelihood and reasoning per option | RC5 |
| H11 | The rule suggestion is nonsense and sets the loop up for failure | RC6 |

**What is working, per the human:** movies, books and other clear lists do become tickable checklists.
Confirmed in the vault — `movies to watch` (10 boxes) and `things to buy` (13) are correct.

---

## What the vault shows that the list didn't

**A1 — Two notes in Personal share the title `things to do`.** One holds "Book the dentist for next
week.", the other "Need to call mom about Sunday lunch." Nothing prevents duplicate titles inside a
folder, and both were created without summaries (RC3), so the second run could not see the first. This
is the most damaging item on the page: duplicate titles destroy the user's mental map of where things
live, which is the thing the whole product is selling.

**A2 — Tasks live in two places at once.** `tasks/personal to-dos` has five checkboxes; `personal/things
to do` ×2 hold one line each. F3 created the Tasks area and the folder descriptions were updated, but
**existing notes were never re-filed** — there is no mechanism to move anything, so a description change
only affects new content and the vault keeps a permanent record of every past policy.

**A3 — Formatting is inconsistent within a single note.** `tasks/personal to-dos` has blank lines
between its first three items and none between the last two, because they arrived in separate appends.
In Markdown that can change how the list renders.

**A4 — Duplicate items inside a list.** `things to buy` lists "Dual Switch Mouse" twice, both unticked —
a direct violation of P13's no-duplicate rule — and "Extension cable" twice, once ticked and once not,
which P13 does permit (you needed another) but which reads as an error.

**A5 — Orphaned context.** `things to buy` ends with a bare line `(the extension cable needed is a
4-gang one)` sitting outside the list, attached to nothing. It belongs *to an item*, and the model has
no way to express that.

**A6 — Titles have no consistent grammar.** `movies to watch` (a list), `observations about London tech
talent` (a statement), `teams at Deutsche Bank` (a reference table), `meeting with Dingerva` (an event)
— four different title forms in one vault. On a phone the title list *is* the navigation, and
inconsistent forms make scanning slow.

**A7 — Prose fragments land mid-note and read as broken.** `user involvement in organization` contains
a paragraph beginning `, but the idea of repeatability…`. Grammatically orphaned text inside an
otherwise coherent note is the clearest possible signal to a user that a machine did this badly.

**A8 — Mynd is becoming a dumping ground.** Eight of twenty notes. With folders fixed at six (F1), the
only structure available inside a growing area is notes and headings — and headings are unused (RC1).
This is the pressure that will eventually force either sub-folders or real sectioning.

**A9 — Nothing is dated inside a note.** An appended line carries no timestamp, so you cannot tell when
a thought arrived or which parts of a note are stale. V2-1's lint and digest both need this, and
`note_sources` only records which capture, not where in the body.

**A10 — There are no links between notes.** `routing and note linking`, `lint and weekly log features`
and `user involvement in organization` are all one line of thinking about the same product. Obsidian's
entire value proposition is that they would be linked. X1 deferred this for v1; the vault is already at
the size where its absence is felt.

---

## Psychology, and what power users actually do

Four observations that shape how the above should be prioritised.

**People judge the system by its worst note, not its average.** A 36-character note in its own file
reads as "it didn't understand me", and one of those undoes the good impression of ten correct ones.
Small-orphan handling (RC2) therefore matters more than its frequency suggests.

**Predictability beats accuracy.** A power user will forgive a note filed in the *second*-best place if
it is always the second-best place. Two notes with the same title (A1) is worse than a consistently
wrong folder, because it breaks the rule "one topic, one home" that the user is building their mental
map on. R4 is about the vault's structure; this is about the user's model of it.

**The weekly review is the ritual that keeps a vault alive.** GTD's weekly review, Obsidian's
periodic-note refactor, Zettelkasten's re-linking pass — every serious method has a moment where a
human looks at the whole thing and tidies. V2-1's digest is that ritual, and it is also the natural
home for approving a tidy pass (RC2) and seeing what lint found.

**Capture-time effort and organise-time quality trade against each other.** Mynd deliberately takes
zero effort at capture, which loads all the burden onto the organiser. That is the right trade — it is
the moat — but it means the Quick Calls queue is where the user's attention is actually spent, and
making that queue *comparative* (RC5) rather than open-ended is the highest-leverage UI work left.

---

## Recorded future features

- **H5 — templates and progress.** A gym plan becomes a daily tickable checklist with a progress meter;
  shareable/public organisation templates. Post-v1, alongside V2-1.
- **Sectioned notes** (RC1) is the enabling change for most of the rest and should come first in the
  quality pass.
- **Tidy pass** (RC2) must be proposal-based, never autonomous.
