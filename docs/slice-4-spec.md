# docs/slice-4-spec.md — Slice 4: the screens (the magic moment)

**Goal of this slice:** open Mynd on your phone and see your vault — six coloured folders, the notes
inside them, and a note rendered properly with checkboxes you can tap. Plus the ability to fix
anything by hand, and a real icon on your home screen.

**Definition of done:** on the live URL, from the phone: the home screen shows the six folders with
note counts; tapping one lists its notes; tapping a note shows rendered Markdown; tapping a checkbox
ticks it and it stays ticked after a reload; Edit mode lets you correct the misfiled line in the Work
note; and Mynd installs to the home screen and opens without browser chrome.

Path 3 is half-built by this slice: **View** works, **Ask** is slice 5.

---

## Decisions (logged in `docs/DECISIONS.md` 2026-09-20)

- **UI1** — Three screens: vault home → folder → note. Navigation is by tapping, with a back link.
- **UI2** — **The human may edit a note; the organiser still may not.** D1 constrains the AI, not the
  user. Tapping a checkbox and Edit mode both rewrite the body.
- **UI3** — A save carries the note's last-modified time and is **refused** if the note changed
  underneath. This is the first code in the project that can overwrite a note rather than append.
- **UI4** — Folder colours fall back to a palette keyed by slug when the database column is null.
- **UI5** — Mynd is installable (B3, now possible because deploying brought HTTPS). Icons are
  generated, not committed as binary assets.
- **SEC3** (already logged) — vault data is fetched **by the browser with the token**. No page may
  read the database during server render.

---

## 1. Files

```
app/page.tsx                  # REPLACE the placeholder: the vault home, folder tiles
app/folder/[slug]/page.tsx    # NEW: the notes in one folder
app/note/[id]/page.tsx        # NEW: one note — rendered, tappable checkboxes, Edit mode
app/api/vault/route.ts        # NEW: GET  -> folders + note metadata + open Quick Calls count
app/api/note/[id]/route.ts    # NEW: GET  -> one note with its body
                              #      PATCH -> save a new body, with a last-modified check
app/manifest.ts               # NEW: name, colours, icons (UI5)
app/icon.tsx                  # NEW: generated favicon
app/apple-icon.tsx            # NEW: generated home-screen icon
app/layout.tsx                # MODIFY: theme colour meta; tabs unchanged
components/NoteBody.tsx       # NEW: renders Markdown, makes checkboxes tappable
components/folder-colors.ts   # NEW: the slug -> colour fallback (UI4)
lib/db/queries.ts             # MODIFY: + countOpenQuickCalls, updateNoteBody
package.json                  # MODIFY: + react-markdown, remark-gfm
```

No new tables, no schema change, no organiser change, no model calls. **This slice spends nothing.**

## 2. The endpoints

### `GET /api/vault`
`withAuth`. Returns `{ folders, notes, openQuickCalls }` — reusing the existing `getVault()`
(folders plus note metadata *without* bodies) and a new `countOpenQuickCalls()`. The folder screen
filters this list in the browser; at tens or hundreds of notes there is no reason for a second
endpoint.

### `GET /api/note/[id]`
`withAuth`. `getNote(id)` — the full note including its body. `404` when missing.

### `PATCH /api/note/[id]`
`withAuth`. Body: `{ body: string, updatedAt: string }`.

- Reject a non-string body, an empty or whitespace-only body (that would be an accidental wipe), or
  one over 200,000 characters → `400`.
- `updatedAt` must be the value the client last read. New query:

```
updateNoteBody(id, body, expectedUpdatedAt) -> { ok: true, note } | { ok: false, reason: "conflict" | "missing" }
```

  Inside one transaction: `SELECT … FOR UPDATE`, compare `updated_at`, then `UPDATE … SET body = $,
  updated_at = clock_timestamp()`. Atomic, so the check cannot be raced.
- Conflict → **`409` with the current note**, so the screen can say "this note changed — reload" and
  show what it now says. **Never silently overwrite.** The organiser appends to notes on its own
  schedule; without this, a note open in your pocket would wipe whatever it added.

## 3. The screens

All three are client components that fetch with the token, exactly as the captures screen already
does. **No page may read the database during server render** (SEC3) — the URL is public and the token
gate is client-side, so a server-rendered note would be readable by anyone.

### `app/page.tsx` — vault home

Six tiles, one per folder, each with its colour, name and note count, in a grid that works at phone
width. Beneath them, a plain line: `9 items need a decision — Quick Calls arrive in slice 6.` Not a
link; it exists so those items are not invisible.

### `app/folder/[slug]/page.tsx`

The folder's name and description, then its notes — title and one-line summary — most recently
updated first. Empty folder says so. A back link to the vault.

### `app/note/[id]/page.tsx`

The note's title, then its body through `NoteBody`. A back link to its folder.

**Tapping a checkbox** (`components/NoteBody.tsx`): `react-markdown` with `remark-gfm` renders task
lists. Each checkbox carries **the source line number** from the Markdown node's position — tapping
flips `- [ ]` to `- [x]` (or back) on that line only, and PATCHes the whole body. Line numbers, not
text matching, so two identical items cannot be confused. Raw HTML stays disabled (react-markdown's
default); no `rehype-raw`.

**Edit mode:** a button swaps the rendered note for a textarea containing the raw Markdown. Save
PATCHes; Cancel discards. Save is disabled while the text is unchanged or empty. On `409`, show the
conflict message and the current text rather than overwriting.

Keep every interaction honest about failure, as CAP2 taught: if a tick or a save fails, say so and
leave the note as it was on screen. Never show a tick that did not persist.

## 4. Colours and the icon

**UI4** — `components/folder-colors.ts` maps slug → colour, used when `folders.color` is null
(`mynd`, `work`, `personal` and `tasks` were created without one). The database value always wins, so
a colour can still be changed there later.

```
journal  #6aa5b8   tasks     #6f9e7b   work      #b8705f
inbox    #c9a86a   mynd      #8f6ac4   personal  #a76a94
```

**UI5** — `app/manifest.ts`: name "Mynd", `display: "standalone"`, `start_url: "/"`, theme and
background colours, and 192 and 512 icons. `app/icon.tsx` and `app/apple-icon.tsx` generate the
images with `ImageResponse` from `next/og` — a letter **M** on the theme colour — so no binary
assets are committed and nothing needs drawing. If wiring `ImageResponse` into the manifest's icon
list proves awkward in Next 16, commit two small PNGs instead and say so; the requirement is an
installable app with a recognisable icon, not a particular mechanism.

## 5. Verification

**Free and local:** `npm run typecheck`, `npm run lint`, `npm run build`.

**Then push, let Railway deploy, and test on the live URL.**

1. **SEC3, the important one.** With no token at all:
   ```
   curl -s https://mynd-production-c3eb.up.railway.app/ | grep -i "things to buy"
   curl -s -o /dev/null -w "%{http_code}\n" https://mynd-production-c3eb.up.railway.app/api/vault
   ```
   The first must print **nothing**. The second must print **401**. If a note title appears in that
   HTML, the screens are leaking the vault to the internet and the slice is not done.
2. **Home screen:** six folders with correct counts (journal 1, mynd 1, personal 2, work 1, tasks 0,
   inbox 0 — plus anything organised since), and the Quick Calls line showing 9.
3. **Folder → note:** tap through to a note; the Markdown renders as headings and bullets, not as raw
   `##` and `-`.
4. **Tick a checkbox** on "things to buy". Reload. Still ticked. Check from the laptop too — same
   database, so it must agree.
5. **Conflict, by hand:** open a note and note its state. From the terminal, PATCH it with a
   deliberately stale `updatedAt` → expect **409** and no change.
6. **Edit mode does real work:** open the Work note "meeting with Dingerva" and remove the misfiled
   line "Two prompts instead of one in the organizer." Save. Reload. It is gone. That line has been
   wrong since 2026-09-19 (O3) and this is the slice that lets you fix it.
7. **Install it:** on the phone, Add to Home Screen. The icon is the Mynd icon; opening it shows no
   browser address bar.

## 6. Out of scope

Resolving Quick Calls (slice 6), Ask (slice 5), the cron (3c), search, creating a note by hand (the
organiser's job — CP2), deleting a note (nothing in Mynd deletes), editing folders, note-to-note
links (X1), multi-lens views (X1), any visual polish beyond legible and thumb-reachable.

Next: slice 3c (the cron), then slice 5 (Ask).
