// ─── Car search & spec autofill ───────────────────────────────────────────────
// "Type any car, pick the year, get real numbers." Three data layers, merged:
//   1. Built-in EU dataset — popular Polish rideshare cars (Škoda, Dacia, …)
//      that US-centric APIs don't carry. Instant, offline.
//   2. fueleconomy.gov REST API — US-EPA per-trim data, 1984→today, free,
//      no API key. MPG is converted to L/100km (235.215 / mpg).
//   3. Segment/fuel/year estimator — never leaves the driver with an empty form.
// On Android the request goes through CapacitorHttp (native layer, no CORS);
// in `npm run dev` it rides the Vite proxy at /fe-api (see vite.config.ts).

import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type FuelKind = "petrol" | "diesel" | "hybrid" | "phev" | "ev" | "lpg";

export interface CarSpec {
  make: string;
  model: string;
  year: number;
  trim?: string; // e.g. "Auto (AV-S7), 4 cyl, 1.8 L"
  fuel: FuelKind;
  lPer100km: number; // EVs: kWh/100km
  source: "built-in" | "fueleconomy.gov" | "estimate";
}

// Wrocław pump/energy prices, mid-2026 (editable in Setup).
export const FUEL_PRICE_PLN: Record<FuelKind, number> = {
  petrol: 6.1,
  diesel: 6.5,
  hybrid: 6.1,
  phev: 6.1,
  lpg: 2.9,
  ev: 0.95, // zł/kWh home+public mix
};

export const FUEL_UNIT: Record<FuelKind, { cons: string; price: string }> = {
  petrol: { cons: "L/100km", price: "zł/L" },
  diesel: { cons: "L/100km", price: "zł/L" },
  hybrid: { cons: "L/100km", price: "zł/L" },
  phev: { cons: "L/100km", price: "zł/L" },
  lpg: { cons: "L/100km", price: "zł/L" },
  ev: { cons: "kWh/100km", price: "zł/kWh" },
};

export const FUEL_LABEL: Record<FuelKind, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  phev: "Plug-in hybrid",
  ev: "Electric",
  lpg: "LPG",
};

// ─── 1 · Built-in EU dataset ──────────────────────────────────────────────────
// Combined-cycle figures (WLTP/NEDC mix) for the cars that actually work
// rideshare in Poland. [make, model, yearFrom, yearTo, fuel, L/100km]

type Row = [string, string, number, number, FuelKind, number];

const EU_CARS: Row[] = [
  ["Škoda", "Octavia 1.6 TDI", 2013, 2020, "diesel", 5.0],
  ["Škoda", "Octavia 2.0 TDI", 2013, 2025, "diesel", 5.2],
  ["Škoda", "Octavia 1.5 TSI", 2017, 2026, "petrol", 6.2],
  ["Škoda", "Fabia 1.0 TSI", 2015, 2026, "petrol", 5.6],
  ["Škoda", "Superb 2.0 TDI", 2015, 2025, "diesel", 5.6],
  ["Škoda", "Rapid 1.6 TDI", 2012, 2019, "diesel", 4.9],
  ["Toyota", "Corolla 1.8 Hybrid", 2019, 2026, "hybrid", 4.6],
  ["Toyota", "Corolla 1.6", 2013, 2019, "petrol", 6.7],
  ["Toyota", "Prius", 2016, 2026, "hybrid", 4.1],
  ["Toyota", "Yaris 1.5 Hybrid", 2017, 2026, "hybrid", 4.0],
  ["Toyota", "Auris 1.8 Hybrid", 2013, 2019, "hybrid", 4.7],
  ["Toyota", "C-HR 1.8 Hybrid", 2017, 2026, "hybrid", 4.9],
  ["Toyota", "Camry 2.5 Hybrid", 2019, 2026, "hybrid", 5.3],
  ["Volkswagen", "Passat 2.0 TDI", 2011, 2024, "diesel", 5.4],
  ["Volkswagen", "Golf 1.6 TDI", 2009, 2020, "diesel", 4.9],
  ["Volkswagen", "Golf 1.5 TSI", 2017, 2026, "petrol", 6.0],
  ["Volkswagen", "Jetta 1.6 TDI", 2011, 2018, "diesel", 5.0],
  ["Volkswagen", "Touran 2.0 TDI", 2011, 2024, "diesel", 5.8],
  ["Ford", "Focus 1.5 TDCi", 2015, 2022, "diesel", 4.8],
  ["Ford", "Mondeo 2.0 TDCi", 2015, 2022, "diesel", 5.5],
  ["Opel", "Astra 1.6 CDTI", 2014, 2021, "diesel", 4.9],
  ["Opel", "Insignia 2.0 CDTI", 2013, 2022, "diesel", 5.6],
  ["Hyundai", "i30 1.6 CRDi", 2012, 2024, "diesel", 5.0],
  ["Hyundai", "Elantra 1.6", 2016, 2026, "petrol", 6.8],
  ["Hyundai", "Ioniq Hybrid", 2017, 2022, "hybrid", 4.2],
  ["Hyundai", "Kona Electric", 2018, 2026, "ev", 15.0],
  ["Kia", "Ceed 1.6 CRDi", 2012, 2024, "diesel", 5.0],
  ["Kia", "Niro Hybrid", 2017, 2026, "hybrid", 4.8],
  ["Kia", "e-Niro", 2019, 2026, "ev", 15.9],
  ["Kia", "Optima 1.7 CRDi", 2016, 2020, "diesel", 5.4],
  ["Dacia", "Logan 1.5 dCi", 2013, 2021, "diesel", 4.5],
  ["Dacia", "Sandero 1.0 TCe", 2021, 2026, "petrol", 5.9],
  ["Dacia", "Sandero 1.0 TCe LPG", 2021, 2026, "lpg", 7.8],
  ["Renault", "Megane 1.5 dCi", 2016, 2023, "diesel", 4.7],
  ["Renault", "Clio 1.5 dCi", 2013, 2024, "diesel", 4.4],
  ["Tesla", "Model 3 RWD", 2019, 2026, "ev", 14.9],
  ["Tesla", "Model 3 Long Range", 2019, 2026, "ev", 15.7],
  ["Tesla", "Model Y RWD", 2021, 2026, "ev", 16.9],
  ["Nissan", "Leaf 40 kWh", 2018, 2025, "ev", 17.1],
  ["Nissan", "Qashqai 1.5 dCi", 2014, 2021, "diesel", 5.1],
  ["Peugeot", "308 1.5 BlueHDi", 2017, 2025, "diesel", 4.6],
  ["Peugeot", "508 1.5 BlueHDi", 2019, 2025, "diesel", 4.9],
  ["Citroën", "C4 1.5 BlueHDi", 2018, 2025, "diesel", 4.7],
  ["Seat", "Leon 1.6 TDI", 2013, 2020, "diesel", 4.9],
  ["Seat", "Toledo 1.6 TDI", 2013, 2019, "diesel", 4.8],
  ["Mazda", "3 2.0 Skyactiv-G", 2014, 2026, "petrol", 6.3],
  ["Mazda", "6 2.2 Skyactiv-D", 2013, 2024, "diesel", 5.4],
  ["Honda", "Civic 1.6 i-DTEC", 2013, 2021, "diesel", 4.7],
  ["Honda", "Civic e:HEV", 2022, 2026, "hybrid", 4.7],
  ["Mercedes-Benz", "E 220 d", 2016, 2026, "diesel", 5.6],
  ["Mercedes-Benz", "C 200 d", 2014, 2026, "diesel", 5.3],
  ["BMW", "320d", 2012, 2026, "diesel", 5.3],
  ["BMW", "520d", 2014, 2026, "diesel", 5.5],
  ["Audi", "A4 2.0 TDI", 2012, 2026, "diesel", 5.3],
  ["Audi", "A6 2.0 TDI", 2012, 2026, "diesel", 5.5],
  ["Fiat", "Tipo 1.3 MultiJet", 2016, 2021, "diesel", 4.8],
  ["Suzuki", "Swace 1.8 Hybrid", 2021, 2026, "hybrid", 4.5],
  ["Suzuki", "SX4 S-Cross 1.6 DDiS", 2014, 2021, "diesel", 5.0],
  ["Volvo", "S60 D3", 2013, 2021, "diesel", 5.4],
  ["Volvo", "V60 D4", 2014, 2023, "diesel", 5.5],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Instant, offline search of the built-in dataset. */
export function searchLocal(query: string, year?: number): CarSpec[] {
  const tokens = norm(query).split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  return EU_CARS.filter(([make, model, from, to]) => {
    const hay = norm(`${make} ${model}`);
    const tokensOk = tokens.every((t) => hay.includes(t));
    const yearOk = year == null || (year >= from && year <= to);
    return tokensOk && yearOk;
  }).map(([make, model, from, to, fuel, lkm]) => ({
    make,
    model,
    year: year != null && year >= from && year <= to ? year : to,
    trim: `${from}–${to}`,
    fuel,
    lPer100km: lkm,
    source: "built-in" as const,
  }));
}

// ─── 2 · fueleconomy.gov client ──────────────────────────────────────────────

const FE_BASE = "https://www.fueleconomy.gov/ws/rest";
const IS_NATIVE = Capacitor.isNativePlatform();
const IS_DEV = import.meta.env.DEV;

async function feGet(path: string): Promise<unknown> {
  if (IS_NATIVE) {
    const res = await CapacitorHttp.get({
      url: FE_BASE + path,
      headers: { Accept: "application/json" },
      connectTimeout: 10000,
      readTimeout: 10000,
    });
    if (res.status !== 200) throw new Error(`fueleconomy.gov ${res.status}`);
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }
  const base = IS_DEV ? "/fe-api" : FE_BASE; // dev: Vite proxy dodges CORS
  const res = await fetch(base + path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`fueleconomy.gov ${res.status}`);
  return res.json();
}

interface MenuItem {
  text: string;
  value: string;
}

/** The API returns {menuItem: [...]}, a bare object for single hits, or null. */
function items(data: unknown): MenuItem[] {
  const mi = (data as { menuItem?: MenuItem | MenuItem[] } | null)?.menuItem;
  if (!mi) return [];
  return Array.isArray(mi) ? mi : [mi];
}

export const feMakes = async (year: number) =>
  items(await feGet(`/vehicle/menu/make?year=${year}`)).map((m) => m.text);

export const feModels = async (year: number, make: string) =>
  items(await feGet(`/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`)).map(
    (m) => m.text,
  );

const feOptions = (year: number, make: string, model: string) =>
  feGet(
    `/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
  ).then(items);

interface FeVehicle {
  make: string;
  model: string;
  year: string;
  comb08: string; // combined MPG (gasoline/diesel)
  combE: string; // combined kWh/100mi (EV / PHEV electric side)
  fuelType1: string;
  atvType: string; // "Hybrid" | "Plug-in Hybrid" | "EV" | "Diesel" | ...
}

function feFuel(v: FeVehicle): FuelKind {
  const atv = v.atvType?.toLowerCase() ?? "";
  const f1 = v.fuelType1?.toLowerCase() ?? "";
  if (atv.includes("plug-in")) return "phev";
  if (atv === "ev" || f1.includes("electricity")) return "ev";
  if (atv.includes("hybrid")) return "hybrid";
  if (f1.includes("diesel")) return "diesel";
  return "petrol";
}

const MPG_TO_L100 = 235.215; // 1 mpg (US) ↔ 235.215 L/100km

function feSpec(v: FeVehicle, trim: string): CarSpec | null {
  const fuel = feFuel(v);
  let cons: number;
  if (fuel === "ev") {
    const kwh100mi = parseFloat(v.combE);
    if (!Number.isFinite(kwh100mi) || kwh100mi <= 0) return null;
    cons = kwh100mi / 1.60934; // kWh/100mi → kWh/100km
  } else {
    const mpg = parseFloat(v.comb08);
    if (!Number.isFinite(mpg) || mpg <= 0) return null;
    cons = MPG_TO_L100 / mpg;
  }
  return {
    make: v.make,
    model: v.model,
    year: parseInt(v.year, 10),
    trim,
    fuel,
    lPer100km: Math.round(cons * 10) / 10,
    source: "fueleconomy.gov",
  };
}

/**
 * Remote search: fuzzy-match the make, then the model, then pull per-trim EPA
 * records. Cheap on requests (≤ ~6 calls) and tolerant of partial queries like
 * "toyota corolla" or "corolla".
 */
export async function searchRemote(query: string, year: number): Promise<CarSpec[]> {
  const q = norm(query);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const makes = await feMakes(year);
  let make = makes.find((m) => tokens.includes(norm(m)));
  let modelTokens = tokens;
  if (make) {
    modelTokens = tokens.filter((t) => t !== norm(make!));
  } else {
    make = makes.find((m) => tokens.some((t) => norm(m).startsWith(t)));
    if (make) modelTokens = tokens.filter((t) => !norm(make!).startsWith(t));
  }
  if (!make) return [];

  const models = await feModels(year, make);
  const matched = (
    modelTokens.length === 0
      ? models
      : models.filter((m) => modelTokens.every((t) => norm(m).includes(t)))
  ).slice(0, 3);

  const out: CarSpec[] = [];
  for (const model of matched) {
    const opts = (await feOptions(year, make, model)).slice(0, 4);
    for (const o of opts) {
      try {
        const v = (await feGet(`/vehicle/${o.value}`)) as FeVehicle;
        const spec = feSpec(v, o.text);
        if (spec) out.push(spec);
      } catch {
        // one bad trim shouldn't sink the search
      }
    }
  }
  return out;
}

// ─── 3 · Estimator (last resort — never an empty form) ───────────────────────

const FUEL_BASE_CONS: Record<FuelKind, number> = {
  petrol: 7.2,
  diesel: 5.6,
  hybrid: 4.8,
  phev: 5.2,
  ev: 16.5,
  lpg: 9.2,
};

export function estimateSpec(name: string, year: number, fuel: FuelKind): CarSpec {
  let cons = FUEL_BASE_CONS[fuel];
  if (year < 2005) cons *= 1.18;
  else if (year < 2015) cons *= 1.08;
  return {
    make: "",
    model: name || "Custom car",
    year,
    fuel,
    lPer100km: Math.round(cons * 10) / 10,
    source: "estimate",
  };
}

// ─── Merged search + cost presets ────────────────────────────────────────────

export interface CarSearchResult {
  specs: CarSpec[];
  remoteError: string | null; // network failed — local results still shown
}

export async function searchCars(query: string, year: number): Promise<CarSearchResult> {
  const local = searchLocal(query, year);
  try {
    const remote = await searchRemote(query, year);
    // Dedupe: built-in rows win (EU-cycle figures beat EPA for the same car).
    const seen = new Set(local.map((s) => norm(`${s.make} ${s.model}`)));
    const merged = [
      ...local,
      ...remote.filter((s) => !seen.has(norm(`${s.make} ${s.model}`))),
    ];
    return { specs: merged, remoteError: null };
  } catch (e) {
    return {
      specs: local,
      remoteError: e instanceof Error ? e.message : "network error",
    };
  }
}

/**
 * Age-based wear presets so picking a car fills the whole cost model, not just
 * fuel: newer cars lose more value per km, older cars cost more to keep alive.
 */
export function costPresets(year: number) {
  const age = Math.max(0, new Date().getFullYear() - year);
  return {
    depreciationPerKm: clamp(0.62 - age * 0.045, 0.1, 0.62),
    maintenancePerKm: clamp(0.1 + age * 0.014, 0.1, 0.35),
    tiresPerKm: 0.05,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n * 1000) / 1000));
}
