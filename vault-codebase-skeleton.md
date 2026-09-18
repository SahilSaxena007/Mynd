# Vault — Codebase Skeleton (v1 build spec)

Stack: Next.js (App Router, React + TypeScript) · Postgres (Railway) · one swappable
model layer · deployed on Railway. Single user, one secret token.

Legend for the map below:
  [CODE]  = deterministic, makes GUARANTEES (no AI)
  [AI]    = a model call, makes JUDGMENTS
  [UI]    = a screen the user sees
  [→box]  = which box in vault-architecture.mmd this implements

```
vault/
├─ app/                                  # SURFACES + API DOORS (thin layer)
│  ├─ layout.tsx                         # [UI] app shell, bottom tabs (Vault | Captures)
│  ├─ page.tsx                           # [UI] VAULT HOME — coloured folder grid  [→UIVault]
│  ├─ capture/page.tsx                   # [UI] capture doc: mic → Wispr text → Send  [→UICapture]
│  ├─ captures/page.tsx                  # [UI] raw voice-note log, time-ordered  [→UICaptures]
│  ├─ note/[id]/page.tsx                 # [UI] open one note, rendered Markdown, editable  [→UIVault/EP3]
│  ├─ quick-calls/page.tsx              # [UI] the ~10% unsure items, pick an option  [→UIQueue]
│  ├─ (components used across pages live in /components)
│  └─ api/                               # THE SEVEN ENDPOINTS
│     ├─ capture/route.ts                # [CODE] POST /capture → Path 1 (insert, return)  [→EP1/C1-C3]
│     ├─ vault/route.ts                  # [CODE] GET /vault → folders + notes  [→EP2/V1]
│     ├─ note/[id]/route.ts              # [CODE] GET /note/:id  [→EP3]
│     ├─ ask/route.ts                    # [CODE] POST /ask → calls lib/ask  [→EP4/A1]
│     ├─ rules/route.ts                  # [CODE] POST /rules → save a correction  [→EP5]
│     ├─ organize-now/route.ts           # [CODE] POST /organize-now → runOrganize()  [→EP6/O0]
│     └─ quick-calls/route.ts            # [CODE] GET + POST → list & resolve unsure items  [→EP7]
│
├─ lib/                                  # THE BRAINS — every rule & guarantee lives here
│  ├─ db/
│  │  ├─ client.ts                       # [CODE] Postgres connection pool
│  │  ├─ schema.sql                      # [CODE] the 5 tables (captures, folders, notes,
│  │  │                                  #        note_sources, rules) + folders.color/description
│  │  └─ queries.ts                      # [CODE] typed read/write helpers (no SQL scattered elsewhere)
│  │
│  ├─ organizer/                         # PATH 2 — the four-stage pipeline
│  │  ├─ index.ts                        # [CODE] runOrganize(): orchestrates stages 0→1→2→3
│  │  ├─ stage0-gather.ts                # [CODE] read pending captures, folders(+desc/grouping),
│  │  │                                  #        note summaries, active rules  [→OS0]
│  │  ├─ stage1-split.ts                 # [AI]   prompt #1: decompose each capture into 1-topic items
│  │  │                                  #        rules enforced: one topic, split-only-never-invent  [→OS1]
│  │  ├─ stage2-route.ts                 # [AI]   prompt #2: route by folder DESCRIPTION, obey folder
│  │  │                                  #        grouping rule, append-vs-create, apply user rules,
│  │  │                                  #        write Markdown, NEVER add info, emit confidence  [→OS2]
│  │  ├─ coverage.ts                     # [CODE] THE NO-LOSS GUARANTEE: plan items == stage1 items  [→OS3a]
│  │  └─ stage3-apply.ts                 # [CODE] confidence gate (≥thresh→file, <thresh→quick-calls),
│  │                                     #        then single Postgres TRANSACTION: folders, notes
│  │                                     #        (safe-append), note_sources, mark processed  [→OS3b/OTX/OQUEUE]
│  │
│  ├─ ask/
│  │  └─ answer.ts                       # [AI]   PATH 3: gather relevant notes + pending captures,
│  │                                     #        answer ONLY from them, cite source, no fabrication  [→A1/A2]
│  │
│  ├─ model/                             # THE SWAPPABLE LAYER (route/split later w/o rewrites)
│  │  ├─ index.ts                        # [CODE] interface: complete(prompt, {model, cache, batch})
│  │  ├─ anthropic.ts                    # [CODE] Claude implementation (Haiku/Sonnet)
│  │  └─ gemini.ts                       # [CODE] (later) cheap-path implementation
│  │
│  ├─ prompts/                           # PROMPT TEXT — separate from code, tune the moat here
│  │  ├─ split.ts                        # Stage 1 prompt
│  │  ├─ route.ts                        # Stage 2 prompt  ← the organization quality lives here
│  │  ├─ answer.ts                       # Ask prompt
│  │  └─ grader.ts                       # D3 test-agent prompt
│  │
│  ├─ grader/
│  │  └─ evaluate.ts                     # [AI] OFFLINE: score added-info / dropped-info, report only,
│  │                                     #      NEVER writes to the vault  [→TEST/G1-G3]
│  │
│  └─ auth.ts                            # [CODE] single secret-token check on every endpoint
│
├─ jobs/
│  └─ organize-cron.ts                   # [CODE] scheduled trigger (~2x/day) → runOrganize()  [→O0]
│
├─ components/                           # [UI] FolderGrid, NoteView, MicButton, AskBar, QuickCallCard
│
├─ .env                                  # DATABASE_URL, MODEL_API_KEY, SECRET_TOKEN
├─ package.json
└─ railway.json (or Dockerfile)          # deploy config (app + Postgres + cron)
```

## Where the load-bearing rules physically live (so you always know what to open)

- The **no-silent-loss guarantee** → `lib/organizer/coverage.ts` (code, not a prompt).
- The **never-half-written guarantee** → the transaction in `lib/organizer/stage3-apply.ts`.
- **One-topic-per-note** → enforced twice: `prompts/split.ts` and `prompts/route.ts`.
- **Never add information** → `prompts/route.ts`, and independently measured by `lib/grader/evaluate.ts`.
- **Ask never fabricates** → `prompts/answer.ts` + `lib/ask/answer.ts`.
- **The organization quality (the moat)** → `prompts/route.ts`. You will edit this file more than any other.
- **The learn-from-you loop** → `api/rules/route.ts` + `api/quick-calls/route.ts` both write the
  `rules` table, which `stage0-gather.ts` reads next run.

## Cost levers, in code terms (do these to keep margins high)

- Route the high-volume split to the cheap model: a one-line change in `model/index.ts` per call site.
- Prompt caching for the repeated organize context: a flag on the `complete()` call in `stage2-route.ts`.
- Batch API for the background organize job: a flag set in `jobs/organize-cron.ts`.
- Embeddings (later): add `embedding` to `notes` in `schema.sql`, and change `stage0-gather.ts` +
  `ask/answer.ts` to load *relevant* notes instead of *all* — nothing else changes.

## Build order (smallest testable slices)

1. `schema.sql` + `db/` — the 5 tables exist.
2. `api/capture` + `capture/page.tsx` — you can dump a thought from your phone. (Path 1 works.)
3. `model/` + `organizer/` + `jobs/organize-cron.ts` — the sorter runs. (Path 2 works.)
4. `page.tsx` (vault) + `note/[id]` — you can see the organized result. (The magic moment.)
5. `api/ask` + `ask/answer.ts` — you can ask questions. (Path 3 works.)
6. `quick-calls` + `rules` — the unsure-queue and learning loop.
7. `grader/` — turn on measurement.

Each numbered step is independently runnable and testable before the next — no big-bang build.
