# docs/slice-7-spec.md — Slice 7: instant capture, and a UI that doesn't look vibe-coded

Written 2026-09-28. **Current slice.** Read `AGENTS.md`, `ARCHITECTURE.md` and
`docs/design-system.md` before writing a line. The grader that used to be slice 7 moves to slice 9.

**Why this is the next slice, and not the organiser quality pass:** the organiser's structure problems
(RC1, RC7) are the most important thing wrong with the *product*, but they have now been tuned against
Sahil's own vault twice, and a third pass would fix what bothers one person. Slice 7 plus slice 8 are
what make it possible to put Mynd in five other people's hands; their misfiles are what aims the
quality pass. Ask is already judged good and is not touched here.

This slice contains no model calls, no schema change, and no new SQL. It is presentation and manifest
work only. That is deliberate — it should be verifiable in an afternoon and impossible to break the
five non-negotiable rules with.

---

## S7-1 — Instant capture (do this first; the first part is one line)

The goal is *icon or gesture, then talking, with nothing in between*. Mynd does not record audio —
`app/capture/page.tsx` is a textarea and dictation comes from the phone keyboard's mic — so what is
being made instant is **reaching an already-focused textarea**.

### S7-1a. `start_url` becomes `/capture`
In `app/manifest.ts`, change `start_url` from `/` to `/capture`. Today the home-screen icon opens the
Vault, which fetches over the network, and capture is a further tap. After this the icon lands on a
focused field. **This one line is the largest friction cut available in the whole app.**

Consequence to handle: the Vault must be one tap *from* capture (the quiet `Vault` link in the header,
per the design doc). Capture is the frequent act, so this is the right way round regardless.

### S7-1b. Manifest `shortcuts`
Add the `shortcuts` member so long-pressing the Android launcher icon offers `Capture` and `Ask`
directly:

```ts
shortcuts: [
  { name: "Capture a thought", short_name: "Capture", url: "/capture" },
  { name: "Ask your notes",    short_name: "Ask",     url: "/ask" },
],
```

### S7-1c. Manifest `share_target` — the Android-only win
Android's share sheet can target an installed PWA. This means **from any app on the phone** — a
browser, WhatsApp, a podcast player — share text to Mynd and it becomes a capture. iPhone has no
equivalent, so this is a genuine advantage of Sahil's phone, not a consolation prize.

```ts
share_target: {
  action: "/capture",
  method: "GET",
  params: { title: "title", text: "text", url: "url" },
},
```

`app/capture/page.tsx` then reads `?text=`, `?title=` and `?url=` on mount and seeds the draft with
them (joined by a blank line, url last). Rules:
- It seeds the draft **only when the draft is empty**, so a shared item can never overwrite something
  half-dictated. This is the same instinct as CAP2 — never lose the user's text.
- After seeding, strip the query params with `history.replaceState` so a reload does not re-seed.
- The capture POST body stays exactly as it is; shared text is just text.

### S7-1d. Device gestures — no code, Sahil configures these
OnePlus / OxygenOS, to be tried in this order and the winner written into `docs/first-five.md` as an
onboarding step. An installed PWA appears to the launcher as an app, so it can usually be targeted
directly; where a gesture picker only lists native apps, a 1×1 home-screen shortcut in the dock is the
fallback.

1. **Install the PWA and put the icon in the dock**, bottom row. One tap from every home screen. Do
   this even if a gesture works — it is the baseline.
2. **Screen-off gestures** — Settings, Special features (or Gestures & motions), Screen-off gestures:
   draw a letter (O, V, S, M) to launch an app. Draw `M` for Mynd, from a dark screen, without
   unlocking into anything else first. This is the closest thing on Android to what Wispr Flow feels
   like.
3. **Quick Launch** — long-press the fingerprint sensor for a shortcut ring.
4. **Quick Tap / tap the back of the phone** — present on some OxygenOS builds under Accessibility.
   This is the Android sibling of the iPhone back-tap idea; if the build has it, it is the best one.
5. **"Hey Google, open Mynd"** — works today, zero setup, and is hands-free in a way none of the
   others are.
6. Only if none of the above land: a Tasker mapping from a double volume press to the capture URL.

**A floating overlay button stays unbuilt.** Android permits it, but only from a native app with an
overlay permission, and iPhone forbids it outright — so it means a second codebase and a store review
for one platform. It is a retention mechanic, not a trial mechanic. `AGENTS.md` deferred it and that
still holds; revisit when there is evidence people capture often enough to want it.

---

## S7-2 — The design pass

Implement `docs/design-system.md` exactly. Do not invent values; if something is missing from that
file, stop and ask rather than choosing.

1. **`app/globals.css`** holds every token, on `:root` and again under
   `@media (prefers-color-scheme: dark)`. Set `color-scheme: light dark` so form controls and
   scrollbars follow too — this is a one-line fix for the commonest "broken in dark mode" tell.
2. **Delete the inline styles** as each screen is converted. The end state is no `style={{…}}` holding
   a colour, a size or a radius. Layout-only inline style is tolerable; a hard-coded `#ccc` is not.
3. **Screens, in this order:** Capture, Vault (`app/page.tsx`), Ask, Folder, Note, Quick Calls,
   Captures. Each one is finished and checked in both themes before the next is started.
4. **The run-summary line on `/`** collapses to `Organised 2 hours ago`, with the detail behind a tap
   and **cost hidden from anyone who is not the owner**. The current line is the single most
   "unfinished software" thing in the app.
5. **Empty and loading states on every screen**, per principles 9 — skeletons in the shape of the
   real content, and empty text that names the next action.
6. **`TokenGate`** is the literal first screen a new person sees and is currently a bare prompt. It
   gets the same treatment: the product name, one line of what Mynd is, one field, one button.

---

## S7-3 — A reason to come back (the cheap version)

**Assumption, overturn in one line if wrong:** the return mechanic is the Quick Calls queue reframed
as a small daily ritual, not a streak. A capture streak rewards volume over value, and the day it
breaks is the day someone stops — the opposite of what five trial users need. The weekly digest
(V2-1) is the stronger long-term hook but costs model calls and a week of build; it waits until
people are actually using the app.

Two additions, both free of model calls:

1. **The decisions pill on the Vault**: `3 decisions · about 40 seconds →`, hidden at zero. Finite and
   completable is what makes a task openable; "N items need a decision" reads as a debt.
2. **"Since you last looked"**: one `--t-secondary` line on the Vault — `Since Tuesday: 9 thoughts
   filed into 4 areas.` Derive it from existing rows in `lib/db/` (no new tables); "last looked" is a
   timestamp in `localStorage`, because it is a per-viewer convenience and does not need to be durable
   or shared. Visible accretion is the honest version of progress: it rewards the vault growing, not
   the user performing.

---

## S7-4 — Distribution: be honest about what it is

The three-part frame is right — a painful repeatable problem, a reason to return, a distribution loop
— and on the third one the truthful answer for Mynd today is: **there is no viral loop in a private
thought vault, and the screen itself is the distribution.** Someone asking "what is that?" over your
shoulder is not a growth hack; for this product it is the actual channel, and it is bought entirely
with S7-2. That is the commercial argument for spending these two days on the UI and it is why the UI
is in the same slice as the capture work.

What is *not* built now, and why:
- Sharing note content — the vault is private and shareable content is the wrong instinct here.
- Shareable **structure** (a folder scheme, an organisation template) is the one genuinely shareable
  artifact a private vault has. It is already recorded as H5 / V2-2. Post-v1.
- A shareable Ask answer with citations is the second candidate. Also post-v1.
- Invite codes arrive with accounts in slice 8, where they are nearly free.

On niching the painful problem — **assumption, overturn in one line:** the five come from solo
founders and builders. Not a repositioning, just who gets recruited, so that five people's feedback
points the same direction instead of five. Recorded in `docs/first-five.md`.

---

## Out of scope for slice 7

Accounts and multi-user, starter folders, organise-on-demand (all slice 8). The organiser quality pass
(RC1–RC7). The grader (now slice 9). The weekly digest. Any new model call, table, or SQL. A native
app. A component library or CSS framework migration.

---

## Verification — the manual scenarios (PR2: the slice is not done until these pass on the phone)

Automated first: `npm run typecheck`, `npm run lint`, `npm run build`, and the existing free checks
(`split:check`, `organize:check`, `ask:check`, `quick-calls:check`) all still pass. No `.env` edit.

Then, on the OnePlus, in **both** light and dark mode (change it in Android settings between passes):

1. Reinstall the PWA. Tap the home-screen icon. **It opens the capture field with the cursor in it**,
   and you can start dictating without another tap.
2. Long-press the home-screen icon. `Capture` and `Ask` both appear and both work.
3. Open a web page in Chrome, share it, choose Mynd. The capture field is **pre-filled** with the
   title, text and URL, and sending it stores a capture that appears in Captures.
4. Start dictating something, do not send, then share text from another app into Mynd. **The
   half-dictated text is still there and was not replaced.**
5. Reload a share-target capture URL. The field does **not** re-fill from the old query string.
6. At least one device gesture (screen-off letter, Quick Launch, Quick Tap, or "Hey Google") opens
   capture from a locked or dark screen. Write down which one won.
7. Walk every screen — Capture, Vault, folder, note, Ask, Quick Calls, Captures — and confirm the
   six-point checklist from the design doc on each: tokens only, 4px multiples, one primary action, no
   blank loading state, no ids or JSON or six-decimal costs, body text readable.
8. The Vault shows `Organised …` as one quiet line, the decisions pill with a real count, and the
   "since you last looked" line. Resolve all open Quick Calls and confirm the pill **disappears**
   rather than showing zero.
9. Hand the phone to someone for ten seconds without explaining anything. Ask them what they think it
   is. That is the real test in this slice.
