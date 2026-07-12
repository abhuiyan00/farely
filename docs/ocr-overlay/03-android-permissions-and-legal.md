# 03 — Android Permissions & Legal / Risk

## 1. Permissions required

| Permission / API | Why | When prompted | User can revoke |
|------------------|-----|---------------|-----------------|
| `BIND_ACCESSIBILITY_SERVICE` | Read the ride app's on-screen text + get offer events | User enables in Settings → Accessibility | Yes |
| `SYSTEM_ALERT_WINDOW` (overlay) | Draw the verdict bubble over other apps | Runtime settings toggle | Yes |
| `MediaProjection` (screen capture) | OCR fallback only — grab pixels when text isn't in node tree | Runtime consent dialog per session | Yes |
| `FOREGROUND_SERVICE` | Keep the service alive while driving | Manifest declare | n/a |
| `ACCESS_FINE_LOCATION` | Driver's current position → deadhead distance | Runtime prompt | Yes |

Notes:
- Accessibility + overlay permissions **cannot be granted silently**; the user
  must toggle them manually. This is by Android design.
- MediaProjection shows a persistent "screen is being captured" indicator. Only
  invoked on the OCR fallback path — avoid it when node text is available.
- No `INTERNET`-dependent OCR: ML Kit text recognition runs **on-device**.

## 2. ⚠️ Terms-of-Service / account risk — READ

Automated reading of Bolt / Uber / FreeNow screens and overlaying UI on them is
**very likely against those platforms' driver terms of service.**

- **Worst realistic outcome:** the driver's account is suspended or permanently
  banned. That is the driver's livelihood.
- The apps may also detect overlays and refuse to show offers while an overlay is
  active (some already block overlays during navigation).
- This tool does **not** touch the platforms' servers or APIs, does not scrape
  their backend, and only reads what is already rendered on the user's own device.
  That reduces some risk categories but does **not** make it ToS-compliant.

**This is the user's own account and own decision.** The tool is a personal
driver-assist utility. But the ban risk is real, not hypothetical — document it,
surface it in-app on first run, and let the driver consciously opt in.

## 3. Privacy

- All processing is on-device. No offer data, screen content, or location leaves
  the phone. No analytics, no network calls for scoring.
- Screen capture (OCR path) must be scoped to the moment an offer appears and the
  captured image discarded immediately after parsing — never stored.

## 4. Legal disclaimer to ship in-app (draft)

> Farely reads offer details shown on your screen to help you decide faster. It
> may violate your ride-hailing platform's terms of service and could put your
> driver account at risk. You use it at your own discretion. All data stays on
> your device.
