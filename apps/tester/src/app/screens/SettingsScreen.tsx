// ─── Settings: targets, autopilot, platforms, performance, capture ────────────

import { useEffect, useState } from "react";
import { ShieldCheck, Crosshair, ChevronRight, Activity } from "lucide-react";
import { useSession, effectiveTier, type ApiKeyName } from "../lib/session";
import { requiredLearned, REQUIRED_ROLES, isPlatformReady } from "../lib/controls";
import { SIM_SCREENS } from "../lib/vision";
import { unresolvedCount, DIAG_EVENT } from "../lib/diagStore";
import {
  effectiveHrBar,
  effectiveKmBar,
  type Platform,
  type ThresholdMode,
} from "../lib/engine";
import type { PerfMode } from "../lib/device";
import { T, MONO, SANS } from "../lib/theme";

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "0 14px 12px", background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 2px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, sub, children, last }: { label: string; sub?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderBottom: last ? undefined : `1px solid ${T.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.ink2, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: T.ink4, marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{ width: 44, height: 25, borderRadius: 999, border: "none", cursor: "pointer", background: on ? T.green : T.ink4, position: "relative", transition: "background 0.15s", flexShrink: 0 }}
    >
      <span style={{ position: "absolute", top: 2.5, left: on ? 22 : 2.5, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.15s" }} />
    </button>
  );
}

export default function SettingsScreen({
  captureOn,
  isNative,
  onOpenLearn,
  onOpenDiag,
}: {
  captureOn: boolean;
  isNative: boolean;
  onOpenLearn: () => void;
  onOpenDiag: () => void;
}) {
  const { state, dispatch } = useSession();
  const t = state.thresholds;

  const [openCases, setOpenCases] = useState(0);
  useEffect(() => {
    const refresh = () => unresolvedCount().then(setOpenCases);
    refresh();
    window.addEventListener(DIAG_EVENT, refresh);
    return () => window.removeEventListener(DIAG_EVENT, refresh);
  }, []);

  const num = (value: number, step: number, unit: string, onChange: (n: number) => void) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: 72, textAlign: "right", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: MONO, fontSize: 13, color: T.ink }}
      />
      <span style={{ fontSize: 11, color: T.ink3, minWidth: 46 }}>{unit}</span>
    </span>
  );

  const keyField = (name: ApiKeyName, label: string, placeholder: string, help: string) => (
    <div style={{ padding: "8px 14px 10px" }}>
      <div style={{ fontSize: 12.5, color: T.ink2, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <input
        type="password"
        value={state.keys[name] ?? ""}
        onChange={(e) => dispatch({ type: "SET_KEY", name, value: e.target.value })}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.inputBg, color: T.ink, fontSize: 12, fontFamily: MONO, boxSizing: "border-box" }}
      />
      <div style={{ fontSize: 10.5, color: T.ink4, marginTop: 3, lineHeight: 1.4 }}>{help}</div>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: T.bg, fontFamily: SANS }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 10px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>Settings</div>
        <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>Targets drive every verdict — green means “clears my number”</div>
      </div>

      <Card title="Earnings target">
        <Row label="Mode" sub={t.mode === "manual" ? "You set the bar" : "Learned from your accept/decline pattern"}>
          <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: `1px solid ${T.borderStrong}` }}>
            {(["manual", "auto"] as ThresholdMode[]).map((mode) => {
              const on = t.mode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => dispatch({ type: "SET_THRESHOLD_MODE", mode })}
                  aria-pressed={on}
                  style={{ padding: "6px 14px", border: "none", cursor: "pointer", background: on ? T.black : "transparent", color: on ? "#fff" : T.ink2, fontSize: 11.5, fontWeight: 700, fontFamily: SANS }}
                >
                  {mode === "manual" ? "Manual" : "Auto-tune"}
                </button>
              );
            })}
          </div>
        </Row>
        <Row label="Min net zł/h">{num(t.targetHr, 1, "zł/h", (n) => dispatch({ type: "SET_TARGET_HR", value: n }))}</Row>
        <Row label="Min net zł/km">{num(t.targetKm, 0.05, "zł/km", (n) => dispatch({ type: "SET_TARGET_KM", value: n }))}</Row>
        <Row
          label="Active bar"
          sub={t.mode === "auto" ? `learned from ${t.decisions} decisions` : "your manual targets"}
          last
        >
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: T.green }}>
            {effectiveHrBar(t).toFixed(0)} zł/h · {effectiveKmBar(t).toFixed(2)} zł/km
          </span>
        </Row>
      </Card>

      <Card title="Platforms" sub="Which ride apps Farely watches / simulates">
        {(["Uber", "Bolt", "FreeNow"] as Platform[]).map((p, i, arr) => (
          <Row key={p} label={p} last={i === arr.length - 1}>
            <Toggle
              on={state.installed.includes(p)}
              onClick={() => dispatch({ type: "TOGGLE_PLATFORM", platform: p })}
              label={`Watch ${p}`}
            />
          </Row>
        ))}
      </Card>

      <Card
        title="Multi-app autopilot"
        sub="Accept on one app → the others pause; trip done → everything resumes"
      >
        <Row label="Auto-pause other apps" sub="Protects your acceptance rate mid-trip">
          <Toggle
            on={state.coord.autoPause}
            onClick={() => dispatch({ type: "SET_COORD", patch: { autoPause: !state.coord.autoPause } })}
            label="Auto-pause other apps"
          />
        </Row>
        <Row label="Auto-resume when free" sub="Turn orders back on the moment you drop off">
          <Toggle
            on={state.coord.autoResume}
            onClick={() => dispatch({ type: "SET_COORD", patch: { autoResume: !state.coord.autoResume } })}
            label="Auto-resume when free"
          />
        </Row>
        <Row label="Auto-switch apps" sub="Bring the app that needs you to the front">
          <Toggle
            on={state.coord.autoSwitch}
            onClick={() => dispatch({ type: "SET_COORD", patch: { autoSwitch: !state.coord.autoSwitch } })}
            label="Auto-switch apps"
          />
        </Row>
        <Row
          label="Platform ID checks"
          sub="Face verification always passes straight through — overlay hides, autopilot freezes"
          last={isNative}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: T.green }}>
            <ShieldCheck size={14} /> NEVER BLOCKED
          </span>
        </Row>
        {!isNative && (
          <Row label="Try the ID-check flow" sub="Demo how Farely stands down during a selfie check" last>
            <button
              onClick={() => {
                const p = state.installed[Math.floor(Math.random() * state.installed.length)];
                window.dispatchEvent(new CustomEvent("farely:idcheck", { detail: p }));
              }}
              style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.ink, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
            >
              Simulate
            </button>
          </Row>
        )}
      </Card>

      <Card
        title="App control mapping"
        sub="What the autopilot actually taps on each app — no ride app has a “pause”, so teach Farely the real buttons"
      >
        {state.installed.map((p) => {
          const ready = isPlatformReady(state.selectors, p);
          const n = requiredLearned(state.selectors, p);
          return (
            <Row key={p} label={p} sub={ready ? "all controls taught" : "some controls not taught yet"}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ready ? T.green : T.marginal }}>
                {ready ? "READY" : `${n}/${REQUIRED_ROLES.length}`}
              </span>
            </Row>
          );
        })}
        <button
          onClick={onOpenLearn}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: "11px 14px", border: "none", borderTop: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", fontFamily: SANS }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: T.ink }}>
            <Crosshair size={16} /> Learn app controls
          </span>
          <ChevronRight size={18} color={T.ink3} />
        </button>
      </Card>

      <Card
        title="Cloud vision & live data"
        sub="Classify screens Farely doesn't recognize and pull live events — with your own keys, stored on this phone only"
      >
        {keyField(
          "anthropic",
          "Anthropic API key — screen vision",
          "sk-ant-…",
          "Classifies unknown app screens (updates, redesigns). From console.anthropic.com. Note: screen captures are sent to Anthropic to classify them.",
        )}
        {keyField(
          "ticketmaster",
          "Ticketmaster API key — live events",
          "consumer key",
          "Pulls real Wrocław events on open. Free key at developer.ticketmaster.com.",
        )}
        {!isNative && (
          <Row label="Simulate unknown screen" sub="Run the capture → vision → decision → log path" last>
            <select
              defaultValue=""
              aria-label="Simulate an unknown screen"
              onChange={(e) => {
                const s = SIM_SCREENS.find((x) => x.key === e.target.value);
                if (s)
                  window.dispatchEvent(
                    new CustomEvent("farely:unknownScreen", { detail: { platform: s.platform, hint: s.hint } }),
                  );
                e.currentTarget.value = "";
              }}
              style={{ padding: "7px 10px", borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.ink, fontSize: 11.5, fontWeight: 700, fontFamily: SANS, cursor: "pointer" }}
            >
              <option value="" disabled>
                Pick a screen…
              </option>
              {SIM_SCREENS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Row>
        )}
      </Card>

      <Card
        title="Diagnostics & cases"
        sub="Farely's black box — errors, decisions, unknown screens and vision verdicts to dissect later"
      >
        <Row label="Open cases" sub="Unresolved events waiting for a tuning pass">
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: openCases ? T.marginal : T.green }}>
            {openCases}
          </span>
        </Row>
        <button
          onClick={onOpenDiag}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: "11px 14px", border: "none", borderTop: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", fontFamily: SANS }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: T.ink }}>
            <Activity size={16} /> Review diagnostics
          </span>
          <ChevronRight size={18} color={T.ink3} />
        </button>
      </Card>

      <Card
        title="Performance"
        sub="Farely adapts to the phone — lite tier drops WebGL and animation"
      >
        <Row
          label="Detected device"
          sub={
            state.device.tier === "lite"
              ? `Lite: ${state.device.reasons.join(", ")}`
              : `Full: ${state.device.memGb != null ? `${state.device.memGb}+ GB RAM` : "RAM n/a"} · ${state.device.cores ?? "?"} cores`
          }
        >
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: state.device.tier === "lite" ? T.marginal : T.green }}>
            {state.device.tier.toUpperCase()}
          </span>
        </Row>
        <Row label="Rendering" sub={`Currently running ${effectiveTier(state).toUpperCase()}`} last>
          <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: `1px solid ${T.borderStrong}` }}>
            {(["auto", "full", "lite"] as PerfMode[]).map((mode) => {
              const on = state.perfMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => dispatch({ type: "SET_PERF_MODE", mode })}
                  aria-pressed={on}
                  style={{ padding: "6px 12px", border: "none", cursor: "pointer", background: on ? T.black : "transparent", color: on ? "#fff" : T.ink2, fontSize: 11.5, fontWeight: 700, fontFamily: SANS }}
                >
                  {mode[0].toUpperCase() + mode.slice(1)}
                </button>
              );
            })}
          </div>
        </Row>
      </Card>

      <Card title="Offer capture" sub={isNative ? "Reads real offer cards off the screen" : "Web build runs the simulator"}>
        {isNative && (
          <Row
            label="Offer Reader service"
            sub={captureOn ? "Reading Bolt/Uber/FreeNow offers" : "Android Settings → Accessibility → Farely Offer Reader"}
          >
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: captureOn ? T.green : T.decline }}>
              {captureOn ? "ENABLED" : "OFF"}
            </span>
          </Row>
        )}
        <Row label="Scan interval" last>
          {num(state.ocrMs, 100, "ms", (n) => dispatch({ type: "SET_OCR_MS", value: Math.round(n) }))}
        </Row>
      </Card>

      <Card title="Region">
        <Row label="City">
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: T.ink }}>Wrocław, PL</span>
        </Row>
        <Row label="Currency" last>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: T.ink }}>PLN (zł)</span>
        </Row>
      </Card>

      <div style={{ textAlign: "center", padding: "4px 0 20px", fontSize: 10.5, color: T.ink4 }}>
        Farely · net-profit offer scoring · map © OpenStreetMap / OpenFreeMap
      </div>
    </div>
  );
}
