# Farely — Vision

> North-star document. Everything else (architecture, roadmap, code) serves this.
> Scope decisions locked 2026-07-02.

---

## 1. One line

**A personal driving co-pilot that reads my real ride offers on-screen, tells me
in one glance whether to take them, and keeps steering me toward the most
profitable hours and places in Wrocław — so I earn more zł per hour with less
guessing.**

## 2. Who + why

- **User: me, one driver.** Not a product for others, not open-source. A private
  edge for my own shifts. Every design choice optimizes for *my* workflow, not for
  onboarding strangers.
- **Dual intent:**
  1. **Earn more.** Concrete: higher realized zł/hr, fewer bad-fare acceptances,
     less dead time in low-demand zones.
  2. **Craft / portfolio.** A genuinely hard, real-world build (on-device capture,
     a real cost engine, live decisioning) that demonstrates end-to-end skill.
- **Market: Wrocław, Poland only.** PLN currency, local geography, local platforms
  (Bolt, Uber, FreeNow). Depth over breadth — the engine already knows this city.
  No multi-city/multi-currency generalization.

## 3. The product: a full co-pilot

Farely is not just an offer grader. It is a **driver's second brain** with five
pillars, all running on the same real cost engine (`src/app/lib/engine.ts`):

1. **Offer decisions (the core).**
   Read the live Bolt/Uber/FreeNow offer off my screen → deadhead-adjusted net
   profit → **ACCEPT / MARGINAL / DECLINE** verdict + one-line plain reason,
   shown as an overlay before the timer runs out.

2. **Smart zoning / positioning.**
   Where to sit between rides. Live demand signals (flights, transit, events,
   weather, time-of-day) → ranked zones and a "move here" nudge with the expected
   zł/hr payoff of relocating.

3. **Earnings intelligence.**
   A running, honest picture of *realized* performance: zł/hr, net after running
   + deadhead costs, accept/decline history, which decisions actually paid off.
   The truth about a shift, not the platform's flattering gross number.

4. **Self-tuning.**
   The thresholds that define "good enough" adapt to my real outcomes over time
   (`tuneThresholds`), and I can override with a manual zł/hr target when I want a
   harder or softer bar.

5. **Multi-app autopilot (the chore runner).**
   I run Bolt + Uber + FreeNow at once to kill idle minutes. Farely keeps the
   *one active trip per active app* rule for me: accept on one → pause the
   others → resume everything at drop-off → surface the app that needs me. It
   also watches for a platform identity check and gets completely out of the way
   when the camera comes up (`src/app/lib/coordinator.ts`). It never taps a ride
   offer's Accept — only the pause/resume/switch chores I'd otherwise fumble at a
   red light. Around this: venue **let-out calendar** (position for the crowd,
   export to my phone calendar) and Farely's own **notifications** for the few
   things worth interrupting me for.

## 4. Principles (how it must feel)

- **Glanceable.** A decision must land in under a second, at a stoplight, without
  reading a paragraph. Big verdict, big number, tiny reason.
- **Honest about money.** Always net, always after deadhead + running cost, always
  in zł. Never parrot the platform's gross fare as if it were profit.
- **Trustworthy or silent.** If a reading is low-confidence, say so — never fake a
  verdict on bad data. A wrong ACCEPT costs real money.
- **Invisible until needed.** Event-triggered, near-zero device load. It wakes on
  an offer, speaks, and disappears. It never competes with the driving apps for
  battery or attention.
- **My data, my phone.** On-device by default: no servers, no accounts, no
  telemetry; my earnings and normal operation never leave the phone. The one
  owner-chosen exception is the **cloud-vision classifier** (§6): when Farely hits
  a screen it can't recognize, it sends *that* capture to a vision model (my own
  API key) to work out what it is. A deliberate trade-off I switched on — not a
  default — and one that is never applied to an identity-check screen.

## 5. What success looks like

**As an earnings tool**
- Measurably higher realized zł/hr across comparable shifts.
- Fewer accepted rides that turn out net-negative after deadhead.
- Less idle time — more shift minutes spent in a top-ranked zone.
- I trust the verdict enough to act on it without second-guessing.

**As a craft project**
- A working, on-device live pipeline: screen → parsed offer → real engine →
  overlay, on a real phone with real offers.
- Clean separation: all logic in a pure, testable engine; native code only
  captures and displays.
- Documented, coherent, demonstrable end to end.

## 6. Explicit non-goals

- ❌ Not a multi-user product, SaaS, or open-source release. (May reconsider only
  after it demonstrably works for me.)
- ❌ Not multi-city / multi-currency. Wrocław + PLN only.
- ❌ No iOS. Android-only by platform necessity (see permissions doc).
- ❌ No platform API/backend integration. We read the driver's own screen, nothing
  server-side.
- ❌ No auto-accept/auto-decline **of ride offers**. The money decision stays
  human — Farely advises, the driver taps Accept. Automating *that* tap raises
  ban and safety stakes far higher and is out of scope.
- ✅ **Chore automation of the _other_ apps is in scope** (added 2026-07-12, at
  the driver's request; every switch is a toggle in Settings). When the driver
  accepts on one platform, Farely may pause the others and resume them at
  drop-off, and bring the app that needs the driver to the front — the Mystro
  pattern real multi-appers already do by hand. This never touches a ride
  offer's Accept/Decline; it only manages online/paused state and foreground.
  Since no ride app actually has a "Pause", Farely drives each app's real
  online/offline toggle + "Stop new requests" — controls the driver *teaches* it
  once on-device (Learn-controls), matched by view-id first so it taps the right
  button instead of guessing a label.
- ✅ **Cloud-vision unknown-case handling is in scope** (added 2026-07-13, at the
  driver's request; uses the driver's own API key). When Farely meets a screen its
  on-device heuristics + learned selectors can't place — an app update, a redesign,
  a promo takeover — it captures the screen, sends it to a vision model to classify,
  takes a decision, and records the whole case in the diagnostics DB for later
  tuning. This is a deliberate, documented departure from "nothing leaves the
  phone": a screen capture leaves the device **only** for this classifier, and only
  for screens that pass a cheap on-device novelty gate. The hard boundaries are
  unchanged — it never proposes tapping a ride offer's Accept, and **identity/face
  checks are detected on-device and never routed to the cloud** (a vision verdict of
  "idCheck" only ever triggers the freeze). Every case is auditable in Diagnostics.
- ❌ Never between the driver and an **identity check**. When a platform asks for
  a face photo, all automation freezes and the overlay hides until it's done —
  and that screen is never sent to the cloud-vision classifier.

## 7. Known tension to hold

Reading platform screens likely violates their driver ToS → real account-ban risk
(see `docs/ocr-overlay/03-android-permissions-and-legal.md`). It's my own account
and my own call. The vision accepts this as a personal-use trade-off, keeps
everything on-device, and never automates the actual accept tap.

## 8. From here

The vision is the *why*. The *how* lives in:
- `docs/ocr-overlay/01-architecture.md` — system design
- `docs/ocr-overlay/02-roadmap.md` — phased plan + status
- `docs/ocr-overlay/README.md` — the live-capture sub-project index

The current app already realizes pillars 1–4 as a **simulation**. The live-capture
work turns the fake offer feed into a real one — the last gap between this vision
and a phone I actually drive with.
