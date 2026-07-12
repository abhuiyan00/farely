# 02 — Roadmap & Status Board

## Status legend
🟢 done · 🟡 in progress · ⚪ not started · 🔴 blocked

## Live status board

| Phase | Deliverable | Status | Notes |
|-------|-------------|--------|-------|
| 0 | Documentation set | 🟢 done | This folder |
| 1 | Capacitor Android shell | 🟢 done | `android/` built → `app-debug.apk`, BUILD SUCCESSFUL |
| 2 | Accessibility service + parse + bridge | 🟡 code-complete | JS listener wired (`offerFromRaw` → `scoreOffer`), sim disabled on device, `status()` surfaced. Remaining: validate on device |
| 3 | Overlay verdict bubble | 🟡 code-complete | `OverlayController.kt` via TYPE_ACCESSIBILITY_OVERLAY (no extra permission); JS pushes verdict. Remaining: validate on device |
| 4 | Offer parsing hardening (per-platform) | 🟡 started | Multi-match parse (pickup vs trip leg, max-fare), missing-field estimation JS-side. Remaining: per-app view-id selectors, locale edge cases |
| 5 | Field testing + tuning | ⚪ not started | Real device, real offers |
| 6 | Multi-app autopilot | 🟡 code-complete | `coordinator.ts` (pure) + `MultiAppCoordinator.kt`: auto-pause/resume/switch, one-active-trip rule. **No app has a "pause" — retargeted to the real online/offline toggle + "Stop new requests"; controls are *learned* per app (Phase 6b) and drive it view-id-first.** Compiles. Remaining: validate real taps + app-switch on device |
| 6b | Learn-controls (per-app selectors) | 🟢 done (sim) | `controls.ts` + `LearnControlsScreen`: on-device node-tree dump (`captureControls`/`dumpControls`), driver tags each control, `SelectorProfile` persists + drives the coordinator (`present`/`clickRole`). Remaining: capture real Bolt/Uber view-ids on a device |
| 7 | Identity-check passthrough | 🟡 code-complete | Face-check screens freeze all automation + hide overlay (`frozen`), `IdCheckOverlay` UI. Remaining: confirm keyword detection vs real Uber/Bolt verify screens |
| 8 | Events calendar + phone export | 🟢 done (sim) | `events.ts` venues + let-out pricing, Events tab, `.ics` / `CalendarContract` insert. Remaining: bind a live events feed (currently listings + typical schedule) |
| 9 | Notifications | 🟢 done | In-app feed + bell; native `FarelyNotifications` channel + `notify` bridge |
| 10 | Potato-phone LITE tier | 🟢 done | `device.ts` autodetect + `isLowRamDevice`; DOM-projection map, GL dynamic-imported/split, animations off |

> **Dependency note:** Phase 2 native code cannot compile until Phase 1 creates the
> `android/` project. The Phase 2 source is staged under `native/android/` (see
> [04](04-accessibility-service.md)) and copied into `android/` once it exists.

---

## Phase 1 — Capacitor Android shell
**Goal:** existing Farely web app runs as an installable Android app; `engine.ts`
executes on-device inside the WebView. Still simulation only.

Steps:
1. Add deps: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (pinned
   exact, honoring the repo's no-`^` convention and 7-day `minimumReleaseAge`).
2. `npx cap init` → `capacitor.config.ts` (`webDir: "dist"`, appId e.g.
   `com.farely.app`).
3. `npm run build` → `npx cap add android` → creates `android/`.
4. `npx cap run android` on a device/emulator → confirm app + engine work.

Exit criteria: Farely simulation runs on a physical Android phone.

## Phase 2 — Accessibility service + parse + bridge
**Goal:** detect a real offer popup in Bolt/Uber/FreeNow, extract fields, hand a
`RawOffer` to the WebView, score with `scoreOffer()`, log the result.

Exit criteria: opening a target app and receiving an offer prints a parsed,
scored offer in the app log. (Overlay comes in Phase 3.)

## Phase 3 — Overlay verdict bubble
**Goal:** draw ACCEPT/MARGINAL/DECLINE + zł/hr + reason on top of the ride app.

Exit criteria: verdict appears within ~1s of an offer, over the live app.

## Phase 4 — Parsing hardening
Per-platform parsing rules, currency/locale handling, missing-field estimation
via engine geo (`roadKm`, `haversineKm`), confidence gating.

## Phase 5 — Field testing
Drive with it, compare overlay verdicts vs manual judgement, tune thresholds
(`tuneThresholds` already exists), log accuracy of the OCR/node parse.

## Phase 6 — Multi-app autopilot
**Goal:** keep the real multi-apper rule (one active trip per active app)
without the driver toggling anything. Accept on A → pause B/C → resume at
drop-off → surface the app that needs the driver.
Pure logic in `src/app/lib/coordinator.ts` (web sim + single source of truth);
`MultiAppCoordinator.kt` performs it on-device (trip/verify detection from the
node tree, pause/resume via `ACTION_CLICK` on labelled controls, app switch via
launch intent). Every behaviour is a Settings toggle.
Exit criteria: on a real phone, accepting on Bolt pauses Uber and resumes it at
drop-off, verified without a manual toggle.
**Boundary:** never taps a ride offer's Accept — only online/paused/foreground.

## Phase 6b — Learn-controls (per-app selectors)
**Goal:** stop guessing button labels. No ride app has a "Pause"; the real
controls (online/offline toggle, "Stop new requests", trip / ID-check markers)
differ per app + locale and are often icons with no text. The driver teaches
them once, on their own phone: the accessibility service dumps the live node
tree (`captureControls` → `farely:controlDump`, view-ids via `flagReportViewIds`),
`LearnControlsScreen` shows it and lets the driver tag each control, and the
resulting `SelectorProfile` (`controls.ts`, view-id first / text fallback)
persists and is pushed to `MultiAppCoordinator.kt` (`configureSelectors`), which
prefers it over the heuristic label lists (`present`/`clickRole`).
Exit criteria (production): on a device, teach Bolt + Uber their real controls
and confirm the autopilot taps the right toggle by view-id. **Boundary:** the
driver only ever tags online/offline/stop-requests + read-only markers — never a
ride offer's Accept.

## Phase 7 — Identity-check passthrough
**Goal:** be invisible during Uber Real-Time ID Check / Bolt selfie verification.
Detecting a face-check screen sets `frozen`: no taps, no switches, overlay
pulled, `IdCheckOverlay` explains the stand-down.
Exit criteria: a real verify prompt is never covered or interfered with; keyword
detection fires on the actual Uber/Bolt screens (tune the PL/EN hint list on device).

## Phase 8 — Events calendar + phone-calendar export
**Goal:** turn known venue let-outs into positionable demand. `events.ts` holds
Wrocław venues + verified listings + typical schedules, priced with `zoneEph`.
Events tab + Home "Opportunities"; export a positioning window to the phone
calendar (`.ics` on web, `CalendarContract` insert on device).
Exit criteria (production): swap the seeded listings for a live events feed.

## Phase 9 — Notifications
In-app `Notice` feed (bell + panel, capped/deduped) and a native low-importance
channel. Only state changes worth interrupting for (NN/g: timely + specific + rare).

## Phase 10 — Potato-phone LITE tier
**Goal:** run well on low-end Android. `device.ts` auto-detects
(memory/cores/save-data/reduced-motion + Android `isLowRamDevice`) and drops to
a WebGL-free DOM/SVG map, no animation, slower clock. MapLibre GL is
dynamic-imported into its own chunk so LITE never loads it.
Exit criteria: usable frame rate + no GL on a 2–3 GB device; Settings override honoured.
