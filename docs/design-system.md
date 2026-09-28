# docs/design-system.md — how Mynd looks, and the rules that keep it that way

Written 2026-09-28. This is the single source of truth for visual decisions, the same way
`AGENTS.md` is for engineering ones. Codex implements against this file; it does not invent values.

**The bar:** a stranger glancing over Sahil's shoulder on a train thinks *"what is that?"* — and a
person handed the link does not close it in the first ten seconds. Not "beautiful". Not a redesign
every quarter. One coherent system, applied everywhere, then left alone.

**Theme: both, following the system** (decided 2026-09-28). Every colour is a token defined twice.
No theme toggle in the UI — the phone already has one.

---

## The ten principles

These are borrowed, not invented. Where a principle comes from someone, it is named, because knowing
*why* it works is what stops it being reverted next week.

1. **Content is the interface.** (Apple HIG; Rams, "as little design as possible".) The note text *is*
   the product. Chrome recedes: prefer whitespace to a border, a heading to a card, nothing to a box.
   If a container does not change what you understand, delete it.
2. **Type carries the hierarchy — not lines, not boxes.** (Linear, Stripe, Figma all do this.) Three
   sizes and two weights are enough for any screen here. Reach for size and weight before you reach
   for a rule or a background.
3. **One accent, meaning one thing.** `--accent` means *action, or you*. Folder colours are **data**,
   not decoration — they identify a folder and are never used for anything else.
4. **A 4px grid, an 8px rhythm.** Every gap, pad and offset is a multiple of 4, and mostly of 8. This
   single rule removes most of what reads as "vibe-coded", because unsystematic spacing is the tell.
5. **One left edge per screen.** Everything aligns to the same 16px gutter on phone. Nothing is
   indented "a bit" — either it is on the edge or it is one full step in.
6. **One primary action per screen.** On Capture it is Send. On Ask it is Ask. Everything else is
   quiet text. If two things look equally important, neither is.
7. **Motion explains, never decorates.** (Apple HIG.) 150–200ms, ease-out, only on a state change the
   user caused. No entrance animations, no spinners that spin for the sake of it.
8. **Touch targets at least 48px.** (Material 48dp / Apple 44pt — take the larger.) Including list
   rows and checkboxes, which are the things actually tapped here.
9. **Empty states teach; loading states pre-draw.** Every empty screen names the next action in the
   user's words. Every loading screen shows a skeleton in the *shape of the final content* — never a
   blank screen, never the bare word "Loading…".
10. **Accessible by construction, not by audit.** Body text at least 4.5:1 against its background in
    both themes, secondary text 4.5:1 too (not 3:1 — it is still text), a visible focus ring on every
    interactive element, and no meaning carried by colour alone.

---

## Tokens

Defined once in `app/globals.css` on `:root`, redefined under
`@media (prefers-color-scheme: dark)`. **No component hard-codes a colour, size or radius.**
Note that the accent is *lighter* in dark mode — the light-mode purple fails contrast on near-black,
and this is the most common way a "both themes" app ends up looking broken in one of them.

### Colour

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0B0B0F` | page background |
| `--surface` | `#F7F7F8` | `#15151B` | a raised row, an input, a card |
| `--surface-2` | `#EFEFF1` | `#1E1E26` | pressed / hovered surface |
| `--ink` | `#16161A` | `#ECECF1` | body and headings |
| `--ink-muted` | `#5C5C66` | `#A2A2AD` | summaries, counts, timestamps |
| `--ink-faint` | `#8A8A94` | `#70707C` | placeholders, disabled |
| `--line` | `#E4E4E8` | `#26262F` | hairline separators only |
| `--accent` | `#6B4FA8` | `#A98BE0` | primary action, active state, links |
| `--accent-ink` | `#FFFFFF` | `#14101C` | text on an accent fill |
| `--accent-soft` | `#F1ECFA` | `#221B33` | accent-tinted background |
| `--danger` | `#B4232B` | `#FF8A8A` | destructive or failed |
| `--ok` | `#1E7A4C` | `#6FD59B` | saved / filed confirmations |

Folder colours come from the database via `components/folder-colors.ts` and are untouched.
In dark mode they render at full saturation on a dark surface, so check each one; any folder colour
below 3:1 against `--bg` gets a `--line` hairline rather than a brightness hack.

### Type

One typeface: the system stack, which is SF on Apple, Roboto on Android, Segoe on Windows. This is
what Apple itself ships, it loads instantly, and it makes the app feel native on the phone it is on.

```
--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

| Role | Size / weight / line-height | Where |
|---|---|---|
| `--t-title` | 28 / 600 / 1.2, tracking -0.02em | one per screen, top |
| `--t-section` | 20 / 600 / 1.3 | folder name, note title, a heading in a note |
| `--t-body` | 17 / 400 / 1.55 | note text, answers, the capture field |
| `--t-secondary` | 15 / 400 / 1.45 | summaries, counts, helper text |
| `--t-label` | 13 / 600 / 1.2, tracking 0.06em, uppercase | the few real labels; used sparingly |

17px body is Apple's phone body size and is deliberately larger than the web default — reading is
half of what this app is for. Tracking is negative on large text and positive on small caps; that
pairing is most of why professional type looks professional.

### Space, radius, elevation

```
--s1 4   --s2 8   --s3 12   --s4 16   --s5 24   --s6 32   --s7 48   --s8 64
--r-control 10   --r-card 14   --r-pill 999
--gutter 16 (phone)   --measure 680px (max content width on laptop)
--dur 180ms   --ease cubic-bezier(0.2, 0, 0.2, 1)
```

Elevation: in light mode, one shadow only —
`0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px rgb(0 0 0 / 0.06)`. In dark mode **shadows do not work**;
elevation is `--surface` then `--surface-2` instead. Never both.

Focus ring, on everything interactive:
`outline: 2px solid var(--accent); outline-offset: 2px;`

---

## Screen by screen

Order matters: Capture is the front door and the thing seen in public, Ask is the strongest half of
the product, and the Vault is what makes a stranger ask what it is.

### Capture — the front door
Full-height text field, **no border and no box** (principle 1): just `--t-body` ink on `--bg`, 16px
gutters, cursor already in it. Placeholder `What's on your mind?` in `--ink-faint`. One primary pill
button pinned to the bottom above the keyboard. A single line of `--t-secondary` under it the first
time only: *"Tap the mic on your keyboard and talk."* On success the text clears and a quiet `--ok`
line says **"Saved — it'll file itself."** — the promise of the product, restated at the moment it is
kept. Top of screen: two quiet text links, `Vault` and `Ask`. Nothing else.

### Vault — the one people look at
`--t-title` "Vault". Then the folder grid: each folder a `--surface` card, `--r-card`, its folder
colour as a 3px bar along the top edge or a 10px dot before the name (pick one, use it everywhere),
folder name in `--t-section`, count in `--t-secondary` `--ink-muted`.

Two things change here beyond styling:
- The run summary line on `/` is currently a developer's debug string — captures processed, items
  filed, notes appended, cost to six decimal places. It becomes **one quiet line**:
  `Organised 2 hours ago` in `--t-secondary`. The detail moves behind a tap on that line. Cost is
  never shown to a user who is not Sahil.
- A `--accent-soft` pill: **`3 decisions · about 40 seconds →`**, hidden entirely at zero. Finite,
  completable, and the reason to open the app tomorrow.

### Folder — a list that shows its reasons
Rows of note title (`--t-section`) plus the note's one-line summary (`--t-secondary`, `--ink-muted`)
plus relative time. Hairline `--line` between rows, no boxes. Showing the summary is deliberate: it is
the field RC3 says is missing on a quarter of notes, and a visibly empty summary is a bug the user can
see and report.

### Note — a reading view
`--measure` wide, `--t-body` at 1.55, generous `--s5` between blocks. Checkboxes at 48px targets.
`Edit` is a quiet secondary action, top right. When RC1/RC7 land, headings inside a note render at
`--t-section` — the type scale already has the slot, so no redesign is needed later.

### Ask — the strongest half, so give it room
A large question field in `--t-body`, `--surface`, `--r-card`, and one primary **Ask** button. The
answer renders in reading type at `--measure`. Citations are `--accent-soft` pills numbered `1 2 3`
that expand in place to the quoted line and a link to the note — the citation is the trust mechanic
and it should feel like the best-made thing in the app. "Not in your notes" renders calmly in
`--ink-muted`, never as an error; it is the product working.

### Quick Calls — one decision, one screen
The existing card, restyled: the item's text in `--t-body` at the top, options as full-width
`--surface` rows at 48px, the suggested rule last and visibly optional. One decision fills the
screen; the next slides in at `--dur`. When RC5 lands, each option gains a likelihood and a reason —
again, the layout already has the room.

---

## What is explicitly out of scope

No component library, no Tailwind migration, no design-tokens package, no animation library, no
custom font, no icon set beyond the handful needed, no theme toggle, no marketing page, no logo work,
no illustration. If a task needs one of those, it is not this pass.

## How this gets checked

A screen is done when, **in both themes on a phone**: every colour is a token, every gap is a
multiple of 4, there is exactly one primary action, no blank loading state, no ids or JSON visible,
and body text passes 4.5:1. That is the review checklist — six things, checkable in a minute.
