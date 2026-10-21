# docs/slice-7-4-spec.md — Slice 7.4: your own folders (after Aditya's session)

Written 2026-10-21. **Current slice.** Branch: `slice-7-4-user-folders`, cut from `first-user-prep` (UF1).
**`first-user-prep` is Aditya's live branch** — his Railway service deploys every push to it, the way
`main` deploys Sahil's (UF10). So never commit or push to `first-user-prep` directly: build on
`slice-7-4-user-folders`, verify, then merge (runbook below). Read `AGENTS.md`,
`ARCHITECTURE.md`, `docs/slice-7-3-spec.md` and the 2026-10-21 entries in `docs/DECISIONS.md` (UF1–UF9)
first.

**Why:** Aditya, the first real user, wanted his own areas — travel, movies, Instagram saves. The generic
set (FU2) didn't fit his life, and only Sahil could add a folder (`npm run folders:describe` plus SQL).
This slice is the "user adds a new area" path. **The organiser still never creates folders** — the user
does, through a screen, and code inserts the row. Nothing on the organiser path gains that capability.

**No schema change. No migration.** Everything here fits the existing `folders` table and note bodies.

**Do not build** (logged as deferred, UF9): link / Instagram / share-sheet capture · filtering Ask history
by folder · deleting or merging folders · re-filing existing notes into a new folder · nested folders
(`parent_id` stays unused) · any restyle (plain white, as the screens are now).

---

## F1 — Create a folder (code; UF2, UF3)

### Server — all SQL in `lib/db/`
New `lib/db/folders.ts` (or extend `queries.ts` beside `createFolder`, whichever reads cleaner):

`createUserFolder({ name, description, color, confirmOverLimit })`, in **one transaction**:
1. `SELECT pg_advisory_xact_lock(<new key, not 715001/715002 or the organize-lock key>)` — so two taps
   can't both pass the count check or both claim a slug.
2. **Validate** (code, not model): `name` trimmed, 1–40 chars; `description` trimmed, 1–300 chars;
   `color` either absent or one of `FOLDER_PALETTE` (below). A case-insensitive duplicate name →
   `409 { error: "You already have a folder called <name>." }`.
3. **Soft limit** (F2): `SELECT count(*) FROM folders`. If `>= 10` and `confirmOverLimit !== true` →
   return `{ needsConfirm: true, count }` without inserting.
4. **Slug**: from the name — lowercase, non-alphanumerics → `-`, trimmed of `-`, max 40; empty (e.g.
   emoji-only name) → `folder`. If taken, append `-2`, `-3`, …. Never reuse a slug, never change one later.
5. **Grouping rule**: if the description does not contain `GROUPING:` (case-insensitive), store
   `<description> GROUPING: One note per topic; new items on the same topic append to that note.`
   (`DEFAULT_GROUPING` constant in `lib/db/seed.ts`, beside `JOURNAL_DESC`.)
6. **Colour**: if none given, the first `FOLDER_PALETTE` colour no folder uses; if all are used, the
   first one.
7. Insert through the existing `createFolder`. Return the folder.

`FOLDER_PALETTE` — export from `components/folder-colors.ts` (the server imports it; it is plain data):
`#7a9c73 #6686ac #8d79b8 #b89068 #a07a9c #6aa5b8 #c9a86a #b8705f #6f9e7b #a76a94`.

**Route** `app/api/folders/route.ts`: `POST`, `withAuth`, `force-dynamic`, Node runtime. Body
`{ name, description, color?, confirmOverLimit? }`. Responses: `201 { folder }` · `200 { needsConfirm:
true, count }` · `400 { error }` for validation (the message names the field in plain words: "Give the
folder a name.", "Say what goes in this folder — the organiser files by this line.") · `409` duplicate.

### Nothing to do for "available on the next run"
`stage0-gather.ts` calls `listFolders()` at the start of every run, so a new folder reaches the very next
run (cron or Organise now). **Do not** add any re-filing: existing notes and already-filed captures stay
where they are (UF4).

### Home screen (`app/page.tsx`)
Below the folder grid, a plain button **+ New folder**. Tapping it shows an inline form (not a new
page — `/folder/new` would collide with `/folder/[slug]`):
- **Name** — text input.
- **What goes here?** — one-line text input, helper text under it: "The organiser uses this line to
  decide what to file here."
- **Colour** — the ten palette swatches as radio buttons (a small coloured square each, an accessible
  label); none selected by default.
- **Create folder** and **Cancel**.
On `201`: close the form, `reload()`, show "Created <name>. New thoughts can be filed there from the next
organise." On `needsConfirm`: F2. Errors show inline as `role="alert"`. 401 → `clearToken()` as elsewhere.

## F2 — Soft limit at 10 folders (UF3)
"10" counts **every** folder on the home screen, Journal and Inbox included (it's what the user sees).
When the server returns `needsConfirm`, the form shows, inline (not `window.confirm`):

> You already have N folders. More folders can make things harder to find. Create anyway?
> **[Create anyway]** **[Cancel]**

(N is the real count, so the 12th attempt says "11".) **Create anyway** re-posts the same body with
`confirmOverLimit: true`; **Cancel** returns to the filled form without creating anything. Every creation
past ten asks again. Never block.

## F3 — Edit a folder (code; UF5)

`updateUserFolder(slug, { name, description, color })` in `lib/db/`, one transaction, `FOR UPDATE` on
the row (same shape as `updateFolderDescription`). Same validation as F1, the duplicate-name check
excludes the folder itself, the `GROUPING:` default is re-appended if the edit removed it. **The slug
never changes**, so links and the Journal/Inbox logic keep working.
- **Journal and Inbox**: name and colour are editable; **description is not** (the route returns 400 if
  it differs). Journal's description carries the one-note-per-day rule that `coverage.ts` date titles
  depend on; Inbox's is the organiser's fallback.

**Route** `app/api/folders/[slug]/route.ts`: `PATCH`, `withAuth`. `200 { folder }` · `400` · `404` · `409`.

**Folder page** (`app/folder/[slug]/page.tsx`): an **Edit folder** button under the description opens
the same inline form, prefilled (the full stored description, `GROUPING:` text included — it's what the
organiser reads). For Journal/Inbox the description field is shown read-only with "This folder's rule is
fixed." Under the form: "Changes how new thoughts are filed. Notes already here stay as they are." Save →
`reload()`.

Editing never touches `notes`, `note_sources` or `captures`.

## F4 — Seeding can never touch a vault that has folders (code; UF6)

`seed()` in `lib/db/seed.ts`: inside its transaction, first take `pg_advisory_xact_lock(715001)` (the
migrate key — seed and migrate never interleave), then `SELECT count(*) FROM folders`. If `> 0`: insert
nothing, return the existing folders, and `db-setup.ts` prints
`PASS: Vault already has N folders; seed skipped.` Only a vault with **zero** folders is seeded.
**Why it matters:** today seed inserts any missing slug, so running `npm run db:seed` against Aditya's
database without `SEED_FOLDERS_FILE` would add Sahil's Tasks, Mynd and Learning to his vault.

Extend `npm run seed:check`: (a) empty vault → seeds the set; (b) a vault with folders, including one
the user renamed and one they created → unchanged after seeding, no new rows, no edits.

Deploys themselves already cannot touch data: Railway runs `npm install && npm run build` then
`npm start` (`railway.json`); no migration and no seed runs on deploy (E7). **Keep it that way** — do not
add a migrate or seed step to the build or start command. `schema.sql` stays additive (`CREATE … IF NOT
EXISTS`, `ADD COLUMN IF NOT EXISTS`) — this slice adds nothing to it.

**New read-only command** `npm run vault:counts` (`scripts/vault-counts.ts`, SQL in `lib/db/`): prints
counts of folders, notes, captures, quick_calls, rules, asks, plus each folder's `slug · name · note count`.
Used by the redeploy check (Verification 6). It never writes.

## F5 — To-dos: completed stay, shown on request (code; UF7)

Ticking already marks the line `- [x]` in its note and nothing is deleted — the item simply leaves the
list, which reads as deleted. Make completed items reachable:
- `lib/note-tasks.ts`: add `extractDoneTasks(body)` (task items with `checked === true`), same parser.
- `app/todo/page.tsx`: under the open list, a button **Show completed (N)** / **Hide completed**. Hidden
  by default on every visit. Completed items are grouped by note like open ones and rendered with the
  same `NoteBody taskLine` component; unticking one moves it back to the open list through the same
  save path and conflict check.
- No schema change, no archive table, no model call. The home "To do (N)" count stays open-only.

## F6 — Quick Calls wording (copy only; UF8)
- Home link: `1 note I wasn't sure where to file — pick a folder for it` / `N notes I wasn't sure where
  to file — pick a folder for them`; when 0: `Quick Calls — nothing to sort` (still a link, rules live
  there).
- Quick Calls page: replace `N need a decision` with the same sentence, and keep "All caught up." for 0.
- Organise now result: `Filed N thoughts.` + ` M I wasn't sure where to file — see Quick Calls.`
No other change on Quick Calls.

## F7 — Checks
`npm run typecheck`, `lint`, `build`, `seed:check`, `organize:check`, `split:check`, `ask:check`,
`todo:check` (add a done-task case), `quick-calls:check` all pass. Add `scripts/folders-check.ts`
(`npm run folders:check`, no AI, no live DB if `smoke-support` makes that cheap): slug from name and
collision suffix; grouping appended once and not twice; 10th folder creates without asking, 11th returns
`needsConfirm`, 11th with confirm creates; duplicate name rejected; Journal description edit rejected.

---

## Verification (manual — this is "done")
Local, against a scratch database seeded from `testers/aditya.json` (six folders).
1. **New folder reaches the organiser.** + New folder → "Travel", "Places I want to visit, travel ideas,
   trip plans", no colour. It appears on home with a colour. Capture "want to go hiking in the Dolomites
   next summer" → Organise now → the note is in Travel. Open Travel: description ends with the GROUPING
   line. *Known risk:* `lib/prompts/route.ts` still says "Actions go to Tasks", and "want to go hiking"
   reads as an action, so it may land in To-dos. If it does, record it as a routing finding — do not
   change the prompt in this slice.
2. **Soft limit.** Create folders until home shows 10 (none asked). The 11th shows the dialog with "10";
   Cancel → still 10, form still filled. Again → Create anyway → 11. The 12th asks again with "11".
3. **Edit.** Rename Travel to "Trips", change the description and colour. Existing notes are still in
   it; URL unchanged. On Journal, the description can't be edited; the name can.
4. **To-dos.** Tick a to-do → it leaves the list → Show completed shows it ticked → untick → back in the
   list, and the note shows `- [ ]` again.
5. **Quick Calls copy.** With one open Quick Call, home reads "1 note I wasn't sure where to file — pick a
   folder for it."
6. **Redeploy keeps everything** (on Aditya's live vault, after merge — the runbook below). The
   `vault:counts` output before and after is identical, and `npm run db:seed` against it prints "seed
   skipped".

## Runbook — shipping to Aditya without touching his data (Sahil)
1. Aditya's service deploys `first-user-prep` (UF10). 7.4 reaches it only after Verification 1–5 pass
   locally on `slice-7-4-user-folders`.
2. Before the deploy, from the laptop:
   ```powershell
   $env:DATABASE_URL = "<Aditya's public database URL>"
   npm run vault:counts > before.txt
   Remove-Item Env:DATABASE_URL
   ```
3. Merge and push — **this is the deploy to Aditya**:
   ```powershell
   git checkout first-user-prep
   git merge slice-7-4-user-folders
   git push origin first-user-prep
   ```
   Wait for the `mynd-aditya` deploy to go green in Railway. Your own vault (`main`) is untouched.
4. Repeat step 2 into `after.txt`, then `Compare-Object (Get-Content before.txt) (Get-Content after.txt)`.
   **Expected: no output** (identical). Any line printed → stop and tell Claude before Aditya opens it.
5. Do **not** run `db:migrate` — this slice adds no schema. (Even if run, it only adds what's missing.)
6. **Later, for your own vault** (UF10): once Aditya has used 7.4 without trouble, merge
   `first-user-prep` into `main` (that brings 7.3 and 7.4 to your vault). Run the same before/after
   `vault:counts` check against your own database.
