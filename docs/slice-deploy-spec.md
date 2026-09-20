# docs/slice-deploy-spec.md — Deploy: Mynd on a real URL

**Why this exists, inserted before slice 4.** Capture currently works only while the laptop is awake
running `npm run dev`, with the phone on the same Wi-Fi. So a thought on the train is lost — and B7's
plan (bank the organiser-quality work, go build a real corpus) depends on being able to capture
anywhere. Deploying is what makes that true. It also gives the cron in 3c somewhere to run, and HTTPS,
without which the app cannot be installed to a home screen (B3).

**Definition of done:** an HTTPS URL that works on the phone over mobile data, with no laptop running;
the unlock screen appears, a dictated thought lands in the inbox, and the Captures tab shows it. The
database is reached over Railway's internal network (S3). A fresh `SECRET_TOKEN` is in use.

---

## 1. Codex's part (small)

```
package.json          # MODIFY: + "engines": { "node": ">=20.9" } — Next 16 needs it; pins Railway's choice
railway.json          # NEW: explicit build and start commands, healthcheck path
app/api/health/route.ts  # NEW: GET -> 200 {"ok":true}. No auth, NO data of any kind.
README.md             # MODIFY: a Deploy section mirroring §2
docs/STATE.md         # MODIFY: record the live URL and that capture works off-Wi-Fi
```

`/api/health` exists so Railway can tell whether the app is alive. It must return nothing but
`{"ok":true}` — no counts, no versions, no config, no database read. It is the one unauthenticated
endpoint in the app, so it must be incapable of leaking anything.

`railway.json` declares the build (`npm ci && npm run build`) and start (`npm start`) commands and
`/api/health` as the healthcheck path, so the platform never has to guess.

**Codex does not touch** `.env`, `next.config.ts`'s `allowedDevOrigins` (dev-only, harmless in
production), or anything in `lib/`. No migration runs automatically on deploy — schema changes stay a
deliberate local `npm run db:migrate` (E3).

## 2. The human's part, in Railway's dashboard

**Before anything: generate a new `SECRET_TOKEN`.**

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The current one was pasted into a planning conversation on 2026-09-17 and must not become the lock on
a public URL. Use the new value on Railway **and** in local `.env` so both match.

1. **New service** in the same Railway project as the Postgres database, from the GitHub repo
   `SahilSaxena007/Mynd`, branch `main`. Pushes to `main` then deploy automatically.
2. **Variables** on that service — all of them, or the app fails closed and refuses to work:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the **internal** Postgres URL (`…@postgres.railway.internal:5432/…`) — S3 |
   | `SECRET_TOKEN` | the newly generated one |
   | `ANTHROPIC_API_KEY` | the same key |
   | `MODEL_PROVIDER` | `anthropic` |
   | `ORGANIZE_MODEL` | `claude-haiku-4-5` |
   | `ANSWER_MODEL` | `claude-sonnet-5` |
   | `GRADER_MODEL` | `claude-haiku-4-5` |
   | `MAX_TOKENS_PER_CALL` | `8000` |
   | `MAX_CALLS_PER_RUN` | `50` |
   | `DAILY_CALL_CAP` | `500` |
   | `USER_TIMEZONE` | `Europe/London` |
   | `ROUTE_THINKING_BUDGET` | `2048` |

   No `ROUTE_MODEL`. Setting it to anything but a budget-thinking model makes routing refuse.
3. **Generate a domain** for the service. That URL is Mynd.
4. Leave local `.env` pointing at the **public** database URL — the internal hostname only resolves
   inside Railway.

## 3. Verification

1. `https://<the domain>/api/health` returns `{"ok":true}` in a browser.
2. On the **phone, on mobile data with Wi-Fi off**: open the domain, unlock with the new token,
   dictate a thought, send. The box clears; the Captures tab shows it as `pending`.
3. Close the laptop entirely. Repeat step 2. It still works — that is the whole point of this slice.
4. The old token no longer unlocks it.
5. `npm run vault:print` locally still shows the same vault: one database, two front doors.
6. Push a trivial change to `main` and confirm Railway redeploys.

## 4. What this deliberately does not do

No cron (3c). No vault or note screens (slice 4). No PWA manifest or icons yet (B3 — slice 4, now
possible because of HTTPS). No rate limiting, and no accounts: the URL is public and the single
token is the only lock (S7). Organise still runs from the laptop by hand until 3c.

## 5. Note for slice 4

Now that the app is public, the vault screens must keep the slice-2 pattern: **pages render without
data, and the browser fetches vault content with the token in a header.** A server component that
reads the database during render would serve notes to anyone who opens the URL, because the token gate
is client-side. This is the one way slice 4 could quietly undo S7.

Next: slice 4 (vault and note screens), then 3c (the cron).
