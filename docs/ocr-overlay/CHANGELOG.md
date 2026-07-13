# Changelog — Live Offer Capture (OCR Overlay)

Dated log of real changes. Newest first. Dates are absolute (YYYY-MM-DD).

## 2026-07-13
- **Monorepo restructure + professional repo.** Split the single Figma-export tree
  into two workspace packages: `apps/tester` (the Vite web UI tester + the pure
  engine that also ships in the APK's WebView) and `apps/android` (Capacitor host +
  native Kotlin in `./android`, `webDir` → `../tester/dist`; the staged `.kt` mirror
  moved to `apps/android/reference/`). Root becomes the workspace root (npm
  workspaces + `pnpm-workspace.yaml` → `apps/*`) with `dev`/`build`/`sync`/`apk`
  scripts. Added `git` baseline, a real `.gitignore` (excludes the 60k+ Android
  build artifacts previously in the tree), `.gitattributes`, `README.md`, `LICENSE`
  (MIT), `CONTRIBUTING.md`, and the full **`docs/SRS.md`** (ISO/IEC/IEEE 29148
  structure, Mermaid UML: component, class, sequence, state, ER). Both builds
  verified green from the new layout.
- **Diagnostics DB (the black box) + review screen.** New on-device event log so
  every error, exception, decision, unknown screen, coordinator action and network
  outcome can be dissected later for tuning. `diagnostics.ts` (pure types + helpers:
  filter/summarize/export JSON) + `diagStore.ts` (zero-dep **IndexedDB**,
  ring-buffered to 2000, `logDiag()` facade firing a `farely:diag` event for live
  UI). `DiagnosticsScreen` (from Settings) filters/searches, marks resolved, exports
  the DB to JSON. Capture points wired: `window.onerror`/`unhandledrejection`, every
  decision, the `carLookup`/`liveEvents` network paths, and every vision verdict.
  Verified in-browser (writes/reads, filters, live refresh).
- **Cloud-vision unknown-case handler.** When Farely hits a screen its heuristics +
  learned selectors can't place (app update, redesign, promo takeover), it captures
  it, asks a vision model what it is, takes a decision, and logs the case — the
  driver's opted-in departure from on-device-only (their own key). `vision.ts`
  (Anthropic Messages API via the `carLookup.feGet` transport; strict-JSON
  classifier; deterministic keyword **mock** so the web demo runs without a key).
  `App.tsx` `farely:unknownScreen` handler classifies → acts (`idCheck` ⇒ freeze,
  else note) → logs unknown-case + vision rows. Native:
  `FarelyAccessibilityService.takeScreenshot()` → base64 PNG, `captureScreen` bridge
  method, `emitUnknownScreen`, plus a throttled + novelty-gated auto-emit that
  **never routes identity/face-check screens to the cloud** (handled on-device).
  Settings gained the key fields (with an explicit "captures are sent to Anthropic"
  disclosure) + a "Simulate unknown screen" trigger. `docs/VISION.md` §4/§6 updated.
  Verified in-browser: `idCheck` verdict flips the freeze overlay.
- **Live events on app open (Ticketmaster).** `liveEvents.ts` pulls real Wrocław
  events from the Ticketmaster Discovery API (`city=Wroclaw&countryCode=PL`) on open
  and on key change, maps them to `VenueEvent`s (venue resolved/synthesized to a
  valid engine zone). `events.ts` gained a `source` field; `upcomingEvents(now,
  days, live)` merges **live > listing > typical** so a real announcement replaces a
  guess. `session.ts` caches `liveEvents` + `eventsFetchedAt` (persisted).
  EventsScreen shows a Refresh button, "n live · updated HH:MM", and live/listed
  badges; falls back cleanly to seeded + typical with no key.
- **Keys.** `session.ts` gained user-supplied `keys` (anthropic/ticketmaster),
  stored on-device only, persisted; Settings "Cloud vision & live data" card. Vite
  dev proxies added: `/anthropic`, `/tm-api` (native uses `CapacitorHttp`).
- Build: web `vite build` green (~309 kB main, maplibre still split); Android
  `gradlew assembleDebug` → BUILD SUCCESSFUL; native `.kt` re-mirrored to
  `apps/android/reference/`.

## 2026-07-12
- **Learn-controls (real buttons, not guessed labels).** Correcting a wrong
  premise: no ride app ships a "Pause" button, and the real controls (online/
  offline toggle, "Stop new requests", trip / ID-check markers) differ per app +
  locale and are often icons with no matchable text. So the driver now *teaches*
  them: new pure core `src/app/lib/controls.ts` (NodeCapture / ScreenDump /
  SelectorProfile, role-guessing, web-sim dumps) + `LearnControlsScreen.tsx`. On
  device the accessibility service dumps the live node tree (`captureControls()`
  → `farely:controlDump`, using the existing `flagReportViewIds`), the driver
  tags which node is which control, and the resulting **per-app selector profile
  (view-id first, text fallback) drives `MultiAppCoordinator.kt`** — `present()`
  detects trip/ID-check by taught marker, `clickRole()` taps the taught offline/
  online control before falling back to heuristics. Profile persists
  (`session.ts` `selectors` + `SET_SELECTOR`) and is pushed native via new
  `configureSelectors` bridge method; `dumpControls` bridge method + `NodeCap`
  serialization added. Coordinator's guessed `PAUSE_LABELS`/`RESUME_LABELS`
  retargeted to the *verified* strings ("Stop new requests" etc.); the old list
  missed the real button entirely. Verified end-to-end in the sim (capture → tag
  → coverage 0/4→2/4 → persisted, incl. the safety-critical ID-check marker);
  Android `assembleDebug` BUILD SUCCESSFUL. Fixed a persistence bug found in
  browser testing (the persist effect's dep array omitted `state.selectors`).
- **Multi-app autopilot (Mystro-style chore runner).** New pure state machine
  `src/app/lib/coordinator.ts`: accept on one platform → the others auto-pause;
  trip ends → all resume ("turn orders back on"); the app that needs the driver
  is brought to the front. Enforces the real multi-apper rule *one active trip
  per active app* (protects acceptance rate; the pattern lifts earnings 20–40%).
  Wired through the session reducer (`TRIP_END`, `ID_CHECK_*`, `SET_ONLINE`,
  `SET_COORD`) and mirrored on-device by new `MultiAppCoordinator.kt` (detects
  trip/verify state from the node tree, taps pause/resume via `ACTION_CLICK`,
  switches apps via launch intent). App phase machine gains a `trip` phase with
  an on-trip banner; Home shows a live per-platform status strip. **Scope note:**
  this is the first automation that *taps the other apps* — see VISION §6 update.
  Farely still never taps Accept on a ride offer; the money decision stays human.
- **Identity-check passthrough (safety-critical).** Uber Real-Time ID Check /
  Bolt selfie verification is now sacred: on any face-check screen the coordinator
  sets `frozen`, all automation stops, the verdict overlay is pulled, and a
  full-screen `IdCheckOverlay` explains the stand-down. Native detection is
  broad PL/EN keyword matching over the node tree, biased to false-positive
  (a needless pause) over false-negative (covering the camera).
- **Venue events calendar + phone-calendar export.** New `src/app/lib/events.ts`:
  Wrocław venues (Zoo, Hala Stulecia, Opera, NFM, Tarczyński Arena, A2, Impart)
  with verified July–Aug 2026 listings (Songkick/venue calendars) plus each
  venue's typical recurring schedule. Let-outs priced with the same `zoneEph`
  model as the map, merged into Home "Opportunities", and browsable on a new
  **Events** tab (day strip + per-event cards). Export a positioning window to
  the phone calendar: `.ics` VCALENDAR download on web, `CalendarContract`
  insert intent on device (new `addToCalendar` bridge method, no permission).
- **In-app + native notification system.** Session-level `Notice` feed (capped,
  deduped) with a bell + unread badge on Home and a `NotificationPanel`. Sources:
  autopilot actions, zone-dropped-below-target, let-out-within-45-min, ID checks.
  Deliberately quiet per NN/g guidance (timely + specific + rare, or trust dies).
  Native mirror: `FarelyNotifications.kt` low-importance channel + `notify` bridge
  method + `POST_NOTIFICATIONS`.
- **Potato-phone auto-detect + LITE tier.** New `src/app/lib/device.ts` sniffs
  `deviceMemory`/`hardwareConcurrency`/`saveData`/reduced-motion (and Android
  `isLowRamDevice` via new `deviceProfile` bridge method). Low-end → LITE:
  `MapView` swaps the MapLibre GL/WebGL map for a flat DOM/SVG projection of the
  same data, animations/transitions drop, refresh clock slows to 30 s. MapLibre
  is now **dynamic-imported** into its own 1 MB chunk, so LITE phones never
  download or parse it. Settings shows the detected tier + Auto/Full/Lite override.
- Build: `npm run build` green (main bundle 259 kB, maplibre split out).
  `native/android/` staging re-mirrored; manifest gains `POST_NOTIFICATIONS` +
  `<queries>` for package visibility (launch other driver apps, calendar insert).

## 2026-07-03
- **Phase 2 wired end-to-end (code-complete).** `App.tsx` now registers the
  `FarelyBridge` Capacitor plugin: on-device it listens for `farely:rawOffer`,
  converts via new `engine.ts offerFromRaw()` (fuzzy `resolvePlace` for Polish
  address text, missing km/min estimated from geography or by inverting the
  platform fare formula, `approx` flag surfaces "~ estimated" on the card),
  scores with the unchanged `scoreOffer()`, and disables the simulator loop
  (`IS_NATIVE`). Capture-service status polled via new `status()` plugin method
  and shown on LIVE + SETUP. Remaining for Phase 2 exit: validate on device.
- **Phase 3 overlay implemented.** New `OverlayController.kt` draws the
  ACCEPT/MARGINAL/DECLINE bubble (net zł, zł/h, zł/km, reason) over the ride app
  using `TYPE_ACCESSIBILITY_OVERLAY` (no extra permission; attached via the
  running service). `FLAG_NOT_FOCUSABLE` keeps the ride app's buttons usable;
  tap-to-dismiss, 20 s auto-hide, and the service hides it when the offer card
  disappears. JS pushes it from the score effect (`showOverlay`/`hideOverlay`).
- **Parser correctness (earnings-critical).** `OfferNodeParser` no longer takes
  the *first* money/km/min match: ride cards list the pickup leg before the trip
  leg, so first-match read the deadhead as the trip. Now: fare = **largest**
  amount on the card; two km/min hits → first = pickup (deadhead), last = trip
  (`RawOffer.pickupKm/pickupMin` added, JSON + JS mapping updated).
- **FreeNow package id fixed:** real driver app is `taxi.android.driver`
  (ex-mytaxi); legacy `com.mytaxi.driver` kept. Manifest config + service map.
- **Honest earnings math.** On device, session zł/h = net ÷ wall-clock shift
  time (idle counts against you — the number to compare with the target); the
  simulator keeps simulated trip time (real time is compressed there).
  `moveSuggestion` now charges repositioning *time* (earning nothing while
  driving there), not just fuel.
- **UI fixes:** platform chips no longer hardcode Bolt as the only active one;
  "Color offers by threshold" toggle actually controls card coloring now;
  zone-list selection keyed by zone (indexes drifted on re-sort); rider
  name/rating hidden when unknown (real captures don't have them).
- `native/android/` staging mirrored; `gradlew assembleDebug` → BUILD SUCCESSFUL;
  11-case engine smoke test passing (resolvePlace/parseSurge/offerFromRaw/moveSuggestion).

## 2026-07-02
- **Phase 2 code integrated + first successful native build.** Copied the 5 staged
  `.kt` files into `android/app/src/main/java/com/farely/app/`, added `res/xml/
  accessibility_service_config.xml`, merged the accessibility service + 4 permissions
  into `AndroidManifest.xml`, added the a11y description string, and registered
  `FarelyBridgePlugin` in `MainActivity`. Added Kotlin support (root classpath
  `kotlin-gradle-plugin:2.0.21`, app `kotlin-android` plugin, jvmTarget 21) since the
  Capacitor template is Java-only. Local SDK: only platform android-36 installed and
  no cmdline-tools, so bumped compileSdk/targetSdk 35→36 + `suppressUnsupportedCompileSdk`,
  wrote `local.properties`. `./gradlew assembleDebug` → **BUILD SUCCESSFUL (6m31s)** →
  `app/build/outputs/apk/debug/app-debug.apk` (4.0 MB). Kotlin compiled clean.
  Remaining for Phase 2: wire the JS `farely:rawOffer` listener in `App.tsx`, run on device.
- **Vision locked.** Added `docs/VISION.md` (north-star). Scope decisions:
  personal single-driver tool (not a product/OSS); full co-pilot (offer decisions
  + zoning + earnings intelligence + self-tuning); Wrocław/PLN only; intent =
  maximize own earnings + craft/portfolio. Non-goals: no multi-city, no iOS, no
  platform API, no auto-accept. Linked from ocr-overlay README.
- **Phase 1 scaffolded.** Added Capacitor 7.6.7 (`@capacitor/core`, `@capacitor/android`
  deps; `@capacitor/cli` devDep — all exact-pinned). Config in `capacitor.config.json`
  (JSON, not TS, to avoid adding a `typescript` dep; appId `com.farely.app`, webDir `dist`).
  `npm run build` → `npx cap add android` created the native `android/` project;
  `MainActivity.java` sits at `com/farely/app/` — matches the staged `.kt` package.
  Remaining for Phase 1 exit: build + run the APK on a physical device (needs Android
  Studio/SDK, not available in this repo's toolchain).
- **Phase 0 complete.** Created the documentation set under `docs/ocr-overlay/`:
  README (charter + index), 01-architecture, 02-roadmap (status board),
  03-android-permissions-and-legal, 04-accessibility-service (Phase 2 spec).
- **Phase 2 source staged** under `native/android/` (does not compile until
  Phase 1 / Capacitor creates the `android/` project). Reference implementation of
  the accessibility service, node parser, OCR fallback stub, bridge plugin, and
  manifest additions.
- Web simulation untouched and fully working.
