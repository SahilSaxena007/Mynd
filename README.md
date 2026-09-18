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

## Running

The current implementation is slice 1: the five Postgres tables, a typed plain `pg`
data layer, Journal/Inbox seed folders, and the database smoke test.

1. Run `npm install` (Node.js 20.9 or newer).
2. Set `DATABASE_URL` in the root `.env`; use `.env.example` when setting up a new checkout.
3. Run `npm run db:check` to verify connectivity with a read-only `SELECT 1`.
4. Run `npm run db:migrate` to create the five tables and indexes in one transaction.
5. Run `npm run db:seed` to insert Journal and Inbox (safe to repeat; preserves edits).
6. Run `npm run smoke` for the acceptance test against the configured database.
7. Run `npm run dev` and open http://localhost:3000 for the existing placeholder page.

`npm run lint`, `npm run typecheck`, and `npm run build` verify the scaffold.

The server-side pool lives in `lib/db/client.ts` and is obtained via `getDb()`.
Next.js loads `.env` automatically; the standalone connection check uses `@next/env`
before opening the pool. Database credentials are never printed by the check.
All SQL stays in `lib/db/`. There is no ORM.

## Slice 1 database layer

`lib/db/schema.sql` contains the five vault tables plus the slice-3a `model_calls`
ledger. The migration uses named indexes and `IF NOT EXISTS` throughout, so it can
add missing tables and indexes without rebuilding or changing existing data.

`lib/db/queries.ts` exports every query contract from the spec. Returned fields use
camelCase, timestamps are `Date` objects, and nullable columns return `null`.
`getVault()` returns note metadata without bodies. Missing note/slug lookups return
`null`; append/process operations throw if the target is missing.

Use `withTransaction(async () => { ... })` with the normal exported query functions.
Async context binds those calls to one checked-out connection; any thrown error
rolls back all writes. Await every call. Nested transactions are explicitly rejected.
This follows the [node-postgres transaction requirement](https://node-postgres.com/features/transactions)
that all statements share one client. Appending concatenates the block in one SQL
update, preserving the original body and avoiding concurrent read/overwrite loss.

The smoke test runs the seven specified steps in an isolated schema in the real
database, then rolls it all back. It also verifies rollback on a foreign-key error,
committed/repeatable seeds, and the token stub. Only the two seed folders persist.
The database role needs schema-creation permission for this test.

`lib/auth.ts` provides the slice 1 `requireToken(req)` stub for the `SECRET_TOKEN`
header; no routes are wired yet. No model calls, organizer, cron, or new screens
are included. The Anthropic monthly spend cap was confirmed set by the owner.
The `MAX_TOKENS_PER_CALL`, `MAX_CALLS_PER_RUN`, and `DAILY_CALL_CAP` environment
settings remain prerequisites for the model-layer enforcement before any model
calls ship in slice 3; no model spending is possible in this slice.

Setup references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation),
[environment loading](https://nextjs.org/docs/app/guides/environment-variables), and
[node-postgres connections](https://node-postgres.com/features/connecting).

Build order is in `ARCHITECTURE.md`; do one slice at a time.

## Slice 3a split preview

`npm run split:preview -- --dry` gathers pending captures without calling a model.
`npm run split:preview -- --id <uuid>` previews one pending capture;
`--limit 5` selects the five most recent pending captures. With no flags, it previews
all pending captures until the run budget stops it. Commands without `--dry` cost money.
Set the provider, model, and all three spend limits from `.env.example` first.

Results and the exact prompt are saved under gitignored `.runs/`. Word coverage is
a lexical diagnostic, not the no-loss guarantee. The preview leaves captures pending
and never writes notes, folders, or sources; only model-call accounting is persisted.

Free checks: `npm run typecheck`, `npm run lint`, `npm run build`, two consecutive
`npm run db:migrate` invocations, and `npm run split:preview -- --dry`.
`node --import tsx --test lib/model/model.test.ts` checks spend protection with fake
HTTP and database access; it cannot spend money.

Manual paid checklist (owner only): run one capture by id, read each item for a single
topic, check for invented or missing content, and confirm gibberish is preserved
verbatim. Check the ledger's model, job, token counts, and nonzero cost, and confirm
captures remain pending with no new vault content. Repeat the limit cases in
`docs/slice-3a-spec.md`; adjust only `lib/prompts/split.ts` when tuning split behaviour.
