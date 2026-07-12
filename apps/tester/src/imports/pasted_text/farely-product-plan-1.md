Farely — Product Plan (KISS: Earnings-Only Scope)

Tagline: Know what's fair before you tap accept.

Goal, one sentence: maximize net [currency]/hr per shift via (1) accurate real-time offer scoring and (2) smart zoning — positioning toward predicted high-demand areas before the offer even appears.

Scope note: personal, solo, Android, single test account, car rides only (no delivery). Cut from this pass: dashcam, document vault, quick-reply messages, voice announcements, insights dashboards, goals tracking, branding, pricing, privacy/compliance. Kept as explicit exceptions: crash reporting (bug-fixing only) and a lightweight tech stack — both required for the app to actually run and stay usable on cheap hardware, which is a precondition for making money with it at all.

Units: SI throughout. Distance in km, fuel economy in L/100km (or kWh/100km for EVs), speed/time in standard metric. No miles, no MPG anywhere in the app.

Currency: asked directly at setup (Section 5) — not auto-derived, since locale-guessed currency isn't reliable enough for real money math.


1. Platform Coverage — Car Rides Only


Uber, Bolt, FreeNow. Nothing else — no delivery platforms, no Lyft/DoorDash/Grubhub/Uber Eats.
Only the platforms actually detected installed on the phone get a parser enabled (Section 5) — no manual toggling.



2. Feature 1 — Real-Time Offer Scoring & Net Profit Engine


Accessibility Service + OCR reads each offer the instant it appears.
Computes [currency]/km, [currency]/hour, [currency]/minute.
Deadhead-adjusted: subtracts estimated empty-return cost/time using last drop-off → new pickup, so the number reflects the real trip, not just the offer's face value.
Full cost model: fuel/EV electricity, maintenance reserve, tires, insurance allocation, depreciation, tax — all pulled from the vehicle profile (Section 4), never manually calculated per-ride.
Color verdict: 🟢 accept / 🟡 marginal / 🔴 decline, against thresholds that self-tune from your accept/decline behavior (Section 6).
Split-screen aware — correctly tags which platform sent which offer when two apps are open.



3. Feature 2 — Smart Zoning (Demand Positioning Engine)

Don't just score the offer in front of you — predict where the next good offers will come from and get there first.

3.1 Demand Signal Inputs


Events: stadiums, arenas, concerts, festivals, conventions, restaurant reservation spikes, holidays — venues auto-discovered near you, no manual entry.
Weather: rain/snow reliably spikes short-trip demand, folded in as a forecast multiplier.
Flights: arrival data by terminal/time window, predicts airport surges before they show up in any heatmap.
Transit: last train/subway/bus departure times, predicts the late-night demand wave right after last departure and the demand cliff after rush hour.
Baseline patterns: recurring local demand rhythm (commute windows, day-of-week shape) learned automatically as the time-series baseline — not a separate manual setting.


3.2 Heatmap & Repositioning


Independent supply/demand heatmap (historical + live event/weather/flight/transit signals), not dependent on any platform's own heatmap.
City-centre and airport zones weighted higher by default, refined per-city from your own outcome data over time.
Repositioning suggestion: only shown when the expected earnings gain at the new zone exceeds the fuel/time cost of getting there in km terms (reuses the Section 2 cost engine) — no suggestion that doesn't pay off net.
Exodus mode: dedicated suggestion right before a big event lets out — pre-position near exits ahead of the 15–30 min demand spike, then move again once it crashes.
Surge check: cross-references the platform's own surge pricing against Farely's independent prediction, flagging surges that look artificial/short-lived vs. genuine.
Predictive decay: "heat fading in ~20 min as last train clears — move now," so you leave before the zone goes cold, not after.


3.3 Optimization Method


MVP: rule-based + time-series forecasting per zone per hour, with event/flight/transit/weather as override signals on the historical baseline. Kept computationally cheap by design (see Section 7) — no heavy on-device model at this stage.
Upgrade path: once enough of your own outcome data exists, a small learned model can replace the rule-based forecast — but only if it still fits the lightweight/low-end-device constraint in Section 7; otherwise the forecast stays rule-based rather than bloating the app.
Repositioning-as-bandit: each suggested zone is an arm; the model learns from whether taking a suggestion actually paid off in the next N minutes, and re-ranks future suggestions accordingly.
Constrained: every suggestion respects your learned no-go zones and a fuel/time budget — "optimal" never means ignoring your own limits.



4. Vehicle Profile (required input for the cost engine)


Make / model / year / trim (autocomplete) → auto-fills fuel economy in L/100km (or kWh/100km for EVs), tank/battery size, from a fuel-economy database. Editable, not required to know cold.
Current odometer reading (km) — baseline for distance tracking.
Insurance (monthly), loan/lease payment, maintenance reserve — pre-filled with regional/vehicle-class defaults, editable. These directly feed the net-profit math in Section 2, so they're required inputs, not extras.



5. Auto-Setup (everything else)


Region/locale from GPS → tax-model default, fuel-price source, distance already fixed to km regardless of region.
Currency: asked directly, once, at first launch — a single picker, not auto-guessed.
Installed-platform scan → enables only the Uber/Bolt/FreeNow parsers actually present (Section 1).
Nearby venues/airports/transit → auto-discovered for Section 3.1, no manual entry.
Permissions: one guided tap-through for Accessibility Service, Location, Notifications.



6. Learned Over Time (never asked)


Profitability thresholds ([currency]/km, [currency]/hr floor) — start at a sensible default, self-tune from your actual accept/decline behavior.
No-go zones — flagged from repeated declines in the same area, single yes/no confirm, not a list you build upfront.
Home base / end-of-shift direction — inferred from your actual start/end locations.



7. Tech & Performance Constraints

These aren't feature-building, they're preconditions — a crashy or laggy app on the driver's actual phone earns nothing, so this is treated as core, not optional.


Native Android (Kotlin), not cross-platform. Cross-platform runtimes (Flutter/React Native) carry overhead that hurts on entry-level hardware — native keeps memory/CPU footprint smallest.
Event-driven, not polling. OCR only runs when the Accessibility Service reports a screen-content change, not on a timer — near-zero idle CPU/battery cost.
Lightweight on-device OCR. Google ML Kit Text Recognition (small model, fast, fully on-device, no network round-trip needed to read an offer).
Zoning compute stays cheap. Rule-based/statistical forecasting (Section 3.3) runs comfortably on low-end hardware; any future learned model is only adopted if it still fits this budget, otherwise it stays rule-based.
Minimal local storage. Lightweight local DB (SQLite/Room) for vehicle profile, thresholds, and recent offer/zone history — no bloated database engine.
Batched networking. Demand-signal fetches (events/flights/transit/weather) are cached and pulled on a schedule, not polled continuously — keeps data usage and radio wake-ups low.
Small install size. Minimal dependency set, so install/update stays fast and cheap on limited storage and slow connections.
Crash reporting — bug-fixing only. Lightweight local crash log on any uncaught exception, uploaded next time there's a connection. Single purpose: catch and fix bugs. Not a broader analytics/telemetry platform.



8. Roadmap (earnings-only)

Phase 1 — Offer Scoring + Net Profit Engine


Auto-setup (Section 5) + vehicle profile (Section 4), currency picker.
Real-time offer card: [currency]/km, [currency]/hr, deadhead-adjusted, full cost model, color verdict.
Crash reporting wired in from day one (Section 7) — catch bugs as soon as real usage starts.


Phase 2 — Smart Zoning, Rule-Based


Event/weather/flight/transit signal ingestion (Section 3.1).
Heatmap + repositioning suggestions with expected-value gating (Section 3.2).
Rule-based/time-series forecasting (Section 3.3 MVP).


Phase 3 — Smart Zoning, Learned


Upgrade forecasting to a learned model, only if it still meets the Section 7 performance budget.
Bandit-based repositioning learning from real outcomes.
No-go zones and thresholds fully self-tuned from accumulated history.



9. Open Questions


Event/flight/transit data source for your test city (Uber/Bolt/FreeNow footprint is EU-heavy) — which aggregator, solo-dev access/cost.
Fuel-economy database — need a WLTP-based EU source for L/100km and kWh/100km figures, since fueleconomy.gov-style US sources use MPG.
Location-tracking battery impact on a low-end device specifically — needs a real benchmark on cheap hardware, not a flagship phone.
Cold-start: no historical data on day one — pure event/flight/transit rules until enough outcome data accumulates.
Confirm test city, so Section 1/3.1/9.1–9.2 target the right region and data sources.