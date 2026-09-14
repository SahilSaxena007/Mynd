# CLAUDE.md

The agent instructions for this repo live in **`AGENTS.md`** — read that first, every
session. It is the single source of truth (rules, conventions, guardrails, what not to
build). This file only holds Claude-Code-specific notes so the two don't drift.

## Claude-Code notes
- Before writing code, read in order: `AGENTS.md`, `ARCHITECTURE.md`, then the current
  slice spec in `docs/` (start with `docs/slice-1-spec.md`).
- Do only the current slice. Each slice must run and be verified before the next.
- The five non-negotiable rules and "LLM decides, code guarantees" in `AGENTS.md` override
  any instinct to be clever or to save a step.
- When you hit a real design fork, stop and ask the human — don't pick silently.
- Never call a model provider SDK directly; always go through `lib/model/`. Never place
  SQL outside `lib/db/`. Never let a model be responsible for a guarantee.
