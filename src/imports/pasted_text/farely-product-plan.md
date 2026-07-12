# Farely — Product Plan (KISS: Earnings-Only Scope)

**Tagline:** *Know what's fair before you tap accept.*

**Goal, one sentence:** maximize net $/hr per shift via (1) accurate real-time offer scoring and (2) smart zoning — positioning toward predicted high-demand areas before the offer even appears.

**Scope note:** personal, solo, Android, single test account. Cut from this pass: dashcam, document vault, quick-reply messages, voice announcements, insights dashboards, goals tracking, branding, pricing, privacy/compliance, reliability engineering (self-healing OCR, low-battery mode, crash telemetry). None of that moves the needle on earnings — if it doesn't directly score an offer or point you toward money, it's out.

---

## 1. Platform Coverage

- Rideshare: Uber, Lyft, Bolt, FreeNow, Empower.
- Delivery: DoorDash, Uber Eats, Grubhub.
- Only the platforms actually detected installed on the phone get a parser enabled (Section 3.1) — no manual toggling.

---

## 2. Feature 1 — Real-Time Offer Scoring & Net Profit Engine

- Accessibility Service + OCR reads each offer the instant it appears.
- Computes $/mile, $/hour, $/minute.
- **Deadhead-adjusted**: subtracts estimated empty-return cost/time using last drop-off → new pickup, so the number reflects the *real* trip, not just the offer's face value.
- **Full cost model**: fuel/EV electricity, maintenance reserve, tires, insurance allocation, depreciation, tax — all pulled from the vehicle profile (Section 4), never manually calculated per-ride.
- Color verdict: 🟢 accept / 🟡 marginal / 🔴 decline, against thresholds that self-tune from your accept/decline behavior (Section 4).
- Split-screen aware — correctly tags which platform sent which offer when two apps are open.

---

## 3. Feature 2 — Smart Zoning (Demand Positioning Engine)

The core differentiator: don't just score the offer in front of you, predict where the *next* good offers will come from and get there first.

### 3.1 Demand Signal Inputs
- **Events**: stadiums, arenas, concerts, festivals, conventions, restaurant reservation spikes, holidays — venues auto-discovered near you, no manual entry.
- **Weather**: rain/snow reliably spikes short-trip demand, folded in as a forecast multiplier.
- **Flights**: arrival data by terminal/time window, predicts airport surges before they show up in any heatmap.
- **Transit**: last train/subway/bus departure times, predicts the late-night demand wave right after last departure and the demand cliff after rush hour.
- **Baseline patterns**: recurring local demand rhythm (commute windows, day-of-week shape) learned automatically as the time-series baseline — not a separate manual setting.

### 3.2 Heatmap & Repositioning
- Independent supply/demand heatmap (historical + live event/weather/flight/transit signals), not dependent on any platform's own heatmap.
- City-centre and airport zones weighted higher by default, refined per-city from your own outcome data over time.
- **Repositioning suggestion**: only shown when the expected earnings gain at the new zone exceeds the gas/time cost of getting there (reuses the Section 2 cost engine) — no suggestion that doesn't pay off net.
- **Exodus mode**: dedicated suggestion right before a big event lets out — pre-position near exits ahead of the 15–30 min demand spike, then move again once it crashes.
- **Surge check**: cross-references the platform's own surge pricing against Farely's independent prediction, flagging surges that look artificial/short-lived vs. genuine.
- **Predictive decay**: "heat fading in ~20 min as last train clears — move now," so you leave before the zone goes cold, not after.

### 3.3 Optimization Method
- **MVP**: rule-based + time-series forecasting per zone per hour, with event/flight/transit/weather as override signals on the historical baseline.
- **Upgrade path**: gradient-boosted/short-horizon forecasting per zone once enough of your own outcome data exists.
- **Repositioning-as-bandit**: each suggested zone is an arm; the model learns from whether taking a suggestion actually paid off in the next N minutes, and re-ranks future suggestions accordingly.
- **Constrained**: every suggestion respects your learned no-go zones and a fuel/time budget — "optimal" never means ignoring your own limits.

---

## 4. Vehicle Profile (required input for the cost engine)

The only manual entry the app can't derive itself — everything else in Section 5 is automatic.

- Make / model / year / trim (autocomplete) → auto-fills fuel economy (MPG, L/100km, or mi/kWh), tank/battery size from a fuel-economy database. Editable, not required to know cold.
- Current odometer reading — baseline for mile tracking.
- Insurance (monthly), loan/lease payment, maintenance reserve — pre-filled with regional/vehicle-class defaults, editable. These directly feed the net-profit math in Section 2, so they're required inputs, not extras.

---

## 5. Auto-Setup (everything else, zero questions)

- **Region/locale** from GPS → currency, units, tax-model default, fuel-price source.
- **Installed-platform scan** → enables only the parsers you need (Section 1).
- **Nearby venues/airports/transit** → auto-discovered for Section 3.1, no manual entry.
- **Permissions**: one guided tap-through for Accessibility Service, Location, Notifications.
- **Thresholds, no-go zones, home base**: start at a sensible default, self-tune from how you actually drive — never asked upfront.

---

## 6. Roadmap (earnings-only)

**Phase 1 — Offer Scoring + Net Profit Engine**
- Auto-setup (Section 5) + vehicle profile (Section 4).
- Real-time offer card: $/mi, $/hr, deadhead-adjusted, full cost model, color verdict.

**Phase 2 — Smart Zoning, Rule-Based**
- Event/weather/flight/transit signal ingestion (Section 3.1).
- Heatmap + repositioning suggestions with expected-value gating (Section 3.2).
- Rule-based/time-series forecasting (Section 3.3 MVP).

**Phase 3 — Smart Zoning, Learned**
- Upgrade forecasting to gradient-boosted/learned model.
- Bandit-based repositioning learning from real outcomes.
- No-go zones and thresholds fully self-tuned from accumulated history.

---

## 7. Open Questions

1. Event/flight/transit data source for your test city — which aggregator, solo-dev access/cost.
2. Fuel-economy database — fueleconomy.gov-style covers US; need a WLTP-equivalent if testing outside the US.
3. Location-tracking battery impact — continuous background GPS vs. periodic polling, needs a quick benchmark on your device.
4. Cold-start: no historical data on day one — pure event/flight/transit rules until enough outcome data accumulates.
5. OCR: build vs. buy (Google ML Kit or similar is the likely right call for a solo build).
6. Confirm platform(s) and city you're actually testing against, so Section 1/3.1 target the right region.

---

Say the word and I'll move to wireframes, technical architecture, or a build spec — whichever you want first.