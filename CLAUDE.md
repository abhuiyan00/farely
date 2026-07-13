# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Figma Make code export**, since wired into a **live client-side simulation** of **Farely**, a
rideshare/delivery driver assistant (real-time offer scoring + demand-zone positioning). No backend and no
routing, but the screens are **not** static: offers are generated and scored by a real cost engine, and
accept/decline decisions flow into shared session state (log, stats, self-tuning thresholds). The product
intent lives in `apps/tester/src/imports/pasted_text/farely-product-plan.md` (and `-1.md`) — read it for domain
context (deadhead-adjusted net-profit engine, smart zoning, Phase 1/2/3 roadmap that the UI's phase legend references).

**Monorepo (pnpm/npm workspaces):** `apps/tester/` is the web **UI tester** (this Vite app + the pure engine that
also ships inside the APK's WebView); `apps/android/` is the **APK** (Capacitor host + native Kotlin in
`apps/android/android/`, staged reference in `apps/android/reference/`). `docs/` holds `VISION.md`, `SRS.md`, and
`ocr-overlay/`. Full requirements + UML live in `docs/SRS.md`.

## Commands

```
pnpm i          # or npm i — install deps (run at the workspace root)
npm run dev     # Vite dev server (delegates to apps/tester) → localhost:5173
npm run build   # vite build → apps/tester/dist
npm run apk     # web build → cap copy → gradlew assembleDebug (apps/android)
```

Run scripts from the repo root; `dev`/`build`/`sync`/`apk` delegate into the workspace packages. No test runner,
no linter, no typecheck script are configured. Do not invent `npm test`/`npm run lint`. Verify with the web build
+ `apps/android/android/gradlew assembleDebug`.

## Architecture

- **Stack**: Vite 6 + React 18 + TypeScript + Tailwind v4 (`@tailwindcss/vite`). Entry: `apps/tester/index.html`
  → `apps/tester/src/main.tsx` → `apps/tester/src/app/App.tsx`.
- **`apps/tester/src/app/lib/` holds the pure domain core** — UI-free, side-effect-free, unit-testable. Put new
  business logic here:
  - **`engine.ts`** — cost model + geography (PLN; money via `money()` → `… zł`). `VehicleProfile`/
    `runningCostPerKm`, `generateOffer`, `scoreOffer` (net, zł/km·hr·min, verdict + plain reason), self-tuning
    `tuneThresholds`, `liveZones`/`moveSuggestion`/`demandSignals`, plus `offerFromRaw`/`resolvePlace` for native
    captures. `zoneEph` is exported so events reuse the same pricing.
  - **`coordinator.ts`** — the multi-app autopilot state machine (Mystro rule: one active trip per active app).
    `coordinate(statuses, event, settings)` is deterministic and drives both the web sim (via the reducer) and
    `MultiAppCoordinator.kt`. Handles accept→pause-others, trip-end→resume-all, app-switch, and the **ID-check
    freeze** (`anyVerifying`). Never accepts a ride offer — only online/paused/foreground.
  - **`controls.ts`** — Learn-controls core: no ride app has a "pause", so the driver *teaches* Farely each app's
    real controls. `NodeCapture`/`ScreenDump`/`SelectorProfile` (view-id first, text fallback), `guessRole`,
    `mockDump` (web-sim trees). The learned `SelectorProfile` drives `MultiAppCoordinator.kt` (`present`/`clickRole`)
    so it taps/reads the real buttons instead of guessing labels.
  - **`events.ts` / `liveEvents.ts`** — Wrocław venue dataset + let-out events, priced with `zoneEph`, plus `.ics`
    generation (`eventsToIcs`/`downloadIcs`) and `eventCalendarEntry` for native calendar insert. `liveEvents.ts`
    pulls **real** events from the **Ticketmaster Discovery API** on app open (same `feGet` transport as
    `carLookup.ts`); `upcomingEvents(now, days, live)` merges by provenance **live > listing > typical** (`source`).
  - **`vision.ts`** — cloud-vision unknown-case classifier: `classifyScreen(capture, key)` → Anthropic Messages
    API (strict-JSON `offer|trip|idCheck|appUpdate|unknown`) with a deterministic keyword **mock** fallback when no
    key. Verdict drives a decision (`idCheck → freeze`); identity checks are never routed to the cloud.
  - **`diagnostics.ts` / `diagStore.ts`** — the on-device "black box": `DiagEvent` types + `logDiag()` writing to
    **IndexedDB** (`farely-diag`, ring-buffered to 2000), firing `farely:diag` for live UI. Reviewed/exported in
    `DiagnosticsScreen`.
  - **`device.ts`** — potato-phone detection (`detectDevice`/`withNativeProfile`) → `PerfTier` "full"|"lite".
  - **`bridge.ts`** — the single `FarelyBridge` Capacitor plugin surface + `IS_NATIVE` (offers, overlay,
    coordinator, calendar, notifications, Learn-controls `dumpControls`/`configureSelectors`, and vision
    `captureScreen` + the `farely:unknownScreen` event).
  - **`session.ts`** — `useReducer` state shared via `SessionCtx`/`useSession()`: vehicle, thresholds, position,
    log, platforms, **coordinator board (`statuses`/`coord`/`idCheck`)**, **notification feed (`notices`)**, **perf
    mode**, **learned control selectors (`selectors`)**, **API keys (`keys`: anthropic/ticketmaster)**, **cached
    live events (`liveEvents`)**. Persists vehicle/thresholds/platforms/coord/perfMode/selectors/keys/liveEvents.
    Read helpers: `effectiveTier(state)`, `unreadCount(state)`. **NB: the persist `useEffect` dep array in
    `App.tsx` must list every persisted slice** — a missing dep silently drops persistence (bitten twice).
- **`apps/tester/src/app/App.tsx`** is the orchestration shell: phone-frame on desktop, screens (`HomeScreen`/
  `RidesScreen`/`EventsScreen`/`CarScreen`/`SettingsScreen`, plus `LearnControlsScreen` and `DiagnosticsScreen`
  reached from Settings, in `apps/tester/src/app/screens/`) switched by local `useState`, not a router
  (`react-router` installed but unused). The **offer loop** is a phase machine (`incoming → offer → trip →
  result`) on `useEffect` timers; Accept/Decline dispatch `window` `CustomEvent("farely:decide")`,
  `farely:idcheck` triggers the ID-check demo, `farely:unknownScreen` runs the vision path, `farely:diag`
  refreshes diagnostics. On device, `farely:rawOffer` + `farely:coord` + `farely:unknownScreen` bridge events
  replace the sim. Overlays: `OfferOverlay`, `IdCheckOverlay`, on-trip banner, result toast, `NotificationPanel`.
  Screens read context + compute with `useMemo` — no hardcoded arrays.
- **Styling reality (important)**: `App.tsx` is written almost entirely with **inline `style={{}}` objects and
  hardcoded hex colors**, plus a shared `Verdict` color system (`accept`/`marginal`/`decline` → green/amber/red).
  It does *not* use Tailwind classes or the shadcn components. Match this inline-style convention when editing
  `App.tsx`; don't refactor it to Tailwind/shadcn unless asked.
- **shadcn/ui library** lives in `apps/tester/src/app/components/ui/` (full set: button, card, dialog, sidebar,
  chart, etc., built on Radix + `class-variance-authority`). These are available but **currently unused by
  App.tsx**. If you add Tailwind-based UI, use `cn()` from `apps/tester/src/app/components/ui/utils.ts`.
- **Fonts**: loaded via Google Fonts in `apps/tester/src/styles/fonts.css`. UI leans on `'JetBrains Mono'`
  (data/labels) and `'Barlow Condensed'` (headings/verdict). CSS entry is `apps/tester/src/styles/index.css`.

## Vite specifics (see `apps/tester/vite.config.ts`)

- `@` is aliased to `apps/tester/src/`.
- Custom `figma:asset/<file>` import scheme resolves to `apps/tester/src/assets/<file>` (Figma-export leftover).
  That dir may not exist yet — create it if you add such imports.
- Dev proxies dodge CORS: `/fe-api` → fueleconomy.gov, `/anthropic` → Anthropic API, `/tm-api` → Ticketmaster
  (on device these calls go through `CapacitorHttp` instead).
- React and Tailwind plugins are both required by the Figma Make toolchain even if a change doesn't use Tailwind
  — do not remove them.
- `assetsInclude` covers `.svg`/`.csv` for raw imports; the config comment forbids adding `.css`/`.ts`/`.tsx`.

## Conventions

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (refuse packages published < 7 days ago) — expect that
  constraint when adding/upgrading deps.
- Dependency versions are pinned exact (no `^`/`~`) in `package.json`. Keep that style.
- `guidelines/Guidelines.md` is a template placeholder ("Add your own guidelines here") — no active rules there yet.
- **Native Kotlin is mirrored**: the compiled source in `apps/android/android/app/src/main/java/com/farely/app/`
  has a reference copy in `apps/android/reference/` — keep the two in sync when editing native code.
