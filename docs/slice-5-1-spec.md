# docs/slice-5-1-spec.md — Slice 5.1: fix the Ask history UI

**Why this exists.** Slice 5 works: the four live tests passed, including the one that matters —
"when is my dentist appointment?" returned **"Not in your notes."** rather than inventing a time, and
the Dingerva answer kept "the 12th" exactly as spoken. Citations link to the right notes and the cost
of each answer is shown. Three presentation problems remain, all in `app/ask/page.tsx`.

**Definition of done:** an answer you just asked appears in full; history rows show one piece of text
that grows in place when tapped; and "not in your notes" results no longer appear in the history list.

Nothing changes in the model call, the prompt, the citation enforcement or the database writes.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-21)

- **A6** — An answer **truncates and expands in place**: one element, two states, never two blocks.
- **A7** — The ask you just made renders **expanded**; on a fresh page load every row is collapsed.
- **A8** — **Unanswered asks are stored but not listed.** The `asks` row is still written (DM13), so
  the record of what the vault could not answer survives; the history list shows answered asks only,
  and an unanswered result appears at ask time as a warning rather than an answer.

---

## 1. The three fixes (all in `app/ask/page.tsx`)

### A6 — one text, two states

Today the collapsed preview and the full answer are separate blocks, so expanding a row shows the
trimmed text *and* the full text, one above the other. Render the answer **once**. Collapsed, it is
clamped to roughly two lines with a trailing `…`; expanded, the same element shows the whole answer.
Citations and cost appear only when expanded, as they do now.

### A7 — the newest answer opens expanded

After a successful ask, that row starts expanded — you asked it a second ago and should not have to
tap to read it. Every other row starts collapsed, and on a fresh page load (or when returning to the
tab) **all** rows are collapsed, including that one. Nothing is remembered across loads.

### A8 — unanswered asks are not listed

`GET /api/asks` returns only asks where `answered` is true. The row is still inserted for every ask,
answered or not — that is DM13's point and it does not change.

When an ask comes back unanswered, show it **above the history**, in the ask area, as a plain warning:

```
  Not in your notes.
  Nothing in your vault answers that.
```

It is not an error and must not be styled as one: a truthful "I don't know" is R5 working, and the UI
should not make it look like a failure. It disappears on the next ask, and never enters the list.

## 2. Verification

**Free:** `npm run typecheck`, `npm run lint`, `npm run build`. `npm run ask:check` must still pass
7/7 — none of this touches the answer path, and if a check breaks, something was changed that
shouldn't have been.

**Live**, about four cents:

1. Ask something answerable → the answer appears **in full**, with its citations and cost, no tap
   needed, and **no duplicated text**.
2. Ask a second answerable question → the new one is expanded, the first is collapsed to about two
   lines ending in `…`.
3. Tap the collapsed one → the same text grows in place; citations and cost appear; **nothing is
   shown twice**.
4. Ask something you have never dictated → the warning appears above the history, and **no new row
   joins the list**.
5. Reload the page → every row is collapsed, and the unanswered question is still absent from the
   list.
6. Confirm the row was still written: `npm run vault:print` (or a direct count of `asks`) shows one
   more row than the list displays.

## 3. Out of scope

Deleting ask history (nothing in Mynd deletes), searching or filtering it, follow-up questions with
conversation memory, any change to the prompt, the citation rules or the model configuration.

Next: slice 6 (Quick Calls and the learning loop).
