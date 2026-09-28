# docs/first-five.md — putting Mynd in five other people's hands

Opened 2026-09-27. The question this answers: **what has to be true before five people who are not
Sahil can use Mynd, who those five are, and how much of it they get.** Nothing here is a slice yet;
it is the list a slice gets cut from. Decisions land in `DECISIONS.md` as usual.

Standing judgement from use (2026-09-27): **Ask is good. Organisation is the weak half.** Everything
below is ordered by that fact.

---

## 1. Blocking — it cannot go out without these

### B-1. More than one person can have a vault
One shared `SECRET_TOKEN` and no `user_id` means five people would share Sahil's vault. This is the
whole blocker. Smallest version: a `users` row, a per-user token, `user_id` on captures / notes /
folders / asks / quick_calls / rules, every query in `lib/db/` scoped to it, and a per-user spend cap
so one heavy user cannot spend the month. No teams, no billing, no OAuth, no password reset.

### B-2. A new vault must not be born empty
`lib/db/seed.ts` seeds *Sahil's* six areas — `mynd` is a project folder, not a category anyone else
has. And **the organiser cannot create folders** (by design, F1), so a user whose folders do not fit
their life has everything land in Inbox forever, which reads as "it doesn't work". Either a generic
starter set, or three questions at signup that name their areas. This is a product decision, not a
detail: the folder set *is* the user's mental model.

### B-3. Something must happen in the first session
The cron runs 07:00 and 19:00 UTC. A new user dumps four thoughts, opens the vault, sees nothing, and
concludes it is broken — up to twelve hours of nothing on the one day their attention is highest.
Needs an on-demand organise (a button, rate-limited and spend-capped) or a much shorter cron. Without
this, the onboarding call has no payoff moment and B-4's UI work is wasted.

### B-4. The UI must not shut them down
Every screen is browser-default type on inline styles with `#ccc` borders. The bar is **"a stranger
does not close it in the first ten seconds"**, not "beautiful" — that is still deferred. Concretely,
and nothing beyond this list:
- Real type scale and spacing; one accent colour; folder colours already exist.
- Capture is the front door: it should look like the point of the app, not a textarea.
- Empty states that say what to do ("Nothing here yet — dump a thought and it will file itself").
- Loading states on every fetch instead of a blank screen; `Loading…` as bare text is not enough.
- No ids, no JSON, no raw cost strings on the home screen — the run summary on `/` is a developer's
  debug line and reads as unfinished software.
- Every screen checked at phone width first.
Explicitly NOT: a design system, animation, dark mode, a marketing page inside the app.

### B-5. Instant capture, the honest version
See §3. The one-line part of it (`start_url`) is blocking; the rest is not.

## 2. Not blocking — do not let these delay the handout
- The RC1/RC7 structure work. It is the most important thing to fix *for the product*, but the five
  will be told the organiser is rough, and their misfiles are the evidence that aims the fix. Handing
  it out **before** the quality pass is deliberate: otherwise the pass is tuned against Sahil's vault
  for a third time.
- Slice 7's grader. It measures a product with one user.
- The tidy pass (RC2), RC4's vocabulary, templates (H5/V2-2), billing, a landing page.

---

## 3. The floating button — what is actually buildable

The Wispr Flow idea is "press one thing, talk immediately, never think about windows". The mechanics
of that on a phone are narrower than they look, and one fact reframes the whole item:

**Mynd does not record audio.** `app/capture/page.tsx` is a textarea with `autoFocus`; dictation is the
phone keyboard's own mic. So there is no press-and-hold surface to attach a floating button to — the
thing being made instant is *reaching an already-focused textarea*.

What the platforms allow:
- **iOS gives no floating overlay to third-party apps at all.** There is no equivalent of Android's
  bubbles. The nearest real surfaces are the Action Button (15 Pro and later), Back Tap, a Lock Screen
  or Control Centre widget, and Siri — and of those, Action Button and Back Tap can both run a
  **Shortcut**, which can open a URL. A Shortcut needs zero code from us.
- **Android does allow a floating bubble**, but only from a native app with an overlay permission.
- So "float anywhere" = a native app on one platform and impossible on the other. That is why
  `AGENTS.md` deferred it, and the reasoning still holds.

**What to do instead, in order of return:**
1. **Change `start_url` in `app/manifest.ts` from `/` to `/capture`.** One line. Today the home-screen
   icon opens the vault, which fetches, then you tap through to capture. After it: icon → focused
   textarea → keyboard mic. This is the single largest friction cut available and it is a one-line
   change. (Reaching the vault becomes one tap from capture, which is the right way round anyway —
   capture is the frequent act.)
2. **Bind Back Tap (or the Action Button) to a Shortcut that opens the capture URL.** No code. Test it
   on Sahil's phone this week and, if it feels instant, write it into the onboarding for the five as a
   30-second setup step. Double-tap the back of the phone and talk is close enough to the real thing.
3. **Defer the native widget** until there is evidence people capture often enough to want it. It is a
   retention mechanic, not a trial mechanic, and it changes the shape of the whole project (a native
   app, a store review, a second codebase).

---

## 4. Who the five are

Pick for **behaviour, not goodwill**. The one qualifying trait: *they already talk their thoughts
somewhere* — voice memos, Wispr Flow, WhatsApp notes to self, a Notes app graveyard they feel guilty
about. Someone who does not already capture will not start because the tool is good.

A workable mix:
- **2 close** — high tolerance, will reply the same day, safe to break things in front of. Their value
  is speed of feedback, not honesty.
- **3 at arm's length** — a friend-of-a-friend, a colleague, someone from a community. Their value is
  the opposite: they will silently stop using it, and *that* is the signal worth having.

Avoid: anyone building an AI notes product (they will give you a roadmap instead of usage), designers
(their reaction will be dominated by B-4 no matter how much is fixed), and anyone who needs it to work
for a job deadline.

## 5. How much they get

- **The whole product, not a slice.** All five paths. Staging features hides which one is the reason
  they stay.
- **One at a time, not five at once.** Give it to one, watch a week, fix what breaks, then two, then
  two. Five simultaneous first impressions spend all five on the same fixable bug.
- **Name the weakness first, out loud:** "answering is good, filing is rough, tell me every time it
  files something wrong." Pre-framed, a misfile is confirmation that you were honest; unframed it is
  the moment they decide the product is broken.
- **Onboard each one live**, and make the first session end with the payoff: ten dumps, organise on
  demand (B-3), then *have them ask it a question*. Ask is the good half — the first session must
  reach it.
- **Free.** Five users cannot price anything. The question at week two is not "would you pay" but
  **"if this stopped working tomorrow, what would you do instead?"** — and the number that matters is
  how many of the five came back on day seven with no nudge from Sahil.
