# AGENTS.md — instructions for any AI agent working in this repo

This is the single source of truth for how to work in the Vault codebase. Claude Code,
Codex, and any other agent: read this first, every session. `CLAUDE.md` points here.

## What Vault is (one paragraph)
Vault is a personal "second brain" that files itself. The user dumps a messy thought by
voice (one web app, phone + laptop). A background job organizes each dump into their
personal folder structure — losing nothing, never inventing anything — and answers
questions from the notes without hallucinating. It is ONE Next.js web app (installable
as a PWA on both devices) talking to ONE Postgres database on Railway. Single user, one
secret token, for now.

Full design: read `ARCHITECTURE.md` and `vault-architecture.mmd` before writing code.

## The non-negotiable rules (these define the product — never violate them)
1. **No silent loss.** Every atomic item from a capture must land somewhere. This is
   enforced by CODE (a coverage check), never by trusting a model to self-check.
2. **The vault is never half-written.** All database writes for one organize run happen
   in a single transaction — all or nothing.
3. **Never add information.** The organizer may rephrase and restructure, but must never
   introduce a fact, step, or detail not present in the source capture.
4. **One topic per note.** When decomposing, each atomic item is exactly one topic; a
   note never mixes topics.
5. **Ask never fabricates.** Question-answering uses ONLY the user's notes; if the answer
   isn't there, it says "not in your notes" and cites sources when it is.

## The core architectural principle
**The LLM makes decisions; code makes guarantees.** A model may decide what's atomic,
which folder something belongs in, or how to phrase a note. A model must NEVER be
responsible for a guarantee (no-loss, no-partial-write). Guarantees live in code files;
judgment lives in prompt files.

## Conventions
- **Language:** TypeScript everywhere.
- **Prompts live in `lib/prompts/*` — separate from code.** Tune organization quality by
  editing prompt text, never by changing pipeline logic.
- **All SQL lives in `lib/db/` — nowhere else.** No raw queries scattered in routes.
- **The model is always called through `lib/model/` (the swappable layer).** Never import
  a provider SDK directly elsewhere. This is what lets us route cheap/strong models and
  swap providers without rewrites.
- **Spend guard is mandatory** (see below). No model call bypasses it.
- Keep files small and single-purpose; match the layout in `ARCHITECTURE.md`.

## Spend protection (must exist before ANY model calls ship)
- Every call through `lib/model/` enforces: max tokens per call, max calls per organize
  run, and a daily call ceiling — values from env (`MAX_TOKENS_PER_CALL`,
  `MAX_CALLS_PER_RUN`, `DAILY_CALL_CAP`). On breach: refuse the call, log, do not retry.
- This is in addition to the provider-side monthly spend cap the human sets in the
  console. Both layers must exist.

## Cost defaults (keep margins high)
- Route the high-volume split step to the cheapest capable model (Haiku, or benchmark
  Gemini Flash). Reserve the stronger model for routing/answering.
- Use prompt caching for the repeated organize context (folder catalog, note summaries,
  system prompt).
- Run the background organize job through the Batch API (it's async by nature).

## What NOT to build yet (explicitly deferred — do not scope-creep into these)
Native float-anywhere capture widget · real accounts / multi-user · offline capture ·
embeddings / semantic search (fine to load relevant notes directly at low-hundreds) ·
image/link/video capture (schema seat reserved via `captures.kind`) · note-to-note links
(Zettelkasten / Wiki stage) · multi-lens (Time/Alphabet) views · beautiful UI polish.
If a task seems to require one of these, STOP and ask the human.

## How to work
- Build in the small testable slices defined in `ARCHITECTURE.md` — one slice runs and is
  verified before the next. No big-bang builds.
- The human makes design decisions; you execute. When a real design choice appears
  (a fork with tradeoffs), surface it and ask rather than picking silently.
- Current slice is named in `docs/` (start: `slice-1-spec.md`). Do only the current slice
  unless told otherwise.
