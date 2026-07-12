// ─── Farely scoring engine ───────────────────────────────────────────────────
// Pure, side-effect-free domain logic. Everything the UI shows is *computed* from
// a real vehicle profile + a generated offer — nothing on screen is hardcoded.
// See src/imports/pasted_text/farely-product-plan.md for the product intent.

export type Platform = "Uber" | "Bolt" | "FreeNow";
export type Verdict = "accept" | "marginal" | "decline";

// ─── Vehicle profile (the one manual input the cost engine needs) ─────────────

export interface VehicleProfile {
  model: string;
  year?: number; // model year (from the car search)
  fuel?: string; // FuelKind from carLookup — "petrol" | "diesel" | "hybrid" | "phev" | "ev" | "lpg"
  lPer100km: number; // fuel economy (for EVs this is kWh/100km)
  fuelPricePerL: number; // zł/litre (for EVs: zł/kWh)
  maintenancePerKm: number; // reserve for service/wear
  depreciationPerKm: number; // value lost per km driven
  tiresPerKm: number;
  insurancePerMonth: number; // shown for context, not in per-km cost
}

// Real defaults: Škoda Octavia 1.6 TDI, Wrocław diesel ~6.50 zł/L (mid-2026).
// All money in Polish złoty (PLN), the real currency for Wrocław.
export const DEFAULT_VEHICLE: VehicleProfile = {
  model: "Škoda Octavia 1.6 TDI",
  year: 2019,
  fuel: "diesel",
  lPer100km: 5.8,
  fuelPricePerL: 6.5,
  maintenancePerKm: 0.18,
  depreciationPerKm: 0.5,
  tiresPerKm: 0.05,
  insurancePerMonth: 380,
};

/** Marginal running cost of driving one km, straight from the profile. */
export function runningCostPerKm(v: VehicleProfile): number {
  const fuel = (v.lPer100km / 100) * v.fuelPricePerL;
  return fuel + v.maintenancePerKm + v.depreciationPerKm + v.tiresPerKm;
}

// ─── Thresholds (self-tuning, never asked upfront) ────────────────────────────

export type ThresholdMode = "auto" | "manual";

export interface Thresholds {
  minEurHr: number; // self-tuned net zł/hr bar (learned from decisions)
  minEurKm: number;
  decisions: number; // how many accept/decline calls have tuned these
  mode: ThresholdMode; // "manual" = driver's targetHr wins; "auto" = learned bar
  targetHr: number; // driver's manual net zł/hr target (e.g. 63) — Uber-style EpH goal
  targetKm: number; // driver's manual net zł/km target (e.g. 2.0)
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minEurHr: 120, // PLN/hr floor (~net after costs) for Wrocław
  minEurKm: 3.5, // PLN/km floor
  decisions: 47, // seeded from prior shifts so day-one isn't a cold start
  mode: "manual", // driver drives with an explicit target by default
  targetHr: 63, // net zł/hr goal — "show me green only above this"
  targetKm: 2.0, // net zł/km floor (ref apps gate on min zł/km too)
};

/**
 * The net zł/hr bar the UI actually scores against. In manual mode the driver's
 * explicit target wins (so "green = clears my 63" is literal); in auto mode we
 * fall back to the self-tuned bar. Keeps every screen honest about one number.
 */
export function effectiveHrBar(t: Thresholds): number {
  return t.mode === "manual" ? t.targetHr : t.minEurHr;
}

/** Net zł/km bar: manual target in manual mode, self-tuned floor otherwise. */
export function effectiveKmBar(t: Thresholds): number {
  return t.mode === "manual" ? t.targetKm : t.minEurKm;
}

/**
 * Nudge thresholds toward the boundary the driver actually reveals: accepting a
 * weak offer lowers the bar a touch, declining a strong one raises it. Classic
 * "the bar lives between your worst yes and your best no." Bounded so one tap
 * can't wreck the model.
 */
export function tuneThresholds(
  t: Thresholds,
  offer: ScoredOffer,
  decision: "accept" | "decline",
): Thresholds {
  const rate = 0.06; // learning rate
  let minEurHr = t.minEurHr;
  if (decision === "accept" && offer.perHr < t.minEurHr) {
    minEurHr += (offer.perHr - t.minEurHr) * rate;
  } else if (decision === "decline" && offer.perHr > t.minEurHr) {
    minEurHr += (offer.perHr - t.minEurHr) * rate;
  }
  minEurHr = clamp(minEurHr, 70, 260);
  return {
    ...t,
    minEurHr: round(minEurHr, 2),
    minEurKm: round(clamp(minEurHr / 34, 2.5, 6), 2), // km bar tracks the hr bar
    decisions: t.decisions + 1,
  };
}

// ─── Wrocław geography (real places, real coordinates) ────────────────────────

export interface Place {
  name: string;
  short: string;
  lat: number;
  lng: number;
  zone: string;
  hub?: boolean; // airport / rail — structurally high demand
}

export const PLACES: Place[] = [
  { name: "Rynek (Stare Miasto)", short: "Rynek", lat: 51.1100, lng: 17.0325, zone: "City Centre" },
  { name: "Port lotniczy Wrocław · WRO", short: "Lotnisko WRO", lat: 51.1027, lng: 16.8858, zone: "Airport", hub: true },
  { name: "Wrocław Główny", short: "Wrocław Gł.", lat: 51.0980, lng: 17.0367, zone: "City Centre", hub: true },
  { name: "Nadodrze", short: "Nadodrze", lat: 51.1250, lng: 17.0380, zone: "Nadodrze" },
  { name: "Krzyki", short: "Krzyki", lat: 51.0800, lng: 17.0300, zone: "Krzyki" },
  { name: "Biskupin", short: "Biskupin", lat: 51.1000, lng: 17.0800, zone: "Biskupin" },
  { name: "Sępolno", short: "Sępolno", lat: 51.1080, lng: 17.0900, zone: "Biskupin" },
  { name: "Plac Grunwaldzki", short: "Pl. Grunwaldzki", lat: 51.1130, lng: 17.0570, zone: "City Centre" },
  { name: "Grabiszyn", short: "Grabiszyn", lat: 51.0900, lng: 16.9950, zone: "Grabiszyn" },
  { name: "Gaj", short: "Gaj", lat: 51.0700, lng: 17.0500, zone: "Krzyki" },
  { name: "Ołbin", short: "Ołbin", lat: 51.1200, lng: 17.0450, zone: "Nadodrze" },
  { name: "Psie Pole", short: "Psie Pole", lat: 51.1550, lng: 17.0800, zone: "Psie Pole" },
  { name: "Karłowice", short: "Karłowice", lat: 51.1300, lng: 17.0350, zone: "Nadodrze" },
  { name: "Oporów", short: "Oporów", lat: 51.0730, lng: 16.9650, zone: "Grabiszyn" },
];

const R = 6371; // earth radius km

/** Great-circle distance in km. */
export function haversineKm(a: Place, b: Place): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Road distance ≈ straight-line × detour factor (Wrocław streets aren't grids). */
export function roadKm(a: Place, b: Place): number {
  return haversineKm(a, b) * 1.3;
}

// ─── Offer generation ─────────────────────────────────────────────────────────

export interface Offer {
  id: number;
  platform: Platform;
  from: Place;
  to: Place;
  tripKm: number;
  tripMin: number;
  deadheadKm: number;
  deadheadMin: number;
  fare: number; // gross offer shown by the platform
  surge: number; // 1.0 = no surge
  passenger: string; // rider name shown on the platform offer ("" when unknown)
  rating: number; // rider rating (1..5, 0 = unknown)
  timestamp: number;
  approx?: boolean; // true when some fields were estimated from a screen capture
}

const RIDER_NAMES = [
  "Kasia", "Marek", "Anna", "Piotr", "Ewa", "Tomasz", "Zofia", "Jakub",
  "Magda", "Paweł", "Ola", "Bartek", "Nina", "Krzysztof", "Julia",
];

export interface ScoredOffer extends Offer {
  runningCost: number;
  deadheadCost: number;
  net: number;
  perKm: number;
  perHr: number;
  perMin: number;
  verdict: Verdict;
  reason: string; // plain-language "why this verdict" (NN/g #9)
}

// Realistic per-platform pricing (Wrocław, PLN). base + zł/km + zł/min, × surge.
const PRICING: Record<Platform, { base: number; perKm: number; perMin: number }> = {
  Uber: { base: 6.0, perKm: 2.6, perMin: 0.45 },
  Bolt: { base: 5.0, perKm: 2.4, perMin: 0.4 },
  FreeNow: { base: 7.0, perKm: 2.8, perMin: 0.5 },
};

function avgSpeedKmH(from: Place, to: Place): number {
  // Airport / long hops flow faster; inner-city crawls.
  if (from.hub || to.hub) return 42;
  return 24;
}

/**
 * Generate the next realistic offer starting from where the driver just dropped
 * off. `installed` limits which platforms can appear (auto-detected, Section 1).
 */
export function generateOffer(
  position: Place,
  installed: Platform[],
  seq: number,
): Offer {
  const platform = pick(installed);
  // Pickup: usually near current position (short deadhead), sometimes further.
  const from = weightedNearby(position);
  let to = pick(PLACES);
  while (to.name === from.name) to = pick(PLACES);

  const tripKm = round(roadKm(from, to), 1);
  const speed = avgSpeedKmH(from, to);
  const tripMin = Math.max(4, Math.round((tripKm / speed) * 60 + rnd(1, 4)));

  const deadheadKm = round(roadKm(position, from), 1);
  const deadheadMin = Math.max(0, Math.round((deadheadKm / 22) * 60));

  // Surge: mostly none, occasional spike (hubs surge more often).
  const surgeRoll = Math.random();
  const surge =
    (from.hub || to.hub ? surgeRoll > 0.55 : surgeRoll > 0.8)
      ? round(rnd(1.15, 1.6), 2)
      : 1;

  const p = PRICING[platform];
  const fare = round((p.base + p.perKm * tripKm + p.perMin * tripMin) * surge, 2);

  return {
    id: seq,
    platform,
    from,
    to,
    tripKm,
    tripMin,
    deadheadKm,
    deadheadMin,
    fare,
    surge,
    passenger: pick(RIDER_NAMES),
    rating: round(rnd(4.2, 5.0), 1),
    timestamp: Date.now(),
  };
}

/** Apply the full cost model + verdict. This is the heart of Feature 1. */
export function scoreOffer(
  offer: Offer,
  v: VehicleProfile,
  t: Thresholds,
): ScoredOffer {
  const cpk = runningCostPerKm(v);
  const runningCost = round(offer.tripKm * cpk, 2);
  const deadheadCost = round(offer.deadheadKm * cpk, 2);
  const net = round(offer.fare - runningCost - deadheadCost, 2);

  const totalMin = offer.tripMin + offer.deadheadMin;
  const perHr = round(net / (totalMin / 60), 2);
  const perKm = round(net / offer.tripKm, 2);
  const perMin = round(net / totalMin, 2);

  const bar = effectiveHrBar(t);
  const kmBar = effectiveKmBar(t);
  const hrOk = perHr >= bar;
  const kmOk = perKm >= kmBar;
  let verdict: Verdict;
  let reason: string;
  if (hrOk && kmOk) {
    verdict = "accept";
    reason = `${perHr.toFixed(0)} zł/hr & ${perKm.toFixed(2)} zł/km clear your ${bar.toFixed(0)} / ${kmBar.toFixed(2)} targets`;
  } else if (perHr >= bar * 0.85 && perKm >= kmBar * 0.85) {
    verdict = "marginal";
    reason =
      offer.deadheadKm > 3
        ? `${offer.deadheadKm} km deadhead eats the margin — just under your targets`
        : `close to your ${bar.toFixed(0)} zł/hr · ${kmBar.toFixed(2)} zł/km targets`;
  } else {
    verdict = "decline";
    reason = !hrOk && !kmOk
      ? `${perHr.toFixed(0)} zł/hr & ${perKm.toFixed(2)} zł/km both below target`
      : !hrOk
        ? `${perHr.toFixed(0)} zł/hr is below your ${bar.toFixed(0)} zł/hr target`
        : `${perKm.toFixed(2)} zł/km is below your ${kmBar.toFixed(2)} zł/km target`;
  }

  return {
    ...offer,
    runningCost,
    deadheadCost,
    net,
    perKm,
    perHr,
    perMin,
    verdict,
    reason,
  };
}

// ─── Native capture (Android accessibility service → engine) ─────────────────

/**
 * A ride offer read off the phone screen by the Android accessibility service
 * (mirrors native RawOffer.kt / RawOffer.toJson()). Every field except platform
 * and capturedAt can be missing — offerFromRaw() estimates the gaps.
 */
export interface RawOffer {
  platform: string;
  fare: number | null;
  pickupText: string | null;
  dropoffText: string | null;
  tripKm: number | null;
  tripMin: number | null;
  pickupKm: number | null; // approach (deadhead) leg, when the card shows it
  pickupMin: number | null;
  surgeText: string | null; // e.g. "1.4x"
  source: string; // "node" | "ocr"
  ocrConfidence: number | null;
  capturedAt: number;
}

const PLATFORM_NAMES: Platform[] = ["Uber", "Bolt", "FreeNow"];

/** Lowercase, strip Polish diacritics — for fuzzy place matching. */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Best-effort match of captured address text onto a known Wrocław place. */
export function resolvePlace(text: string | null): Place | null {
  if (!text) return null;
  const t = normalizeText(text);
  let best: Place | null = null;
  let bestScore = 0;
  for (const p of PLACES) {
    for (const key of [p.name, p.short, p.zone]) {
      const tokens = normalizeText(key)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);
      if (tokens.length === 0) continue;
      const hits = tokens.filter((w) => t.includes(w)).length;
      const score = hits / tokens.length;
      if (hits > 0 && score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** "1.4x" / "1,4x" → 1.4; anything unparseable or implausible → 1. */
export function parseSurge(s: string | null): number {
  if (!s) return 1;
  const m = s.match(/(\d+[.,]?\d*)/);
  const v = m ? parseFloat(m[1].replace(",", ".")) : NaN;
  return Number.isFinite(v) && v >= 1 && v <= 5 ? round(v, 2) : 1;
}

const truncate = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Turn a screen capture into a scoreable Offer. Needs at least a fare; missing
 * distances/times are estimated (approx = true) — from geography when both
 * endpoints resolve to known places, else by inverting the platform's fare
 * formula. Deadhead defaults from driver position → pickup.
 */
export function offerFromRaw(raw: RawOffer, position: Place, seq: number): Offer | null {
  if (raw.fare == null || raw.fare <= 0) return null;
  const platform = (
    PLATFORM_NAMES.includes(raw.platform as Platform) ? raw.platform : "Bolt"
  ) as Platform;
  const surge = parseSurge(raw.surgeText);
  let approx = false;

  const fromResolved = resolvePlace(raw.pickupText);
  const toResolved = resolvePlace(raw.dropoffText);
  const pickupLabel = raw.pickupText?.trim();
  const dropoffLabel = raw.dropoffText?.trim();
  const from: Place =
    fromResolved ??
    { ...position, name: pickupLabel || position.name, short: pickupLabel ? truncate(pickupLabel) : position.short };
  const to: Place =
    toResolved ??
    { ...from, name: dropoffLabel || "Unknown dropoff", short: dropoffLabel ? truncate(dropoffLabel) : "?" };

  let deadheadKm: number;
  if (raw.pickupKm != null) deadheadKm = raw.pickupKm;
  else if (fromResolved) deadheadKm = round(roadKm(position, fromResolved), 1);
  else {
    deadheadKm = 1.2; // typical dispatch radius when the card hides it
    approx = true;
  }
  const deadheadMin = raw.pickupMin ?? Math.max(1, Math.round((deadheadKm / 22) * 60));

  let tripKm: number;
  if (raw.tripKm != null) tripKm = raw.tripKm;
  else if (fromResolved && toResolved && fromResolved.name !== toResolved.name) {
    tripKm = round(roadKm(fromResolved, toResolved), 1);
    approx = true;
  } else {
    // Invert fare ≈ (base + perKm·km + perMin·(km/speed·60)) × surge for km.
    const p = PRICING[platform];
    const speed = 24;
    tripKm = round(Math.max(1, (raw.fare / surge - p.base) / (p.perKm + (p.perMin * 60) / speed)), 1);
    approx = true;
  }
  let tripMin: number;
  if (raw.tripMin != null) tripMin = raw.tripMin;
  else {
    tripMin = Math.max(4, Math.round((tripKm / avgSpeedKmH(from, to)) * 60));
    approx = true;
  }

  return {
    id: seq,
    platform,
    from,
    to,
    tripKm,
    tripMin,
    deadheadKm,
    deadheadMin,
    fare: raw.fare,
    surge,
    passenger: "",
    rating: 0,
    timestamp: raw.capturedAt || Date.now(),
    approx,
  };
}

// ─── Demand zones (live signals, recomputed against the clock) ────────────────

export type SignalKind = "flights" | "transit" | "events" | "weather" | "baseline";

// ─── Historical demand curve (grounded in open taxi/rideshare datasets) ───────
// Weekday demand by hour-of-day, normalised so 1.0 = an average hour. Shape from
// NYC TLC + Chicago rideshare open data: overnight trough, ~08:00 AM peak, midday
// dip, strong 17:00–20:00 PM peak, late-evening social bump.
// Sources: nycdatascience.com NYC-taxi-demand study; urbanspatial Chicago rideshare.
// prettier-ignore
const HOURLY_DEMAND: number[] = [
  0.35, 0.24, 0.18, 0.16, 0.22, 0.45, // 00–05
  0.85, 1.20, 1.45, 1.15, 0.90, 0.88, // 06–11
  0.95, 0.92, 0.86, 0.90, 1.10, 1.42, // 12–17
  1.55, 1.48, 1.20, 0.95, 0.78, 0.55, // 18–23
];

/** Weekend shifts the curve later: softer morning, fatter late-night tail. */
function hourDemand(now: Date): number {
  const h = now.getHours();
  const base = HOURLY_DEMAND[h];
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  if (!weekend) return base;
  if (h >= 0 && h <= 3) return base * 1.8; // clubs let out
  if (h >= 6 && h <= 9) return base * 0.6; // no commute
  return base;
}

// Per-zone structural demand: how many zł/hr this area yields in an *average*
// hour, before the hour-of-day curve and live surge. Hubs (airport/rail) and the
// core run hot; residential edges run cool. Calibrated to Wrocław PLN net rates.
const ZONE_BASE_EPH: Record<string, number> = {
  "City Centre": 68,
  Airport: 62,
  Nadodrze: 52,
  Biskupin: 44,
  Krzyki: 46,
  Grabiszyn: 42,
  "Psie Pole": 38,
};

export interface ZoneSignal {
  name: string;
  zone: string; // engine zone key (matches Place.zone)
  lat: number;
  lng: number;
  hub?: boolean;
  heat: number; // 0..1 — normalised busyness for the color ramp
  eph: number; // expected NET zł/hr right now (the real signal Uber shows)
  distKm: number;
  note: string;
  kind: SignalKind;
}

/**
 * Expected net zł/hr for a zone right now = structural base × hour-of-day curve
 * × live surge wobble. This is the number the map is colored by (Uber's EpH).
 * Exported so the events calendar can price venue let-outs with the same model.
 */
export function zoneEph(zoneKey: string, now: Date, surge: number): number {
  const base = ZONE_BASE_EPH[zoneKey] ?? 40;
  return round(base * hourDemand(now) * surge, 0);
}

// heat is EpH mapped onto 0..1 against a plausible 30–110 zł/hr window.
function ephToHeat(eph: number): number {
  return clamp((eph - 30) / 80, 0.05, 0.99);
}

/**
 * Build the live zone board relative to `now`: real coordinates for the map, a
 * data-driven EpH per zone (hour curve + surge), and live notes. Ordered by EpH
 * so index 0 is the hottest zone, not a fixed one.
 */
export function liveZones(now: Date, position: Place): ZoneSignal[] {
  const mins = (target: Date) => Math.round((target.getTime() - now.getTime()) / 60000);
  const nextFlightWave = new Date(now.getTime() + (14 + Math.round(Math.sin(now.getMinutes()) * 6)) * 60000);
  const lastTrain = new Date(now);
  lastTrain.setHours(23, 45, 0, 0);
  const trainMin = mins(lastTrain);

  // Slow surge wobble so the board breathes on reload without being random noise.
  const w = now.getMinutes() / 60;
  const surge = (amp: number) => 1 + Math.sin(w * Math.PI * 2) * amp;

  const anchor = (zoneKey: string) => PLACES.find((p) => p.zone === zoneKey)!;
  const build = (zoneKey: string, surgeAmp: number, note: string, kind: SignalKind): ZoneSignal => {
    const p = anchor(zoneKey);
    const eph = zoneEph(zoneKey, now, surge(surgeAmp));
    return {
      name: p.zone,
      zone: zoneKey,
      lat: p.lat,
      lng: p.lng,
      hub: p.hub,
      eph,
      heat: ephToHeat(eph),
      distKm: round(roadKm(position, p), 1),
      note,
      kind,
    };
  };

  const zones = [
    build("City Centre", 0.06, position.zone === "City Centre" ? "You are here" : "Nightlife + venues", "events"),
    build("Airport", 0.1, `↑ flight wave ARR in ${Math.max(1, mins(nextFlightWave))} min`, "flights"),
    build("Nadodrze", 0.07, "Restaurant + bar demand", "events"),
    build("Biskupin", 0.05, "Residential baseline", "baseline"),
    build("Krzyki", 0.05, trainMin > 0 ? `Last train in ${trainMin} min` : "Post-last-train wave", "transit"),
    build("Grabiszyn", 0.04, "Below average", "baseline"),
    build("Psie Pole", 0.04, "Edge of city — thin", "baseline"),
  ];

  return zones.sort((a, b) => b.eph - a.eph);
}

export interface ZoneRanking {
  here: ZoneSignal | null; // driver's current zone
  clearsTarget: ZoneSignal[]; // zones at/above the target, best first
  best: ZoneSignal; // hottest zone overall (fallback when none clears target)
  meetsTarget: boolean; // does anything clear the target right now?
}

/**
 * Rank the board against the driver's target. Powers "your zone died — next best
 * hourly rate is X". When nothing clears the target we surface the hottest zone
 * so the driver always has a next move, per Uber's guidance-heatmap behaviour.
 */
export function rankZones(zones: ZoneSignal[], targetHr: number, position: Place): ZoneRanking {
  const byEph = [...zones].sort((a, b) => b.eph - a.eph);
  const here = zones.find((z) => z.zone === position.zone) ?? null;
  const clearsTarget = byEph.filter((z) => z.eph >= targetHr);
  return {
    here,
    clearsTarget,
    best: byEph[0],
    meetsTarget: clearsTarget.length > 0,
  };
}

/**
 * Repositioning suggestion, expected-value gated: compare the next hour if you
 * stay (earn hereEph) vs. if you move (drive distKm earning nothing, pay fuel,
 * then earn the new zone's EpH for the remaining minutes). Only suggested when
 * the move wins. Prefers zones that clear the driver's target.
 */
export function moveSuggestion(zones: ZoneSignal[], v: VehicleProfile, position: Place, targetHr: number) {
  const here = zones.find((z) => z.zone === position.zone);
  const hereEph = here?.eph ?? 0;
  const best = zones
    .filter((z) => z.zone !== position.zone)
    .map((z) => {
      const fuel = z.distKm * runningCostPerKm(v);
      const travelH = z.distKm / 22; // repositioning eats earning time
      const moveHour = z.eph * Math.max(0, 1 - travelH) - fuel;
      return {
        zone: z,
        gain: round(moveHour - hereEph, 2),
        cost: round(fuel + z.eph * Math.min(1, travelH), 2), // fuel + time actually forgone
        clears: z.eph >= targetHr,
      };
    })
    .filter((c) => c.gain > 0)
    // prefer zones that clear the target, then by net gain
    .sort((a, b) => Number(b.clears) - Number(a.clears) || b.gain - a.gain)[0];
  return best ?? null;
}

// ─── Recommendations feed (flight waves / trains / events) ────────────────────

export interface DemandEvent {
  id: string;
  kind: SignalKind;
  title: string; // "Flight wave · WRO"
  detail: string; // "3 arrivals land within 25 min"
  zone: string; // engine zone key
  etaMin: number; // minutes until the demand spike
  eph: number; // expected net zł/hr if you're positioned for it
  distKm: number;
}

/**
 * Upcoming demand spikes worth pre-positioning for — the "why" behind the map.
 * Times are derived from `now` (flight bank cadence, last-train, venue let-out)
 * and grounded in real Wrocław hubs. In production these bind to the WRO flight
 * schedule API + Wrocław GTFS open-data + a local events calendar.
 */
export function demandSignals(now: Date, position: Place): DemandEvent[] {
  const h = now.getHours();
  const m = now.getMinutes();
  const dist = (zoneKey: string) => {
    const p = PLACES.find((x) => x.zone === zoneKey);
    return p ? round(roadKm(position, p), 1) : 0;
  };
  const out: DemandEvent[] = [];

  // Flight banks arrive in clusters; next bank ~12–24 min out, bigger in evening.
  const flightEta = 12 + Math.round(Math.abs(Math.sin(m)) * 12);
  const flightCount = h >= 17 && h <= 22 ? 4 : 2;
  out.push({
    id: "wro-arr",
    kind: "flights",
    title: "Flight wave · WRO",
    detail: `${flightCount} arrivals land within ${flightEta + 8} min`,
    zone: "Airport",
    etaMin: flightEta,
    eph: zoneEph("Airport", new Date(now.getTime() + flightEta * 60000), 1.35),
    distKm: dist("Airport"),
  });

  // Rail: intercity arrivals feed the centre; flag the last-train surge late.
  const lastTrain = new Date(now);
  lastTrain.setHours(23, 45, 0, 0);
  const trainMin = Math.round((lastTrain.getTime() - now.getTime()) / 60000);
  out.push({
    id: "rail",
    kind: "transit",
    title: "Wrocław Główny",
    detail: trainMin > 0 && trainMin < 90 ? `Last-train exodus in ${trainMin} min` : "IC arrival every ~20 min",
    zone: "City Centre",
    etaMin: trainMin > 0 && trainMin < 90 ? trainMin : 18,
    eph: zoneEph("City Centre", now, trainMin > 0 && trainMin < 90 ? 1.4 : 1.1),
    distKm: dist("City Centre"),
  });

  // Evening venue let-out (Hala Stulecia / Rynek nightlife) — grounded example.
  if (h >= 19 || h <= 1) {
    const outEta = h >= 22 || h <= 1 ? 5 + m % 20 : 45;
    out.push({
      id: "venue",
      kind: "events",
      title: "Nightlife let-out · Rynek",
      detail: h >= 22 || h <= 1 ? "Bars emptying — surge building" : "Concert ends ~22:30",
      zone: "City Centre",
      etaMin: outEta,
      eph: zoneEph("City Centre", now, 1.5),
      distKm: dist("City Centre"),
    });
  }

  return out.sort((a, b) => a.etaMin - b.etaMin);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function rad(d: number) { return (d * Math.PI) / 180; }
function round(n: number, dp = 2) { const f = 10 ** dp; return Math.round(n * f) / f; }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function rnd(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/** Prefer a pickup close to current position (realistic short deadhead). */
function weightedNearby(position: Place): Place {
  const sorted = [...PLACES]
    .filter((p) => p.name !== position.name)
    .sort((a, b) => haversineKm(position, a) - haversineKm(position, b));
  // 65% chance one of the 4 nearest, else anywhere.
  if (Math.random() < 0.65) return pick(sorted.slice(0, 4));
  return pick(sorted);
}

export const money = (n: number) => `${n.toFixed(2)} zł`;
export const VERDICT_COLOR: Record<Verdict, string> = {
  accept: "#22c55e",
  marginal: "#f59e0b",
  decline: "#ef4444",
};
export const VERDICT_LABEL: Record<Verdict, string> = {
  accept: "ACCEPT",
  marginal: "MARGINAL",
  decline: "DECLINE",
};
export const VERDICT_BG: Record<Verdict, string> = {
  accept: "rgba(34,197,94,0.12)",
  marginal: "rgba(245,158,11,0.12)",
  decline: "rgba(239,68,68,0.12)",
};
