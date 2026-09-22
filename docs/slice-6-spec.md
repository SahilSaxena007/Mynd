# docs/slice-6-spec.md — Slice 6: Quick Calls and the learning loop

**Goal of this slice:** answer the questions the organiser wasn't sure about, and have your answers
change what it does next time.

**Definition of done:** the 12 open Quick Calls can be cleared — each one filed where you say or
dismissed as noise; a rule in your words is saved from a resolution; that rule appears in the next
organise run's routing input; and a rule can be turned off again.

This is the last v1 slice, and the one CP2 rests on. Everything before it made the organiser *work*;
this makes it *learn*.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-22)

- **Q1** — Resolving **appends your text verbatim** into the note you chose. No model call, no cost,
  instant. Tidy the wording later in the note's Edit mode if you want to.
- **Q2** — After filing, a **pre-filled, editable rule sentence** appears. Accept it, reword it, or
  clear it to skip. Keeps DM5's "in the user's own words" without forcing typing on a phone.
- **Q3** — **Dismissing files nothing and creates no rule.** A deliberate, recorded exception to
  "every item is filed or queued" (R1) — safe only because the capture is immutable, so the words
  still exist and the dismissal is recorded.
- **Q4** — **A rule can be turned off.** Not in the spec's original shape, added because rules are read
  on every future run: a wrong rule with no off switch would quietly steer every organise run forever.
- **J6** — Guard refusals are written into the run record, not only the logs (carried from E8).

---

## 1. Files

```
app/quick-calls/page.tsx        # NEW: the queue, and the rules you have taught it
app/api/quick-calls/route.ts    # NEW: GET open calls, with folder and note names resolved
app/api/quick-calls/[id]/route.ts  # NEW: POST resolve — file or dismiss
app/api/rules/route.ts          # NEW: GET active rules · POST create · PATCH turn one off
app/page.tsx                    # MODIFY: the "N items need a decision" line becomes a link
lib/db/queries.ts               # MODIFY: + see §2
lib/db/types.ts                 # MODIFY: + QuickCallResolution
lib/organizer/run-record.ts     # MODIFY: J6 — keep a guard refusal's own message
scripts/quick-calls-check.ts    # NEW: free checks, zero model calls
package.json                    # MODIFY: + "quick-calls:check"
```

**No model calls anywhere in this slice.** Resolving is pure code. No schema change either — every
column needed already exists.

## 2. New query contracts (all SQL stays in `lib/db/`)

```
getOpenQuickCalls()                  -> QuickCall[]        // oldest first
resolveQuickCall(id, resolution)     -> { ok } | { ok: false, reason: "gone" | "conflict" }
listActiveRules()                    -> Rule[]             // exists
createRule({ kind, instruction })    -> Rule               // exists
setRuleActive(id, active)            -> boolean
```

`resolveQuickCall` runs in **one transaction** (R2):

1. `SELECT … FOR UPDATE` the quick call; if it is missing → `gone`; if its status is not `open` →
   `conflict` (you resolved it on another device).
2. **File:** append `item_text` **verbatim** to the chosen note with `appendToNote` — the safe append
   (D1) — creating the note first when the choice was a new note in an existing folder. Then
   `linkNoteToCapture(noteId, captureId)` so provenance survives (DM4).
3. **Dismiss:** write nothing.
4. Set the row's status to `resolved` or `dismissed` and stamp `resolved_at`.

The item text is appended exactly as the user said it — this slice adds no wording of its own. For a
checklist note, prefix `- [ ] ` so it joins the list as a tickable item (P13); otherwise append as its
own line. That prefix is the only formatting code applies.

**The organiser still cannot create folders (F1).** Nothing in this slice calls `createFolder` either
— see §5.

## 3. The screen (`app/quick-calls/page.tsx`)

A client component fetching with the token (SEC3), reached from the vault home's count line.

```
  12 need a decision

  ┌──────────────────────────────────────────┐
  │ "face creams"                            │
  │ not sure where this goes                 │
  │                                          │
  │ [ Personal · things to buy ]             │
  │ [ Personal · new note "beauty" ]         │
  │ [ Somewhere else ▾ ]      [ Dismiss ]    │
  └──────────────────────────────────────────┘
```

- Each card: the item text, **why it is here in plain English**, and its stored options as buttons.
  Reasons map to: `unsure` → "not sure where this goes"; `added_detail` → "the organiser wrote a
  number you never said"; `invalid_target` → "it aimed at a note that doesn't exist"; `not_placed` →
  "the organiser didn't place it".
- **Somewhere else** lets you pick any existing folder, and either an existing note in it or a new
  note title.
- **Dismiss** removes it with no filing and no rule (Q3).
- After filing, the card is replaced in place by the rule step (Q2):

```
  Filed to Personal · things to buy ✓

  Rule for next time (edit, or clear to skip):
  ┌──────────────────────────────────────────┐
  │ Shopping items go in Personal /          │
  │ things to buy                            │
  └──────────────────────────────────────────┘
       [ Save rule ]    [ Skip ]
```

  The sentence is composed by the page from the item's topic and the destination you chose. It is a
  starting point, not the rule — whatever is in the box when you press Save is what gets stored, and
  Skip stores nothing.
- Under the queue: **"Rules you've taught it"** — each active rule with an off switch (Q4). Turning
  one off sets `active = false`; nothing is deleted, and it stops being read next run.
- Every action is honest about failure (CAP2): if a resolve fails, the card stays exactly as it was
  with the error shown. A `conflict` says the item was already handled and refreshes the list.

## 4. J6 — say which limit tripped

`runError()` currently collapses every non-provider failure to `"<stage> failed."`. Keep a
guard refusal's own message instead, so the run record reads
`route failed: Model call refused: MAX_TOKENS_PER_CALL exceeded.`

Only guard refusals — messages the project itself composes, naming a limit and nothing of the user's.
Every other non-provider error keeps today's bare `"<stage> failed."`, because an arbitrary error
message could carry capture text.

## 5. Deliberately not in this slice

**Creating a folder from a Quick Call.** F1 promised that new folders would arrive only through a
Quick Call you approve, and that path is still unbuilt — so the six areas stay fixed for now. It needs
a name *and* a description carrying the folder's grouping rule (DM2), which is a real piece of UI for
something none of the current 12 items needs. Recorded as a known gap, not forgotten.

Also out: re-running the organiser after a resolution, bulk-resolving, editing a rule's text after
saving (turn it off and write a new one), the grader (slice 7).

## 6. Verification

**Free.** `npm run quick-calls:check` — no model calls:

1. Filing appends the item text **verbatim** to the chosen note and links the note to its capture.
2. Filing into a checklist note prefixes `- [ ] `; filing elsewhere does not.
3. Filing into a new note creates it in the chosen folder, with no folder ever created.
4. Dismissing writes nothing to notes and creates no rule; the row becomes `dismissed`.
5. Resolving an already-resolved call returns `conflict` and changes nothing.
6. A rule is created with the exact text submitted; an empty rule creates nothing.
7. `setRuleActive(id,false)` hides it from `listActiveRules` and deletes nothing.
8. A guard refusal's message survives into the run record; other errors stay bare (J6).
9. `grep` finds no `createFolder` in the resolve path.

**Then live.** Free apart from step 4:

1. Clear the junk: dismiss the scrap Quick Calls ("Right,", ", but") — queue shrinks, vault unchanged.
2. Resolve a real one — say "face creams" into Personal · things to buy. Open the note: your words are
   there, as a checkbox item.
3. Save the pre-filled rule. It appears under "Rules you've taught it".
4. **The loop, proven:** `npm run organize -- --dry` and confirm the rule text appears in the Stage 2
   input (the run JSON in `.runs/` records it). A rule that never reaches the prompt has taught
   nothing.
5. Turn the rule off, re-run `--dry`, confirm it is gone from the input. Turn it back on.
6. Resolve one on your phone while the page is open on the laptop — the laptop reports it was already
   handled rather than filing it twice.

## 7. After this

v1 is complete: capture, organise, view, ask, and correct. What remains is slice 7 (the grader,
measurement only) and the banked organiser-quality pass (B7, O5) — which this slice finally gives
real ammunition for, because every resolution is a recorded instance of the organiser getting it
wrong.
