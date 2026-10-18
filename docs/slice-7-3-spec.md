# docs/slice-7-3-spec.md — Slice 7.3: first-user prep (Aditya)

Written 2026-10-18. **Current slice.** Branch: `first-user-prep`, cut from `main` (FU1) — **not** from
`slice-7-2-tidy`, which stays unmerged until its own live checks pass. A push to `main` deploys; merge
only after the verification at the bottom passes. Read `AGENTS.md`, `ARCHITECTURE.md`, `docs/first-five.md`
§0 and the 2026-10-18 entries in `docs/DECISIONS.md` (FU1–FU5) first.

**Why:** Aditya is the first real user, in a watched session on Tuesday. The session fails if he lands
in Sahil's vault, if his folders are Sahil's, if nothing is filed for twelve hours (the cron runs at
07:00 and 19:00 UTC — GTM8), or if the screens show debug text. This is small prep, not a feature.

Isolation needs **no code**: he gets his own Railway web service + Postgres + `SECRET_TOKEN` (GTM12,
runbook below). The home-screen cost/run line is **already gone** — `app/page.tsx` shows only "Last
organised … ago".

**Do not build:** analytics or click tracking, auth or login, a redesign, theming or dark mode, any new
feature, the `user_id` per-user vault (after Tuesday).

---

## F1 — Aditya's folders: `testers/aditya.json` (data only; FU2)

Four folders. Journal and Inbox are **not** in the file — `loadSeedFolders` (`lib/db/seed.ts`) adds them
with `JOURNAL_DESC` / `INBOX_DESC`, which already say what Sahil asked for, and the `journal` slug must
stay exactly `journal` (`lib/organizer/coverage.ts` date titles depend on it). Use these descriptions
verbatim:

| name | slug | color | description |
|---|---|---|---|
| Personal | `personal` | `#7a9c73` | Everyday life: errands, shopping, health, home. GROUPING: one note per list or theme (e.g. 'things to buy'); lists use checkboxes and new items append to the existing list. |
| Work | `work` | `#6686ac` | Job stuff: meetings, tasks, people, projects. GROUPING: one note per meeting or project; follow-ups about the same meeting or project append to that note. |
| Ideas | `ideas` | `#8d79b8` | Thoughts, product ideas, things to explore. GROUPING: one note per idea or theme; later thoughts on the same theme append to that note. |
| To-dos | `todos` | `#b89068` | Things to do: calls, errands, follow-ups. GROUPING: one checklist note per area of life (e.g. 'personal to-dos', 'work to-dos'). Each task is a checkbox - [ ] …. Keep any timing exactly as said ('next week', 'on the 12th'); never turn it into a date. Shopping lists are not to-dos; they belong in Personal. |

**Accept:** `$env:SEED_FOLDERS_FILE="testers/aditya.json"; npx tsx -e "import('./lib/db/seed').then(m=>m.loadSeedFolders()).then(f=>console.log(f.map(x=>x.slug)))"`
prints `personal, work, ideas, todos, journal, inbox`. `npm run seed:check` still passes.

## F2 — "Organise now" (code; FU3)

**Route** `app/api/organize/route.ts`: `POST`, wrapped in `withAuth` (`lib/auth.ts`), no body. It calls
`runOrganize({ trigger: "button" })` from `lib/organizer/index.ts`.
- Add `"button"` to the `trigger` union in `runOrganize` and wherever `OrganizeRunInput["trigger"]` is
  typed. `organize_runs.trigger` is plain `text` — **no migration**. A `"button"` run behaves exactly
  like `"cron"`: no `.runs` file, no per-capture console detail (those are gated on `"manual"`).
- Mark it `export const dynamic = "force-dynamic"`; Node runtime (it uses `pg`).

**Guards — code, not model; all SQL in `lib/db/`** (new `lib/db/organize-lock.ts`):
1. **One run at a time.** `withOrganizeLock(fn)` takes a dedicated client and runs
   `SELECT pg_try_advisory_lock(<new key, not 715002>)`. If false → the route returns
   `409 { error: "Already organising — give it a minute." }`. If true, run `fn`, then unlock and
   release in `finally` (same discard-on-unlock-failure pattern as `lib/db/model-call-lock.ts`).
   Wrap `jobs/organize-cron.ts`'s call in the same lock (if busy, log "Already organising" and exit 0),
   so a cron run and a button run can never both split the same captures and pay twice.
2. **Cooldown.** `lastButtonRunStartedAt()`: `SELECT max(started_at) FROM organize_runs WHERE trigger =
   'button'`. If it was under **2 minutes** ago → `429 { error: "Organised a moment ago — try again in a
   minute." }`. Check it inside the lock.
3. Spend is already capped by `withModelRun` and the per-call / per-run / daily guards. Do not add a
   bypass, a retry, or a second limit.

**Response:** `200 { status: "ok", filed, queued }` (counts from the returned plan: `plan.filed.length`,
`plan.queued.length`) or `200 { status: "nothing_pending" }` when `runOrganize` returns `undefined`.
On a thrown error: `500 { error: <the error's message> }` — `runOrganize` only ever throws its
sanitized run error, never a raw cause; do not log or return anything else.

**Home** `app/page.tsx`, under the "Last organised …" line: a plain button **Organise now**.
- While the request runs: disabled, label "Organising… this can take a minute".
- Then call `reload()` from `useVault` (it already exists in `components/vault-data.ts`) and show one
  line: "Filed N thoughts." (+ " M need a decision." when queued > 0), or "Nothing waiting to
  organise.", or the 409/429/500 message. 401 → `clearToken()` as other screens do.
- Plain white styling, matching the page. No other change to home.

**Accept:** typecheck/lint/build pass. Offline check (extend `organize:check` or a small new
`scripts/organize-now-check.ts`, no AI, no live DB if the existing support makes that cheap): busy lock
→ 409 without calling `runOrganize`; recent button run → 429 without calling it; no pending → zero model
calls.

## F3 — Remove the cost line from Ask (code; FU4)

Delete `<small>Cost: ${ask.costUsd.toFixed(6)}</small>` in `app/ask/page.tsx`. Cost stays in `asks` and
`model_calls`. Nothing else on Ask changes.

## F4 — Notes readable (CSS only; **one-hour cap**)

In `components/NoteBody.tsx`'s style block only:
- GFM task items show their checkbox, not a bullet too: `li.task-list-item { list-style: none }`, and
  pull `ul.contains-task-list` left so checkboxes line up with the text above.
- `h1` gets a size in line with `h2`/`h3` (a note body with `# …` must not render at browser default).
- Tighter `p` margins inside lists.

No parser change, no markdown change, no new dependency, no redesign. If it is not done inside an hour,
stop and leave it — Sahil pre-frames it in the session.

## F5 — Checks
`npm run typecheck`, `lint`, `build`, `seed:check`, `organize:check`, `split:check`, `ask:check` all pass.

---

## Runbook — Aditya's vault (Sahil, after merge; adapts `first-five.md` §0)
1. Railway → upgrade to **Hobby**, then set a usage limit (Workspace → Usage, ~$10) (FU5). Confirm the
   main vault URL loads again.
2. Merge `first-user-prep` into `main` after the verification below.
3. New → Database → PostgreSQL, `mynd-aditya-db`. New → GitHub Repo → Mynd, branch `main`, `mynd-aditya`.
   Copy every variable from the production web service; change `DATABASE_URL` to reference
   `mynd-aditya-db`; set a new long random `SECRET_TOKEN`; keep the spend caps. Networking → Generate Domain.
4. From the laptop, against his database's **public** URL:
   ```powershell
   $env:DATABASE_URL = "<his public database URL>"
   $env:SEED_FOLDERS_FILE = "testers/aditya.json"
   npm run vault:print      # MUST fail with a missing-table error. If it prints your notes, STOP.
   npm run db:migrate
   npm run db:seed
   npm run vault:print      # Personal, Work, Ideas, To-dos, Journal, Inbox — no notes
   Remove-Item Env:DATABASE_URL, Env:SEED_FOLDERS_FILE
   ```
5. Optional, only if he keeps using it: an hourly cron service on his vault (GTM15), Restart Policy
   **Never**, same variables.

## Verification (manual — this is "done")
1. Local, against a scratch database seeded from `aditya.json`: home shows exactly the six folders.
2. Capture three thoughts on the phone, tap **Organise now**: they are filed within about a minute and
   home says "Last organised just now".
3. Tap again at once → the cooldown message. Tap while a run is in progress (second tab) → "Already
   organising".
4. With nothing pending, tap → "Nothing waiting to organise", and no new `model_calls` rows.
5. Ask a question, expand the answer → no cost line.
6. A note with checkboxes and `##` sections at phone width: one checkbox per task, no stray bullets.
7. On Aditya's live URL: Sahil's token gets 401; none of Sahil's folders or notes appear anywhere.
