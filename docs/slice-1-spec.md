# docs/slice-1-spec.md — Slice 1: Schema + DB layer + spend protection

**Goal of this slice:** the 5 tables exist in Postgres, you can read/write them through a
typed data layer, a couple of seed folders are present, and spend protection is switched
on. Nothing user-facing yet — this is the foundation everything else stands on.

**Definition of done:** you can run a smoke script that inserts a capture, creates a
folder and a note, links them, reads them back, and lists active rules — all through
`lib/db/`, with no SQL anywhere else. The Anthropic monthly spend cap is set.

---

## D-ORM — I AM GOING WITH OPTION B (plain `pg` + raw SQL)

How the data layer talks to Postgres:

- **Option A — Drizzle ORM + node-postgres (recommended).** Schema defined in TypeScript,
  fully type-safe queries (rows come back typed), migrations generated for you. Modern,
  lightweight, Claude Code writes it fluently, and it scales with the app.
- **Option B — plain `pg` + raw SQL.** Simplest to read, zero abstraction, you see exactly
  what runs — but no type safety, and you hand-write migrations.
  Recommendation: **A (Drizzle)** — the type safety prevents a whole class of bugs for very
  little overhead, and you'll still see the SQL it generates. The DDL below is the target
  either way.

---

## 1. Schema (the target — Drizzle expresses this, or use as raw SQL)

```sql
create extension if not exists "pgcrypto";  -- gen_random_uuid()

create table captures (
  id           uuid primary key default gen_random_uuid(),
  body         text        not null,            -- raw dictated text, exactly as sent
  kind         text        not null default 'text',  -- future: image | link | video
  captured_at  timestamptz not null,
  device       text,                            -- 'phone' | 'laptop'
  status       text        not null default 'pending', -- pending | processed | failed
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,             -- lowercase-hyphen
  description text,                             -- purpose + grouping rule (organizer reads this)
  color       text,                             -- hex, for the coloured folder grid
  parent_id   uuid references folders(id),      -- hierarchy; null = top level
  created_at  timestamptz not null default now()
);

create table notes (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references folders(id),
  title      text not null,                     -- content-based name
  summary    text,                              -- one-line "what this note is about"
  body       text not null,                     -- Markdown
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- future: embedding vector(1536)  (pgvector, added when vaults get large)
);

create table note_sources (                     -- provenance, many-to-many
  note_id    uuid not null references notes(id) on delete cascade,
  capture_id uuid not null references captures(id),
  primary key (note_id, capture_id)
);

create table rules (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                    -- route | rename | group | exclude
  instruction text not null,                    -- the user's own words
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index on captures (status);
create index on notes (folder_id);
create index on note_sources (capture_id);
```

## 2. Files to create this slice

```
lib/db/
  client.ts     # Postgres connection (pool). Reads DATABASE_URL. Exports the db handle.
  schema.ts     # (Drizzle) the 5 tables as above  — OR  schema.sql for raw pg
  queries.ts    # ALL data access — typed functions, listed below. No SQL outside here.
  seed.ts       # inserts the starter folders below
scripts/
  smoke.ts      # the acceptance test (see §4)
lib/
  auth.ts       # requireToken(req): checks SECRET_TOKEN header. (Stub used from slice 2.)
```

## 3. `queries.ts` — the function contracts (implement exactly these)

```
// captures
insertCapture({ body, kind?, capturedAt, device? }) -> Capture
getPendingCaptures() -> Capture[]
markCaptureProcessed(id) -> void

// folders
listFolders() -> Folder[]
getFolderBySlug(slug) -> Folder | null
createFolder({ name, slug, description?, color?, parentId? }) -> Folder

// notes
getNoteSummaries() -> { id, title, summary, folderId }[]   // for append-vs-create later
getNote(id) -> Note | null
getVault() -> { folders: Folder[], notes: NoteMeta[] }     // for the home screen later
createNote({ folderId, title, summary?, body }) -> Note
appendToNote(id, block) -> Note                            // SAFE append: never rewrites old body

// links
linkNoteToCapture(noteId, captureId) -> void

// rules
listActiveRules() -> Rule[]
createRule({ kind, instruction }) -> Rule

// transaction helper (used by the organizer in slice 3)
withTransaction(fn) -> Promise<T>
```

## 4. Acceptance test — `scripts/smoke.ts`

Runs against the real DB and must pass end-to-end:

1. `insertCapture({ body: "test dump", capturedAt: now, device: "laptop" })`
2. `createFolder({ name: "Journal", slug: "journal", description: JOURNAL_DESC, color: "#6aa5b8" })`
3. `createNote({ folderId, title: "2026-01-01", summary: "journal for the day", body: "# 2026-01-01\n- test" })`
4. `linkNoteToCapture(noteId, captureId)`
5. `appendToNote(noteId, "- second entry")` → assert the ORIGINAL body is still present
   (proves safe-append).
6. `getPendingCaptures()` returns the capture; `markCaptureProcessed(id)`; now returns none.
7. `listActiveRules()` returns `[]`; `createRule(...)`; now returns one.
   Print PASS/FAIL per step. Green across the board = slice 1 done.

## 5. Seed folders (`seed.ts`) — demonstrates description-carries-grouping

Insert just these two so the grouping-rule-in-description pattern is visible; the organizer
creates all other folders as needed later.

- **Journal** — slug `journal`, color `#6aa5b8`, description:
  `"Daily journal and personal reflections. GROUPING: one note per calendar day, titled by date (YYYY-MM-DD). Same-day entries append to that day's note."`
- **Inbox** — slug `inbox`, color `#c9a86a`, description:
  `"Catch-all for items the organizer could not confidently place. GROUPING: one note per item; review and re-file later."`

## 6. Out of scope for slice 1 (do not build)

No screens, no API routes wired to the client, no model calls, no organizer, no cron.
Just the schema, the typed data layer, the seed, and the smoke test. Next up: slice 2
(capture endpoint + capture screen).
