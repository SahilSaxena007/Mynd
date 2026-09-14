# ARCHITECTURE.md — Vault design reference

The whole-app diagram is `vault-architecture.mmd` (open in mermaid.live). This doc is the
text reference you return to while building.

## Shape: 3 layers
- **`app/`** — the five screens (vault-home, capture, captures-log, note, quick-calls) and
  the seven API endpoints. Thin: screens call endpoints, endpoints call `lib/`.
- **`lib/`** — the brains. Every rule and guarantee physically lives here.
- **`jobs/`** — the scheduled trigger for the background organizer.

Full file-by-file map: see `vault-codebase-skeleton.md`.

## Data model — 5 tables (Postgres)
- **captures** — raw dumps, immutable. `status` (pending|processed|failed) is the GTD
  pipeline. `kind` reserved for future image/link/video.
- **folders** — the vault structure. `description` carries each folder's purpose AND its
  grouping rule (e.g. a journal folder: "one note per day, same-day entries append").
  `color` for the folder grid; `parent_id` for hierarchy.
- **notes** — organized atomic notes. `title` (content-based), `summary` (one line, used
  to decide append-vs-create), `body` (Markdown). Embedding column reserved for later.
- **note_sources** — many-to-many notes↔captures (provenance). One note can be built from
  many captures; one capture can feed many notes. This is what lets a topic accumulate
  across days. Also how the coverage check verifies nothing was dropped.
- **rules** — the user's corrections, in their own words. Read at the start of every
  organize run. This is the learn-from-you loop.

## The organize pipeline — 4 stages (alternating code/AI)
- **Stage 0 — Gather [CODE]:** read pending captures, folders(+descriptions/grouping),
  note summaries, active rules.
- **Stage 1 — Split [AI, prompt #1]:** decompose each capture into single-topic items.
  Rules: one topic each; split only, never invent.
- **Pool:** all items from the run are pooled so items from different captures can join
  one topic-thread.
- **Stage 2 — Route & write [AI, prompt #2]:** pick folder by its description, obey the
  folder's grouping rule, decide append-vs-create via note summaries, apply user rules,
  write Markdown, emit a confidence per item. Rules: one topic; NEVER add info. Output is
  a PLAN — no writes yet.
- **Stage 3 — Verify & apply [CODE]:** coverage check (every Stage-1 item present, filed
  OR queued → else abort, write nothing); confidence gate (high → auto-file, low → hold
  in quick-calls); then one transaction: create folders, safe-append/create notes, insert
  note_sources, mark captures processed.

v1 model choice: ONE model, but Stage 1 and Stage 2 are two separate prompts with isolated
context. Safe-append (never regenerate a whole note) in v1.

## Where the rules live (file → guarantee)
- No silent loss → `lib/organizer/coverage.ts` (code).
- Never half-written → transaction in `lib/organizer/stage3-apply.ts` (code).
- One topic per note → `lib/prompts/split.ts` + `lib/prompts/route.ts`.
- Never add info → `lib/prompts/route.ts`; measured by `lib/grader/evaluate.ts` (offline).
- Ask never fabricates → `lib/prompts/answer.ts` + `lib/ask/answer.ts`.

## Cost levers (keep 80–90% margins)
- Route the high-volume split to the cheapest capable model; reserve stronger for
  route/answer. (One line in `lib/model`.)
- Prompt caching on the repeated organize context (~90% off that input).
- Batch API for the background organize job (~50% off; it's async anyway).
- Embeddings before vaults get large — load *relevant* notes, not *all* (cost + search).
- Grader runs on a sample, or off, once trusted.

## Build order (each slice runs & is verified before the next)
1. Schema + `lib/db/` — the 5 tables exist, CRUD works.  ← current: `docs/slice-1-spec.md`
2. `api/capture` + capture screen — dump a thought from the phone. (Path 1.)
3. `lib/model/` + `lib/organizer/` + `jobs/organize-cron.ts` — the sorter runs. (Path 2.)
4. Vault home + note view — see the organized result. (The magic moment.)
5. `api/ask` + `lib/ask/` — ask questions. (Path 3.)
6. quick-calls + rules — the unsure queue and learning loop.
7. `lib/grader/` — turn on measurement.

## Deferred (do NOT build in v1)
Native capture widget · accounts/multi-user · offline · embeddings · image/link/video ·
note links (Wiki stage) · multi-lens views · UI polish.
