# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Figma Make code export**, since wired into a **live client-side simulation** of **Farely**, a
rideshare/delivery driver assistant (real-time offer scoring + demand-zone positioning). No backend and no
routing, but the screens are **not** static: offers are generated and scored by a real cost engine, and
accept/decline decisions flow into shared session state (log, stats, self-tuning thresholds). The product
intent lives in `src/imports/pasted_text/farely-product-plan.md` (and `-1.md`) — read it for domain context
(deadhead-adjusted net-profit engine, smart zoning, Phase 1/2/3 roadmap that the UI's phase legend references).

## Commands

```
npm i           # or pnpm i — install deps
npm run dev     # Vite dev server
npm run build   # vite build → dist/
```

No test runner, no linter, no typecheck script are configured. Do not invent `npm test`/`npm run lint`.

## Architecture

- **Stack**: Vite 6 + React 18 + TypeScript + Tailwind v4 (`@tailwindcss/vite`). Entry: `index.html` →
  `src/main.tsx` → `src/app/App.tsx`.
- **`src/app/lib/` holds the pure domain core** — UI-free, side-effect-free, unit-testable. Put new business
  logic here:
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
  - **`events.ts`** — Wrocław venue dataset + let-out events (verified listings + typical schedules), priced with
    `zoneEph`, plus `.ics` generation (`eventsToIcs`/`downloadIcs`) and `eventCalendarEntry` for native calendar insert.
  - **`device.ts`** — potato-phone detection (`detectDevice`/`withNativeProfile`) → `PerfTier` "full"|"lite".
  - **`bridge.ts`** — the single `FarelyBridge` Capacitor plugin surface + `IS_NATIVE`.
  - **`session.ts`** — `useReducer` state shared via `SessionCtx`/`useSession()`: vehicle, thresholds, position,
    log, platforms, **coordinator board (`statuses`/`coord`/`idCheck`)**, **notification feed (`notices`)**, **perf
    mode**, **learned control selectors (`selectors`)**. Persists vehicle/thresholds/platforms/coord/perfMode/selectors.
    Read helpers: `effectiveTier(state)`, `unreadCount(state)`.
- **`src/app/App.tsx`** is the orchestration shell: phone-frame on desktop, screens (`HomeScreen`/
  `RidesScreen`/`EventsScreen`/`CarScreen`/`SettingsScreen`, plus `LearnControlsScreen` reached from Settings, in
  `src/app/screens/`) switched by local `useState`,
  not a router (`react-router` installed but unused). The **offer loop** is a phase machine
  (`incoming → offer → trip → result`) on `useEffect` timers; Accept/Decline dispatch `window`
  `CustomEvent("farely:decide")`, `farely:idcheck` triggers the ID-check demo. On device, `farely:rawOffer` +
  `farely:coord` bridge events replace the sim. Overlays: `OfferOverlay`, `IdCheckOverlay`, on-trip banner,
  result toast, `NotificationPanel`. Screens read context + compute with `useMemo` — no hardcoded arrays.
- **Styling reality (important)**: `App.tsx` is written almost entirely with **inline `style={{}}` objects and
  hardcoded hex colors**, plus a shared `Verdict` color system (`accept`/`marginal`/`decline` → green/amber/red).
  It does *not* use Tailwind classes or the shadcn components. Match this inline-style convention when editing
  `App.tsx`; don't refactor it to Tailwind/shadcn unless asked.
- **shadcn/ui library** lives in `src/app/components/ui/` (full set: button, card, dialog, sidebar, chart, etc.,
  built on Radix + `class-variance-authority`). These are available but **currently unused by App.tsx**. If you
  add Tailwind-based UI, use `cn()` from `src/app/components/ui/utils.ts` (clsx + tailwind-merge).
- **Fonts**: loaded via Google Fonts in `src/styles/fonts.css`. UI leans on `'JetBrains Mono'` (data/labels)
  and `'Barlow Condensed'` (headings/verdict). CSS entry is `src/styles/index.css` (imports fonts → tailwind →
  theme).

## Vite specifics (see `vite.config.ts`)

- `@` is aliased to `src/`.
- Custom `figma:asset/<file>` import scheme resolves to `src/assets/<file>` (Figma-export leftover). That dir
  may not exist yet — create it if you add such imports.
- React and Tailwind plugins are both required by the Figma Make toolchain even if a change doesn't use Tailwind
  — do not remove them.
- `assetsInclude` covers `.svg`/`.csv` for raw imports; the config comment forbids adding `.css`/`.ts`/`.tsx`.

## Conventions

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (refuse packages published < 7 days ago) — expect that
  constraint when adding/upgrading deps.
- Dependency versions are pinned exact (no `^`/`~`) in `package.json`. Keep that style.
- `guidelines/Guidelines.md` is a template placeholder ("Add your own guidelines here") — no active rules there yet.
