# docs/slice-8-spec.md — Slice 8: more than one person can have a vault

Written 2026-09-28. **Not the current slice** — slice 7 runs and is verified first. This is the
plumbing that makes the five-person handout possible at all, and it is the riskiest change in the
project so far because it touches every table and every query.

Three blockers, in the order they hurt a new user.

---

## S8-1 — Accounts and per-user scoping

Today there is one `SECRET_TOKEN` and no owner column anywhere. Five people would write into Sahil's
vault. Nothing else in this slice matters until this is true.

**Scope, deliberately small:** a `users` table, a per-user token, an owner column on every user-owned
table, every query in `lib/db/` scoped to it, and a per-user spend cap. **No** teams, **no** billing,
**no** OAuth, **no** password reset, **no** email verification, **no** roles.

Tables that get an owner: `captures`, `folders`, `notes`, `rules`, `quick_calls`, `organize_runs`,
`asks`. `note_sources` inherits through its note. `model_calls` gets one too, so spend can be attributed
per user — that is what the cap is enforced against.

Rules that must survive this change, restated because a scoping bug is how they break:
- **Every** `lib/db/` function takes the owner and filters on it. Not "most". A query that can return
  another user's row is the worst possible bug in this product and it will not be caught by types.
- The coverage check, the single-transaction rule, and the no-DELETE rule are unchanged. Adding a
  column must not split any existing transaction.
- The organiser runs **per user**. One user's failure must not roll back another's run, so the cron
  loops users and each user gets its own transaction. Get this wrong and rule 2 becomes a shared
  failure mode.
- `SEC3` still holds: no vault content is ever server-rendered, and the token is what the screens
  fetch with.

**Open design question — do not pick this silently, ask Sahil:** how someone signs in. A long random
token pasted once (what exists now, just per-user) is the cheapest and needs no email infrastructure; a
magic link is what a normal person expects and needs an email sender. For five hand-held users the
pasted token is probably enough, and it keeps this slice small — but it is a product decision about how
the first impression feels, so it is Sahil's call and it is the first thing to settle before writing
code.

**Migration:** existing rows belong to Sahil. Backfill a first `users` row and set every owner column to
it, then make the columns `NOT NULL`. `railway.json` runs no migration on deploy (E7), so the migration
is a deliberate step Sahil runs, and it must be idempotent and reversible — the live vault is real data
and the only copy.

---

## S8-2 — A new vault must not be born empty

`lib/db/seed.ts` seeds Sahil's six areas, including `mynd`, a project folder nobody else has. And by
design (F1) **the organiser cannot create folders**. So a new user whose life does not match those six
has everything land in Inbox forever and concludes the product does not work.

The folder set *is* the user's mental model of their own vault, so this is a product decision, not a
detail. Two options for Sahil to choose between:

- **A generic starter set** — Journal, Tasks, Work, Personal, Ideas, Inbox — seeded silently. Zero
  friction, and wrong for some people in a way they cannot fix without a Quick Call path that does not
  exist yet (Q5).
- **Three questions at signup** — "what are the areas of your life you think about most?" — which
  produces folders that fit and teaches the user what a folder is *for* in the same motion. More build,
  much better fit, and it makes the first minute feel like setup rather than an empty room.

Whichever is chosen, the folder **description** matters as much as the name: DM2 says the description
carries the grouping rule, and F3 showed that changing a description does not re-file anything. A
starter folder created with a weak description is a decision the vault keeps forever.

Note the connection to Q5: until creating a folder from a Quick Call exists, a user cannot add an area
after signup. If the answer to this is the generic set, Q5 stops being deferrable.

---

## S8-3 — Something must happen in the first session

The cron runs 07:00 and 19:00 UTC. A new user dumps four thoughts, opens the Vault, sees nothing, and
concludes it is broken — twelve hours of nothing on the one day their attention is highest. The
onboarding call has no payoff moment and slice 7's UI work is spent on a screen showing an empty vault.

Add **organise now**: a button that runs the same organise path the cron calls, for that user only.
Constraints, because this is the one place in the slice that spends money on a stranger's behalf:
- Rate-limited per user (one run per few minutes) and refused while a run is in flight.
- Subject to the existing per-call, per-run and daily caps, plus the new per-user cap from S8-1. No
  path bypasses `lib/model/`.
- It must be honest while running — the button shows real progress, and on failure it says what
  happened without exposing internals.

The first session must end at Ask. Ten dumps, organise now, then ask it a question — that is the
sequence that shows what Mynd is, and Ask is the strong half.

---

## S8-4 — Invite codes (small, do it here)

With accounts in place, an invite code is nearly free: a code Sahil generates, redeemed once, creating
a user. It is how the five get in without a signup page, it stops the public URL being an open door,
and it is the only piece of distribution machinery worth building before anyone has retained.

---

## Out of scope

Billing and pricing. Teams or sharing between users. Email beyond whatever S8-1's sign-in choice
requires. A signup page or marketing site. The organiser quality pass (RC1–RC7) and the grader
(slice 9). Sharing note content or Ask answers — see slice 7's distribution note.

---

## Verification (PR2: manual scenarios on the real device, and B12: checked against the live site)

1. Two users exist. Sign in as each in turn and confirm each sees **only** their own folders, notes,
   captures, Quick Calls, rules, asks and run history. Try fetching the other user's note id directly
   with your own token — it must 404 or 403, never return content. This is the check that matters most
   in the whole slice and it is done against the live site.
2. A brand-new user has a usable folder set with real descriptions, and can file something into it.
3. A new user captures three thoughts, taps organise now, and sees them filed within the session —
   then asks a question and gets a cited answer.
4. Two users organise at once; one made to fail leaves the other's vault fully written.
5. Per-user spend cap: a user at their ceiling is refused, logged, not retried, and **the other user is
   unaffected**.
6. The existing free checks and `typecheck` / `lint` / `build` all still pass, and the no-DELETE rule
   still holds across the whole repo.
7. The migration is run against a copy of the live database before it is run against the live one.
