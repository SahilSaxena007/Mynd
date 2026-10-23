# Slice 7.4 verification — 2026-10-21

Implemented F1–F7 on `slice-7-4-user-folders`, created from `first-user-prep`.
No schema, migration, deployment configuration, routing prompt, or dependency changes.
No commits or pushes to either deployment branch.

## Automated checks

Passed: `typecheck`, `lint`, `build`, `seed:check`, `folders:check`,
`organize:check`, `split:check`, `ask:check`, `todo:check`, `quick-calls:check`.

Folder and seed checks use an offline database double. They cover validation,
case-insensitive duplicate names, slug collisions, grouping defaults, colour
selection, the 10/11-folder boundary and explicit confirmation, fixed Journal/Inbox
rules, unchanged slugs, HTTP statuses/authentication, and preserving renamed and
user-created folders during seed. Completed-task checks include nested tasks,
GFM code exclusions, rendering, and restoring the original source line.

Creation and edits share advisory transaction lock 715004. Seed takes migration
lock 715001 followed by 715004, so seed cannot interleave with initial user creation.
Stored descriptions include the generated grouping suffix; edits allow that suffix
in addition to the 300-character user description, and preserve unchanged seed rules.

## Scratch database and browser

Used disposable local Postgres 16 on port 55474, initialized with the existing
schema and `testers/aditya.json`. No live vault was used. Browser checks ran at
390 × 844 against a production Next.js build.

- Created Travel through the home form without choosing a colour; it appeared on home.
- Captured “want to go hiking in the Dolomites next summer”. The sandboxed Organise
  now request failed contacting the provider. A network-enabled CLI organiser run
  processed that same pending capture: one item filed in **Travel**, zero queued,
  zero content fallbacks. Run cost: $0.007338. No prompt change was needed.
- Created folders through the tenth without confirmation. The eleventh displayed
  count 10; Cancel preserved the filled form and folder count. Create anyway created
  it. The next attempt displayed count 11.
- Renamed Travel to Trips, changed its description and colour, and verified the
  `/folder/travel` URL and existing notes were unchanged. Journal's description was
  read-only while its name remained editable.
- Ticked a fixture to-do, revealed it through Show completed, and unticked it.
  The saved note returned to its original bytes. Completed items were hidden again
  after a page reload. The initial browser assertion used `check()` on an item that
  disappears when saved; rerunning with click-and-list assertions passed.
- Verified singular Quick Calls wording on home and the Quick Calls page.
- On real Postgres, simultaneous duplicate creates and duplicate renames produced
  one success and one conflict; distinct names with colliding slugs received unique slugs.
- Reran seed without a custom seed file after user creation and renaming. Folder
  rows and `vault:counts` results were identical before and after. The CLI printed
  `PASS: Vault already has 14 folders; seed skipped.` after concurrency fixtures.

Local screenshots and one-off browser/database scripts are in ignored `.runs/`.

## Pending shipping verification

The live before/after redeploy comparison (spec Verification 6) was **not run**.
It requires the later authorized merge/deploy to `first-user-prep`. Neither
`first-user-prep` nor `main` was merged or pushed during this work.
