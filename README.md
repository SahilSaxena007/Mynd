# Vault

A personal second brain that files itself. Dump a messy thought by voice; it organizes
that dump into your own folder structure — losing nothing, inventing nothing — and answers
questions from your notes without hallucinating.

One Next.js web app (installable as a PWA on phone + laptop) · one Postgres database ·
deployed on Railway. Single user, one secret token, for now.

## How it works — three paths, one database
1. **Capture** (instant, no AI): tap the mic, dictate via Wispr, send. The raw text lands
   in an inbox. Nothing is organized here.
2. **Organize** (background, automatic — the moat): a scheduled job decomposes each dump
   into single-topic items and files each into the right folder, safely and losslessly.
3. **View & Ask** (on demand): browse your organized vault; ask questions answered only
   from your notes.

## Docs (read in this order)
- `AGENTS.md` — how any AI agent must work in this repo (rules, guardrails). **Start here.**
- `ARCHITECTURE.md` — the full design: data model, the organize pipeline, cost levers.
- `vault-architecture.mmd` — the whole-app diagram (open in mermaid.live or VS Code).
- `docs/slice-1-spec.md` — the current build slice.

## Non-negotiables (the product IS these)
No silent loss · vault never half-written · never add information · one topic per note ·
answers never fabricated. Guarantees live in code; judgment lives in prompts.

## Running (filled in as slices land)
- `.env` from `.env.example` (DB URL, model key, secret token, spend caps).
- Build order is in `ARCHITECTURE.md`; do one slice at a time.
