// ─── Car: search any car by make/model/year, autofill the cost model ──────────
// Type "toyota corolla", set the year, tap a result — consumption, fuel type,
// fuel price and age-based wear presets all land in the profile. Sources:
// built-in EU dataset (instant) + fueleconomy.gov (per-trim EPA data) + an
// estimator so an exotic car still gets sane numbers. Everything stays editable.

import { useRef, useState } from "react";
import { Search, Car, ChevronDown, ChevronUp, Fuel, Loader2 } from "lucide-react";
import { useSession } from "../lib/session";
import { runningCostPerKm, type VehicleProfile } from "../lib/engine";
import {
  searchCars,
  estimateSpec,
  costPresets,
  FUEL_PRICE_PLN,
  FUEL_UNIT,
  FUEL_LABEL,
  type CarSpec,
  type FuelKind,
} from "../lib/carLookup";
import { T, MONO, SANS } from "../lib/theme";

const SOURCE_LABEL: Record<CarSpec["source"], string> = {
  "built-in": "EU data",
  "fueleconomy.gov": "EPA data",
  estimate: "estimate",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 13, color: T.ink2, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

function NumInput({
  value,
  step,
  onChange,
  unit,
  width = 76,
}: {
  value: number;
  step: number;
  onChange: (n: number) => void;
  unit: string;
  width?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ width, textAlign: "right", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: MONO, fontSize: 13, color: T.ink }}
      />
      <span style={{ fontSize: 11, color: T.ink3, minWidth: 52 }}>{unit}</span>
    </span>
  );
}

export default function CarScreen() {
  const { state, dispatch } = useSession();
  const v = state.vehicle;
  const cpk = runningCostPerKm(v);
  const fuel = (v.fuel ?? "diesel") as FuelKind;
  const units = FUEL_UNIT[fuel];

  const [query, setQuery] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 5);
  const [results, setResults] = useState<CarSpec[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [estFuel, setEstFuel] = useState<FuelKind>("petrol");
  const searchSeq = useRef(0);

  const set = (patch: Partial<VehicleProfile>) => dispatch({ type: "UPDATE_VEHICLE", patch });

  async function runSearch() {
    if (!query.trim()) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setNotice(null);
    setResults(null);
    const { specs, remoteError } = await searchCars(query.trim(), year);
    if (seq !== searchSeq.current) return; // stale response
    setSearching(false);
    setResults(specs);
    if (remoteError && specs.length > 0) setNotice("Online lookup unreachable — showing built-in data only.");
    if (remoteError && specs.length === 0) setNotice("Online lookup unreachable and no built-in match. Use the estimator below.");
  }

  function apply(spec: CarSpec) {
    const wear = costPresets(spec.year);
    set({
      model: [spec.make, spec.model].filter(Boolean).join(" "),
      year: spec.year,
      fuel: spec.fuel,
      lPer100km: spec.lPer100km,
      fuelPricePerL: FUEL_PRICE_PLN[spec.fuel],
      ...wear,
    });
    setResults(null);
    setQuery("");
    setNotice(`Applied: ${[spec.make, spec.model].filter(Boolean).join(" ")} ${spec.year} (${SOURCE_LABEL[spec.source]})`);
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: T.bg, fontFamily: SANS }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 10px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>Your car</div>
        <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>The cost engine scores every offer against this profile</div>
      </div>

      {/* current car */}
      <div style={{ margin: "0 14px 12px", background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: T.greenBg, color: T.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Car size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v.model}{v.year ? ` · ${v.year}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 2 }}>
            {FUEL_LABEL[fuel]} · {v.lPer100km} {units.cons} · {v.fuelPricePerL} {units.price}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: T.green }}>{cpk.toFixed(2)}</div>
          <div style={{ fontSize: 9.5, color: T.ink3, fontWeight: 600 }}>zł/km cost</div>
        </div>
      </div>

      {/* search */}
      <div style={{ margin: "0 14px 12px", background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 4px", fontSize: 13, fontWeight: 700, color: T.ink }}>Change car</div>
        <div style={{ display: "flex", gap: 8, padding: "8px 14px 12px" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Make & model — e.g. Toyota Corolla"
            aria-label="Car make and model"
            style={{ flex: 1, minWidth: 0, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: T.ink, fontFamily: SANS }}
          />
          <input
            type="number"
            inputMode="numeric"
            value={year}
            min={1984}
            max={new Date().getFullYear() + 1}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
            aria-label="Model year"
            style={{ width: 74, textAlign: "center", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 10, fontFamily: MONO, fontSize: 13.5, color: T.ink }}
          />
          <button
            onClick={runSearch}
            disabled={searching || !query.trim()}
            aria-label="Search car"
            style={{ width: 46, borderRadius: 10, border: "none", background: query.trim() ? T.black : T.ink4, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {searching ? <Loader2 size={18} style={{ animation: "farely-spin 0.9s linear infinite" }} /> : <Search size={18} />}
          </button>
        </div>

        {notice && (
          <div style={{ margin: "0 14px 10px", padding: "8px 12px", borderRadius: 10, background: T.blueBg, color: T.blue, fontSize: 11.5, fontWeight: 600 }}>
            {notice}
          </div>
        )}

        {results && results.length === 0 && !notice && (
          <div style={{ margin: "0 14px 10px", fontSize: 12, color: T.ink3 }}>
            No match for “{query}” in {year}. Try just the model name, or use the estimator below.
          </div>
        )}

        {results && results.length > 0 && (
          <div role="list" style={{ borderTop: `1px solid ${T.border}` }}>
            {results.slice(0, 12).map((r, i) => (
              <button
                key={i}
                role="listitem"
                onClick={() => apply(r)}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "none", border: "none", borderBottom: `1px solid ${T.border}`, cursor: "pointer", fontFamily: SANS }}
              >
                <Fuel size={15} color={T.ink3} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                    {[r.make, r.model].filter(Boolean).join(" ")} · {r.year}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: T.ink2, marginTop: 1 }}>
                    {FUEL_LABEL[r.fuel]}{r.trim ? ` · ${r.trim}` : ""} · {SOURCE_LABEL[r.source]}
                  </span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: T.green, flexShrink: 0 }}>
                  {r.lPer100km} <span style={{ fontSize: 9, color: T.ink3 }}>{FUEL_UNIT[r.fuel].cons}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* estimator for cars no database knows */}
        <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, color: T.ink2, marginBottom: 8 }}>
            Not listed? Pick the fuel — Farely estimates consumption from fuel type and year:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(FUEL_LABEL) as FuelKind[]).map((f) => (
              <button
                key={f}
                onClick={() => setEstFuel(f)}
                aria-pressed={estFuel === f}
                style={{ padding: "6px 12px", borderRadius: 999, border: estFuel === f ? "none" : `1px solid ${T.borderStrong}`, background: estFuel === f ? T.black : T.card, color: estFuel === f ? "#fff" : T.ink2, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
              >
                {FUEL_LABEL[f]}
              </button>
            ))}
            <button
              onClick={() => apply(estimateSpec(query.trim(), year, estFuel))}
              style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 999, border: "none", background: T.green, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
            >
              Apply estimate
            </button>
          </div>
        </div>
      </div>

      {/* running costs — concise, advanced folded away */}
      <div style={{ margin: "0 14px 20px", background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 2px", fontSize: 13, fontWeight: 700, color: T.ink }}>Running costs</div>
        <Row label={`Consumption`}>
          <NumInput value={v.lPer100km} step={0.1} unit={units.cons} onChange={(n) => set({ lPer100km: n })} />
        </Row>
        <Row label={fuel === "ev" ? "Energy price" : "Fuel price"}>
          <NumInput value={v.fuelPricePerL} step={0.05} unit={units.price} onChange={(n) => set({ fuelPricePerL: n })} />
        </Row>

        <button
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: SANS }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink2 }}>Advanced wear costs</span>
          {advanced ? <ChevronUp size={15} color={T.ink3} /> : <ChevronDown size={15} color={T.ink3} />}
        </button>

        {advanced && (
          <>
            <Row label="Maintenance">
              <NumInput value={v.maintenancePerKm} step={0.01} unit="zł/km" onChange={(n) => set({ maintenancePerKm: n })} />
            </Row>
            <Row label="Depreciation">
              <NumInput value={v.depreciationPerKm} step={0.01} unit="zł/km" onChange={(n) => set({ depreciationPerKm: n })} />
            </Row>
            <Row label="Tires">
              <NumInput value={v.tiresPerKm} step={0.01} unit="zł/km" onChange={(n) => set({ tiresPerKm: n })} />
            </Row>
            <Row label="Insurance (context)">
              <NumInput value={v.insurancePerMonth} step={5} unit="zł/mo" onChange={(n) => set({ insurancePerMonth: n })} />
            </Row>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: T.greenBg }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink2 }}>Total running cost</span>
          <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: T.green }}>{cpk.toFixed(3)} zł/km</span>
        </div>
      </div>
    </div>
  );
}
