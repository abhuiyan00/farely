# Farely 🚗

**A personal rideshare/delivery driver assistant for Wrocław, Poland.** Farely
reads the driver's *own* ride-app offers on-screen, scores each on **deadhead-adjusted
net profit** (PLN), says **ACCEPT / MARGINAL / DECLINE** in one glance, and keeps
steering toward the most profitable hours and places — while running the multi-app
"chore" autopilot for Bolt · Uber · FreeNow.

> Private, single-driver tool — not a product or SaaS. The north-star intent lives
> in [`docs/VISION.md`](docs/VISION.md); the full requirements in
> [`docs/SRS.md`](docs/SRS.md).

---

## Monorepo layout

```
farely/
├── apps/
│   ├── tester/     # UI Tester — the Vite/React web app + the pure domain engine
│   │               #   (this same build ships inside the APK's WebView)
│   └── android/    # the APK — Capacitor host + native Kotlin (gradle in ./android),
│                   #   accessibility capture, verdict overlay, coordinator, vision
├── docs/           # VISION, SRS, and the live-capture sub-project (ocr-overlay/)
├── package.json    # workspace root (npm workspaces + pnpm-workspace.yaml)
└── README.md
```

Two deliverables, **one shared core**: all business logic is pure and UI-free in
`apps/tester/src/app/lib/` — the web app renders it as a live simulation, and the
Android app runs the identical built bundle inside a WebView, fed by native capture.

| | UI Tester (`apps/tester`) | APK (`apps/android`) |
|---|---|---|
| Stack | Vite 6 · React 18 · TypeScript · Tailwind v4 | Capacitor 7 · Kotlin · Android (min SDK 23) |
| Offer feed | simulated Wrocław offers | real offers read off-screen (accessibility) |
| Purpose | develop, demo, and test the engine | drive with it on a real phone |

---

## Quick start

```bash
# from the repo root
pnpm install          # or: npm install  (pnpm matches the workspace design)

# ── UI Tester (web) ──
npm run dev           # Vite dev server → http://localhost:5173
npm run build         # → apps/tester/dist

# ── APK (Android) ──
npm run apk           # web build → cap copy → gradlew assembleDebug
#   → apps/android/android/app/build/outputs/apk/debug/app-debug.apk
```

Windows one-click helpers: **`Open-Farely.bat`** (dev preview) and
**`Install-To-Phone.bat`** (build + `adb install` to a USB phone).

> Building the APK needs the Android SDK. `pnpm install` places
> `@capacitor/android` where the gradle project expects it; with plain npm you may
> need it under `apps/android/node_modules`.

---

## What it does

1. **Offer decisions** — deadhead-adjusted net → ACCEPT/MARGINAL/DECLINE + one-line reason (`engine.ts`).
2. **Smart zoning** — live demand zones + a "move here" nudge with the expected zł/h.
3. **Earnings intelligence** — realized net zł/h, honest accept/decline history.
4. **Self-tuning** — thresholds adapt to real outcomes; manual zł/h override.
5. **Multi-app autopilot** — one active trip per app: pause/resume/switch the *other* apps (`coordinator.ts`). Never taps a ride offer's Accept.
6. **Learn-controls** — no ride app has a "pause", so the driver *teaches* Farely each app's real buttons once, matched by view-id (`controls.ts`).
7. **Cloud-vision unknown-case handler** — a screen Farely can't recognize (app update, redesign) is captured, classified by a vision model, decided, and logged (`vision.ts`). *Owner-opted-in; see privacy note.*
8. **Live events** — real Wrocław let-outs pulled from Ticketmaster on open, priced as demand, exportable to the phone calendar (`liveEvents.ts` / `events.ts`).
9. **Diagnostics DB** — an on-device "black box" (IndexedDB) of everything Farely does or trips over, reviewable and exportable for tuning (`diagnostics.ts` / `diagStore.ts`).
10. **Notifications** + a **LITE performance tier** for low-end phones.

---

## Privacy & keys

Farely is **on-device by default** — earnings, logs, and normal operation never
leave the phone. The **one owner-chosen exception** is the cloud-vision classifier:
when it hits an unrecognized screen it sends *that* capture to the Anthropic API to
identify it. Guardrails: the driver supplies their **own** API key (stored on-device,
never committed), it never proposes tapping Accept, and **identity/face-check screens
are never sent to the cloud** (handled on-device → freeze). Full rationale in
[`VISION.md §5/§6`](docs/VISION.md).

Optional keys (Settings → *Cloud vision & live data*): **Anthropic** (screen vision)
and **Ticketmaster** (live events). Both are free to obtain; Farely works without
them (mock vision + seeded/typical events).

Reading platform screens likely violates driver ToS — a personal-use trade-off the
driver accepts ([VISION §7](docs/VISION.md) / [permissions & legal](docs/ocr-overlay/03-android-permissions-and-legal.md)).

---

## Architecture & docs
- [`docs/VISION.md`](docs/VISION.md) — the why (scope, non-goals, principles).
- [`docs/SRS.md`](docs/SRS.md) — full requirements + UML (component, class, sequence, state, ER).
- [`docs/ocr-overlay/`](docs/ocr-overlay/) — the live-capture sub-project (architecture, roadmap, permissions, changelog).
- [`CLAUDE.md`](CLAUDE.md) — repo guide for AI coding assistants.

## License
[MIT](LICENSE).
