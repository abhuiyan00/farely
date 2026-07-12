# Farely — Live Offer Capture (OCR Overlay)

> Project charter and documentation index for turning Farely from a client-side
> **simulation** into a **live driver assistant** that reads real Bolt / Uber /
> FreeNow ride offers on-device and scores them with the existing cost engine.

---

## 1. Goal

Today Farely invents offers via `generateOffer()` and grades them with
`scoreOffer()`. The engine (`src/app/lib/engine.ts`) is production-grade; the
**offers are fake**. This project replaces the fake feed with **real offers read
off the driver's phone screen**, scores them with the *same* engine, and shows an
`ACCEPT / DECLINE` verdict as a floating overlay on top of the ride-hailing app.

**Non-goal:** we do not integrate with any platform API (they are closed). We read
what is already on the driver's own screen.

## 2. Core design decision

Read the Android **accessibility node tree first** (fare/distance as real text →
zero OCR, near-zero CPU). Fall back to **on-device OCR** (ML Kit) only when an app
draws its offer on a Canvas/Surface where text is not in the node tree.

Everything is **event-triggered** (fires when an offer popup appears), never
polling. This is what keeps device load and battery impact negligible.

## 3. Platform support

| Platform | Supported | Reason |
|----------|-----------|--------|
| Android  | ✅ Yes     | AccessibilityService + SYSTEM_ALERT_WINDOW overlay |
| iOS      | ❌ No      | No equivalent cross-app screen-read + overlay APIs |

## 4. Documentation map

| Doc | What it covers |
|-----|----------------|
| [../VISION.md](../VISION.md) | **North-star.** Who Farely is for, the full-co-pilot scope, principles, success, non-goals |
| [01-architecture.md](01-architecture.md) | System design, data flow, module boundaries, the offer-parse contract |
| [02-roadmap.md](02-roadmap.md) | Phased plan, milestones, live status board |
| [03-android-permissions-and-legal.md](03-android-permissions-and-legal.md) | Required permissions + the ToS / account-ban risk (READ THIS) |
| [04-accessibility-service.md](04-accessibility-service.md) | Phase 2 spec — the native service that detects & reads offers |
| [CHANGELOG.md](CHANGELOG.md) | Dated log of what actually changed |

## 5. Current status

**Phase 0 — Documentation.** No native code merged yet. The web simulation is
untouched and fully working. See [02-roadmap.md](02-roadmap.md) for the live board.

## 6. Glossary

- **AccessibilityService** — Android system service that can read the on-screen UI
  tree of *other* apps and receive events when their content changes.
- **Node tree** — the structured list of on-screen UI elements + their text.
- **OCR** — Optical Character Recognition; reading text out of a pixel image.
  Here: Google **ML Kit** text recognition, fully on-device (no network).
- **SYSTEM_ALERT_WINDOW** — permission to draw a view on top of other apps
  (the verdict bubble).
- **MediaProjection** — Android API to capture the screen as pixels (needed only
  for the OCR fallback path).
- **Capacitor** — wraps the existing React web app into a native Android shell so
  the current UI and `engine.ts` run unchanged on the phone.
