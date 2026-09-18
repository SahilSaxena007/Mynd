# docs/slice-2-spec.md — Slice 2: Capture endpoint + capture screen + captures log (Path 1)

**Goal of this slice:** you can stand anywhere with your phone, dictate a messy thought,
send it, and see it sitting in your inbox. Instant, no AI, nothing organised.

**Definition of done:** on your phone, unlocked with the secret token, you dictate into the
capture screen with Wispr, hit Send, the box clears — and the captures log shows that dump
at the top, marked `pending`. A failed send leaves your text untouched in the box.

This is the first slice with a user-facing surface, and the first consumer of
`lib/auth.ts::requireToken` (written in slice 1, called by nothing until now).

---

## Decisions settled for this slice (logged in `docs/DECISIONS.md` 2026-09-15)

- **CAP1 — No speech code.** The capture screen is a big autofocused textarea. Wispr (or the
  iOS keyboard mic key) types into it. Mynd ships no Web Speech API, no mic button, no audio
  handling. No audio ever reaches our server.
- **CAP2 — Send is not optimistic.** The textarea clears only after a 2xx. On any failure the
  text stays exactly where it is, with the error shown and Send still available.
- **CAP3 — The captures log ships in this slice**, not later, so the slice is verifiable on
  the phone rather than only at a terminal.
- **S9 — Token in `localStorage`, sent as a header.** One unlock screen on first visit; no
  cookies, no login route, no session.
- **DM6 — The server sets `captured_at`**; any client-supplied value is ignored.
- **CAP5 — The capture draft persists in `localStorage`** and is cleared only after a
  confirmed write, so no reload or tab discard can eat a half-dictated thought.
- **CAP6 — Unlock verifies the token** against an authenticated endpoint before storing it;
  a wrong token never reaches the capture screen.

---

## 1. Files to create this slice

```
app/
  capture/page.tsx          # [UI] the capture doc: textarea + Send        [→UICapture]
  captures/page.tsx         # [UI] raw dump log, newest first, with status [→UICaptures]
  layout.tsx                # [UI] MODIFY: bottom tabs (Vault | Capture | Captures)
  api/
    capture/route.ts        # [CODE] POST /api/capture   → insertCapture   [→EP1/C1-C3]
    captures/route.ts       # [CODE] GET  /api/captures  → listCaptures
components/
  token.ts                  # [CODE] client-only get/set/clear token in localStorage
  draft.ts                  # [CODE] client-only draft store; survives reload (CAP5)
  TokenGate.tsx             # [UI] renders the unlock form, or its children once unlocked
lib/
  auth.ts                   # [CODE] MODIFY: add withAuth() wrapper around requireToken
  db/queries.ts             # [CODE] MODIFY: add listCaptures()
scripts/
  smoke-capture.ts          # the HTTP-level acceptance test (see §6)
```

No model calls. No organiser. No cron. No vault home, no note view.

## 2. `lib/db/queries.ts` — the one new contract

```
listCaptures(limit?: number) -> Capture[]    // newest first; default limit 100
```

Ordered `captured_at DESC, id DESC`. Nothing else in `lib/db/` changes — the schema,
`insertCapture`, and `withTransaction` already do everything this slice needs. All SQL stays
in this file.

_Note for later:_ there is no index on `captures (captured_at)`. Irrelevant at slice-2
volume; add one when the log gets slow or gains paging.

## 3. `lib/auth.ts` — the one modification

`requireToken(req)` already works, but it signals failure by **throwing a `Response`**, which
every route would otherwise have to catch by hand. Add one wrapper beside it so all seven
eventual endpoints share one auth path:

```
withAuth(handler: (req: Request) => Promise<Response>) -> (req: Request) => Promise<Response>
```

It runs `requireToken(req)`; if a `Response` is thrown it returns that response; if a real
`Error` is thrown (e.g. `SECRET_TOKEN` unset) it logs server-side and returns a bare 500 that
leaks nothing. `requireToken` itself is not rewritten.

## 4. The two endpoints

### `POST /api/capture`

- Auth: `withAuth`. Header name is `SECRET_TOKEN`, matching the existing stub.
- Accepts JSON: `{ body: string, device?: "phone" | "laptop" }`.
- Validation (400 on failure, with a short reason):
  - `body` must be a string, non-empty after trimming.
  - `body` is capped at 100,000 characters, so a misfired paste can't land a novel.
  - `device` is accepted only as `"phone"` or `"laptop"`; anything else is stored as `null`.
  - `kind` is **not** accepted from the client — always `'text'`. The column stays reserved
    for future media (X1).
  - `captured_at` is **not** accepted from the client — the server passes `new Date()` (DM6).
- On success: `201` with `{ id, capturedAt }`. The row lands with `status = 'pending'`,
  which is what slice 3's organiser will pick up.
- The stored `body` is the trimmed text, byte-for-byte as dictated. No cleanup, no
  normalisation, no "helpful" edits — `captures` is immutable raw source (DM1).
- Errors: `401` unauthorised · `400` invalid input · `500` otherwise. A 500 never echoes the
  database error to the client; it is logged server-side.

### `GET /api/captures`

- Auth: `withAuth`.
- Returns `{ captures: Capture[] }` via `listCaptures()`.
- Read-only. There is no edit or delete endpoint, and no DELETE statement anywhere in the
  codebase — captures are immutable (DM1/CAP4).

## 5. The three screens

### `app/capture/page.tsx` — client component at `/capture`

Vault at `/` remains the home screen. Capture is reached through navigation, never a
redirect from `/`. The Capture tab provides that navigation in slice 2.
A full-height autofocused textarea and a Send button. Nothing else.

```
  ┌──────────────────────────────┐
  │                              │
  │  [ big autofocused textarea ]│
  │       ← Wispr types here     │
  │                              │
  └──────────────────────────────┘
            [    Send    ]
```

Behaviour:

- Send is disabled while the text is empty or a request is in flight (no double-send).
- On 2xx: clear the textarea, refocus it, show a brief confirmation. Ready for the next
  thought immediately — that is the whole point of Path 1.
- On any failure (network, 4xx, 5xx): **keep the text**, show the error, leave Send enabled
  so you can simply press it again (CAP2).
- The draft is held in `localStorage`, not React state, so it also survives a page reload,
  a pull-to-refresh, a tab discard, and a dev-server restart. It is cleared **only** on a
  confirmed 2xx. One draft, no queue, no retry — this is not the deferred offline capture
  (CAP5, X1).
- On 401: clear the stored token and drop back to the unlock screen.
- `device` is set from a coarse client check and is cosmetic metadata only.

### `app/captures/page.tsx` — client component, the inbox

Fetches `GET /api/captures` on mount and lists them newest-first: time, status dot, and the
raw text. Read-only, no organising, no editing.

```
  Captures
  ──────────────────────────────
  today 14:22        ● pending
  "call mum about the thing and
   also book the dentist"
  ──────────────────────────────
```

Empty state says so plainly rather than rendering a blank page.

### `app/layout.tsx` — modify

Add the bottom tab bar from the skeleton. **Vault** stays the existing slice-1 placeholder
(it becomes real in slice 4); **Capture** and **Captures** are live this slice.

### `components/TokenGate.tsx` + `components/token.ts`

On first visit, one field and an Unlock button. Unlock does **not** simply store what was
typed: it first calls `GET /api/captures` with the candidate token and stores it only on a
`200`. A `401` shows "That token isn't right" and stays on the unlock screen; a network
error or `5xx` shows a distinct "Can't reach the server" so an unreachable server is never
misreported as a bad token (CAP6). Once stored, the token is sent
as the `SECRET_TOKEN` header on every request. Both screens render inside the gate. Every
`localStorage` access is wrapped so a private window or blocked site data shows the unlock
form rather than crashing the page.

## 6. Acceptance test — `scripts/smoke-capture.ts`

Runs against a **running dev server** (`BASE_URL`, default `http://localhost:3000`) and the
real database. Prints PASS/FAIL per step.

1. `POST /api/capture` with no token → `401`.
2. `POST /api/capture` with a wrong token → `401`.
3. `POST` with a valid token and `{ body: "" }` → `400`.
4. `POST` with a valid token and `{ body: "smoke test — dump", device: "laptop" }` → `201`,
   returns an id.
5. Read that row back through `lib/db/` → `status = 'pending'`, `kind = 'text'`,
   `captured_at` within a few seconds of now, `body` exactly as sent.
6. `POST` with `{ body: "x", kind: "image", capturedAt: "1999-01-01" }` → the stored row is
   still `kind = 'text'` with a current `captured_at` (proves the client can't set either).
7. `GET /api/captures` with a valid token → the new capture is present and first in the list.
8. `GET /api/captures` with no token → `401`.

**No cleanup step. Nothing in Mynd deletes a capture, ever** — not the app, not a script.
The rows this test creates stay in the inbox as real `pending` captures and are organised
by slice 3 like any other dump; they are prefixed `smoke test —` so they are obvious in the
log. Re-running the script adds more rows rather than replacing any.

Manual verification, on the phone, is the part that actually matters:
unlock once → dictate with Wispr → Send → box clears → open Captures → it's there, `pending`.
Then turn off wifi, dictate, Send → the text stays in the box with an error. That is CAP2
working.

`npm run lint`, `npm run typecheck`, and `npm run build` must all be clean.

## 7. Out of scope for slice 2 (do not build)

No model calls, no `lib/model/`, no organiser, no cron — captures just accumulate as
`pending` until slice 3. No vault home or note view (slice 4). No ask (slice 5). No quick
calls or rules (slice 6). No editing or deleting captures from the UI. No offline queue or
retry buffer — that is deferred offline capture (X1). No PWA manifest or install icons yet:
slice 2 runs fine in a browser tab, and the manifest is worth adding in slice 4 when there
is a real shell worth installing. No UI polish beyond legible and thumb-reachable.

Next up: slice 3 (model layer + spend guard + organiser + cron).
