// ─── Learn app controls ───────────────────────────────────────────────────────
// Teach Farely which on-screen node is which control, per app, on the driver's
// own phone. There is no "Pause" button to hard-code and the real toggles differ
// by app + locale (often an icon with no text), so the honest way to make the
// coordinator work is to capture the live node tree and let the driver tag it.
// The resulting selector profile (viewId-first) persists and drives
// MultiAppCoordinator.kt. Web build demos against simulated trees; on device the
// accessibility service dumps the real app.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Crosshair, Check, Copy, Wand2, Zap } from "lucide-react";
import { useSession } from "../lib/session";
import type { Platform } from "../lib/engine";
import { FarelyBridge, IS_NATIVE } from "../lib/bridge";
import {
  coverage,
  guessRole,
  isPlatformReady,
  mockDump,
  profileToJson,
  requiredLearned,
  REQUIRED_ROLES,
  ROLE_META,
  selectorFor,
  selectorSummary,
  SIM_SCENES,
  type ControlRole,
  type NodeCapture,
  type ScreenDump,
  type SimScene,
} from "../lib/controls";
import { T, MONO, SANS } from "../lib/theme";

const ROLE_COLOR: Record<ControlRole, string> = {
  offline: T.orange,
  online: T.green,
  stopRequests: T.blue,
  trip: T.marginal,
  idCheck: T.decline,
};

function Card({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "0 14px 12px", background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, overflow: "hidden" }}>
      {title && (
        <div style={{ padding: "12px 14px 2px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{sub}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

const chip = (bg: string, fg: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 7px",
  borderRadius: 999,
  background: bg,
  color: fg,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
});

export default function LearnControlsScreen({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useSession();
  const installed = state.installed;
  const [platform, setPlatform] = useState<Platform>(installed[0] ?? "Uber");
  const [scene, setScene] = useState<SimScene>("online");
  const [dump, setDump] = useState<ScreenDump | null>(null);
  const [filter, setFilter] = useState<"all" | "clickable" | "labelled">("labelled");
  const [capturing, setCapturing] = useState(false);
  const [serviceOff, setServiceOff] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep the selected platform valid if the driver toggles apps in Settings.
  useEffect(() => {
    if (!installed.includes(platform)) setPlatform(installed[0] ?? "Uber");
  }, [installed, platform]);

  // Device: the real tree arrives on the event, not the call's return value.
  useEffect(() => {
    if (!IS_NATIVE) return;
    let handle: { remove: () => void } | undefined;
    FarelyBridge.addListener("farely:controlDump", (d) => {
      setDump(d);
      setCapturing(false);
    }).then((h) => {
      handle = h;
    });
    return () => handle?.remove();
  }, []);

  const roles = state.selectors[platform] ?? {};

  /** Which role (if any) currently points at this node — so the picker reflects state. */
  function roleOfNode(n: NodeCapture): ControlRole | "" {
    for (const [role, sel] of Object.entries(roles)) {
      if (!sel) continue;
      if (sel.viewId && n.viewId && sel.viewId === n.viewId) return role as ControlRole;
      if (!sel.viewId && sel.text && sel.text === (n.text || n.desc)) return role as ControlRole;
    }
    return "";
  }

  function assign(n: NodeCapture, role: ControlRole | "") {
    if (role === "") {
      const cur = roleOfNode(n);
      if (cur) dispatch({ type: "CLEAR_SELECTOR", platform, role: cur });
      return;
    }
    dispatch({ type: "SET_SELECTOR", platform, role, selector: selectorFor(n) });
  }

  function capture() {
    if (!IS_NATIVE) {
      setDump(mockDump(platform, scene));
      return;
    }
    setServiceOff(false);
    setCapturing(true);
    FarelyBridge.dumpControls()
      .then((r) => {
        if (!r.ok) {
          setServiceOff(true);
          setCapturing(false);
        }
        // success → tree lands on the farely:controlDump listener above
      })
      .catch(() => setCapturing(false));
  }

  /** Assign every confidently-guessed node to a still-empty role (fast path). */
  function autofill() {
    if (!dump) return;
    const taught = new Set(Object.keys(roles));
    for (const n of dump.nodes) {
      const g = guessRole(n);
      if (!g || taught.has(g)) continue;
      // For tappable roles prefer a clickable node; markers can be plain text.
      if (ROLE_META[g].taps && !n.clickable) continue;
      dispatch({ type: "SET_SELECTOR", platform, role: g, selector: selectorFor(n) });
      taught.add(g);
    }
  }

  function copyJson() {
    const clip = navigator.clipboard;
    if (!clip) return; // non-secure context — clipboard API unavailable
    clip.writeText(profileToJson(state.selectors)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }

  const shownNodes = useMemo(() => {
    if (!dump) return [];
    return dump.nodes.filter((n) =>
      filter === "clickable" ? n.clickable : filter === "labelled" ? !!(n.text || n.desc || n.viewId) : true,
    );
  }, [dump, filter]);

  const cov = coverage(state.selectors, platform);
  const learned = requiredLearned(state.selectors, platform);
  const ready = isPlatformReady(state.selectors, platform);

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: T.bg, fontFamily: SANS }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 14px 8px" }}>
        <button
          onClick={onClose}
          aria-label="Back to settings"
          style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, cursor: "pointer", color: T.ink, flexShrink: 0 }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.ink }}>Learn app controls</div>
          <div style={{ fontSize: 11.5, color: T.ink2 }}>Teach Farely the real buttons — no ride app has a “pause”</div>
        </div>
      </div>

      <Card>
        <div style={{ padding: "12px 14px", fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
          Open an app on your phone, point Farely at the screen, and tag which node is the{" "}
          <b>online/offline toggle</b>, <b>Stop new requests</b>, and the <b>trip</b> / <b>ID-check</b> markers.
          Farely matches by <b>view-id</b> first (stable across language), text second — so the autopilot taps the
          right control instead of guessing.
          {!IS_NATIVE && (
            <div style={{ marginTop: 8, ...chip(T.marginalBg, T.marginal), fontFamily: SANS, fontSize: 11, whiteSpace: "normal", padding: "6px 9px" }}>
              Web preview — captures a simulated tree. On your phone this reads the real app.
            </div>
          )}
        </div>
      </Card>

      {/* platform picker */}
      <Card title="App">
        <div style={{ display: "flex", gap: 8, padding: "4px 14px 14px", flexWrap: "wrap" }}>
          {installed.map((p) => {
            const on = p === platform;
            const done = isPlatformReady(state.selectors, p);
            const n = requiredLearned(state.selectors, p);
            return (
              <button
                key={p}
                onClick={() => { setPlatform(p); setDump(null); }}
                aria-pressed={on}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, border: `1px solid ${on ? T.ink : T.borderStrong}`, background: on ? T.black : T.card, color: on ? "#fff" : T.ink2, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
              >
                {p}
                <span style={chip(done ? T.greenBg : "rgba(255,255,255,0.16)", done ? T.greenDark : on ? "#fff" : T.ink3)}>
                  {done ? <Check size={11} /> : `${n}/${REQUIRED_ROLES.length}`}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* coverage */}
      <Card title={`${platform} controls`} sub={ready ? "Ready — every required control is taught" : `${learned}/${REQUIRED_ROLES.length} required controls taught`}>
        {cov.map((c, i) => (
          <div key={c.role} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 14px", borderBottom: i === cov.length - 1 ? undefined : `1px solid ${T.border}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: ROLE_COLOR[c.role], flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>{ROLE_META[c.role].label}</span>
                {!c.required && <span style={chip(T.inputBg, T.ink3)}>optional</span>}
                {!ROLE_META[c.role].taps && <span style={chip(T.inputBg, T.ink3)}>read-only</span>}
              </div>
              <div style={{ fontSize: 10.5, color: c.have ? T.ink3 : T.ink4, marginTop: 2, fontFamily: c.have ? MONO : SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.have && c.selector ? selectorSummary(c.selector) : "not taught yet"}
              </div>
            </div>
            {c.have ? (
              <button
                onClick={() => dispatch({ type: "CLEAR_SELECTOR", platform, role: c.role })}
                style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: SANS, flexShrink: 0 }}
              >
                Clear
              </button>
            ) : (
              <span style={chip(T.declineBg, T.decline)}>missing</span>
            )}
          </div>
        ))}
      </Card>

      {/* capture */}
      <Card title="Capture a screen" sub={IS_NATIVE ? "Open the app, then grab whatever's on screen" : "Pick a screen to simulate"}>
        {!IS_NATIVE && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 14px 8px" }}>
            {SIM_SCENES.map((s) => {
              const on = s.key === scene;
              return (
                <button
                  key={s.key}
                  onClick={() => setScene(s.key)}
                  aria-pressed={on}
                  style={{ textAlign: "left", padding: "8px 11px", borderRadius: 10, border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.inputBg : T.card, cursor: "pointer", fontFamily: SANS }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{s.label}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{s.open}</div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ padding: "4px 14px 14px" }}>
          <button
            onClick={capture}
            disabled={capturing}
            style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 12, border: "none", background: T.black, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: capturing ? "default" : "pointer", fontFamily: SANS, opacity: capturing ? 0.6 : 1 }}
          >
            <Crosshair size={17} /> {capturing ? "Reading screen…" : IS_NATIVE ? "Capture current screen" : "Capture (simulated)"}
          </button>
          {serviceOff && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.decline }}>
              Offer Reader service is off — enable it in Android Settings → Accessibility → Farely, then try again.
            </div>
          )}
        </div>
      </Card>

      {/* captured nodes */}
      {dump && (
        <Card title={`Captured nodes · ${dump.platform}`} sub={`${dump.nodes.length} nodes${dump.source === "sim" ? " (simulated)" : ""} — tag each control`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 8px", flexWrap: "wrap" }}>
            {(["labelled", "clickable", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${filter === f ? T.ink : T.border}`, background: filter === f ? T.black : T.card, color: filter === f ? "#fff" : T.ink2, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
              >
                {f === "labelled" ? "With label" : f === "clickable" ? "Clickable" : "All"}
              </button>
            ))}
            <button
              onClick={autofill}
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.ink, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
            >
              <Wand2 size={12} /> Auto-fill guesses
            </button>
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto", borderTop: `1px solid ${T.border}` }}>
            {shownNodes.map((n, i) => {
              const assigned = roleOfNode(n);
              const guess = guessRole(n);
              return (
                <div key={i} style={{ padding: "9px 14px", borderBottom: `1px solid ${T.border}`, background: assigned ? T.greenBg : undefined }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                      {n.text || n.desc || <span style={{ color: T.ink4, fontStyle: "italic" }}>no label</span>}
                    </span>
                    {n.clickable && <span style={chip(T.blueBg, T.blue)}><Zap size={9} /> tap</span>}
                    {assigned && <span style={chip(T.greenBg, T.greenDark)}><Check size={10} /> {ROLE_META[assigned].label}</span>}
                    {!assigned && guess && <span style={chip(T.inputBg, T.ink3)}>guess: {ROLE_META[guess].label}</span>}
                  </div>
                  {n.viewId && (
                    <div style={{ fontSize: 10, color: T.ink3, marginTop: 2, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.viewId}
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <select
                      value={assigned}
                      onChange={(e) => assign(n, e.target.value as ControlRole | "")}
                      aria-label="Assign this node to a control"
                      style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.inputBg, color: T.ink, fontSize: 12, fontFamily: SANS }}
                    >
                      <option value="">— assign to control —</option>
                      {(Object.keys(ROLE_META) as ControlRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_META[r].label}
                          {guess === r ? "  (suggested)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            {shownNodes.length === 0 && (
              <div style={{ padding: "16px 14px", fontSize: 12, color: T.ink3, textAlign: "center" }}>No nodes match this filter.</div>
            )}
          </div>
        </Card>
      )}

      {/* export */}
      <Card title="Learned mapping" sub="Persists on this phone and drives the autopilot; copy to save a default set">
        <div style={{ padding: "4px 14px 14px" }}>
          <button
            onClick={copyJson}
            style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 12, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
          >
            {copied ? <Check size={16} /> : <Copy size={15} />} {copied ? "Copied" : "Copy mapping (JSON)"}
          </button>
        </div>
      </Card>

      <div style={{ textAlign: "center", padding: "2px 0 22px", fontSize: 10.5, color: T.ink4 }}>
        view-ids read on-device via the accessibility service · your screen never leaves the phone
      </div>
    </div>
  );
}
