// ─── Diagnostics & cases ──────────────────────────────────────────────────────
// The review section for Farely's black box (diagStore.ts / IndexedDB): every
// error, exception, decision, unknown screen, vision verdict, coordinator action
// and network outcome, filterable and exportable so a later tuning pass can
// dissect what the app actually did and where it struggled. Reached from Settings.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  Trash2,
  Check,
  RotateCcw,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import {
  DIAG_SEVERITIES,
  DIAG_KINDS,
  KIND_LABEL,
  SEV_LABEL,
  filterDiag,
  summarize,
  diagTime,
  type DiagEvent,
  type DiagKind,
  type DiagSeverity,
} from "../lib/diagnostics";
import {
  allDiag,
  setResolved,
  clearDiag,
  downloadDiag,
  logDiag,
  DIAG_EVENT,
} from "../lib/diagStore";
import { T, MONO, SANS } from "../lib/theme";

const SEV_COLOR: Record<DiagSeverity, string> = {
  info: T.blue,
  warn: T.marginal,
  error: T.decline,
  critical: "#a71d22",
};
const SEV_BG: Record<DiagSeverity, string> = {
  info: T.blueBg,
  warn: T.marginalBg,
  error: T.declineBg,
  critical: "#f6d5d6",
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

const pill = (on: boolean): React.CSSProperties => ({
  padding: "5px 10px",
  borderRadius: 999,
  border: `1px solid ${on ? T.ink : T.border}`,
  background: on ? T.black : T.card,
  color: on ? "#fff" : T.ink2,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: SANS,
});

// A handful of representative sample cases so "Log test event" demonstrates the
// full path (write → live refresh → filter → resolve → export) without a device.
const SAMPLES: Array<Parameters<typeof logDiag>[0]> = [
  { kind: "decision", severity: "info", source: "engine", title: "DECLINE — 4.1 zł/km below bar", detail: "Bolt offer, 8.2 km trip, net 24.10 zł after deadhead + running cost.", context: { platform: "Bolt", verdict: "decline", netZl: 24.1, perKm: 4.1 } },
  { kind: "network", severity: "warn", source: "liveEvents", title: "Ticketmaster refresh failed — using cached events", detail: "HTTP 401 (no API key configured).", context: { url: "app.ticketmaster.com/discovery/v2/events.json", status: 401 } },
  { kind: "unknown-case", severity: "warn", source: "coordinator", title: "Unrecognized Uber screen", detail: "No taught control matched; heuristics returned none. Queued for vision.", context: { platform: "Uber" } },
  { kind: "coord", severity: "info", source: "coordinator", title: "Auto-paused Uber + FreeNow (accepted on Bolt)", context: { accepted: "Bolt", paused: ["Uber", "FreeNow"] } },
  { kind: "error", severity: "error", source: "carLookup", title: "fueleconomy.gov lookup threw", detail: "TypeError: failed to fetch", context: { query: "toyota corolla" } },
];

export default function DiagnosticsScreen({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<DiagEvent[]>([]);
  const [kind, setKind] = useState<DiagKind | "all">("all");
  const [sev, setSev] = useState<DiagSeverity | "all">("all");
  const [resolved, setResolvedFilter] = useState<"all" | "open" | "resolved">("open");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function reload() {
    allDiag().then(setEvents);
  }

  useEffect(() => {
    reload();
    const onDiag = () => reload();
    window.addEventListener(DIAG_EVENT, onDiag);
    return () => window.removeEventListener(DIAG_EVENT, onDiag);
  }, []);

  const sum = useMemo(() => summarize(events), [events]);
  const shown = useMemo(
    () => filterDiag(events, { kind, severity: sev, resolved, query }),
    [events, kind, sev, resolved, query],
  );

  async function toggleResolved(e: DiagEvent) {
    await setResolved(e.id, !e.resolved);
    reload();
  }

  async function doClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await clearDiag();
    setConfirmClear(false);
    reload();
  }

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
          <div style={{ fontSize: 19, fontWeight: 800, color: T.ink }}>Diagnostics &amp; cases</div>
          <div style={{ fontSize: 11.5, color: T.ink2 }}>Everything Farely logged — for dissecting and tuning later</div>
        </div>
      </div>

      {/* summary */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px 10px" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: T.ink, lineHeight: 1 }}>{sum.total}</div>
            <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>events</div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: sum.unresolved ? T.marginal : T.green, lineHeight: 1 }}>{sum.unresolved}</div>
            <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>open</div>
          </div>
          {sum.worst && (
            <div style={{ marginLeft: "auto", ...chip(SEV_BG[sum.worst], SEV_COLOR[sum.worst]), fontSize: 11, padding: "5px 10px" }}>
              <AlertTriangle size={12} /> worst open: {SEV_LABEL[sum.worst]}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px 12px" }}>
          {DIAG_SEVERITIES.map((s) => (
            <span key={s} style={chip(SEV_BG[s], SEV_COLOR[s])}>
              {SEV_LABEL[s]} {sum.bySeverity[s]}
            </span>
          ))}
        </div>
      </Card>

      {/* filters */}
      <Card title="Filter">
        <div style={{ padding: "2px 14px 6px" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, detail, source…"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.inputBg, color: T.ink, fontSize: 12.5, fontFamily: SANS, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 14px 8px", alignItems: "center" }}>
          <button onClick={() => setSev("all")} style={pill(sev === "all")}>All levels</button>
          {DIAG_SEVERITIES.map((s) => (
            <button key={s} onClick={() => setSev(s)} style={pill(sev === s)}>{SEV_LABEL[s]}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px 8px", alignItems: "center" }}>
          {(["open", "all", "resolved"] as const).map((r) => (
            <button key={r} onClick={() => setResolvedFilter(r)} style={pill(resolved === r)}>
              {r === "open" ? "Open" : r === "resolved" ? "Resolved" : "All"}
            </button>
          ))}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DiagKind | "all")}
            aria-label="Filter by kind"
            style={{ marginLeft: "auto", padding: "6px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.inputBg, color: T.ink, fontSize: 12, fontFamily: SANS }}
          >
            <option value="all">All kinds</option>
            {DIAG_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* actions */}
      <Card>
        <div style={{ display: "flex", gap: 8, padding: "12px 14px", flexWrap: "wrap" }}>
          <button
            onClick={() => downloadDiag(events)}
            disabled={events.length === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.ink, fontSize: 12, fontWeight: 700, cursor: events.length ? "pointer" : "default", opacity: events.length ? 1 : 0.5, fontFamily: SANS }}
          >
            <Download size={14} /> Export JSON
          </button>
          <button
            onClick={() => logDiag(SAMPLES[Math.floor(Math.random() * SAMPLES.length)])}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
          >
            <FlaskConical size={14} /> Log test event
          </button>
          <button
            onClick={doClear}
            disabled={events.length === 0}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${confirmClear ? T.decline : T.border}`, background: confirmClear ? T.declineBg : T.card, color: T.decline, fontSize: 12, fontWeight: 700, cursor: events.length ? "pointer" : "default", opacity: events.length ? 1 : 0.5, fontFamily: SANS }}
          >
            <Trash2 size={14} /> {confirmClear ? "Confirm clear" : "Clear all"}
          </button>
        </div>
      </Card>

      {/* list */}
      <Card title={`Log · ${shown.length}${shown.length !== events.length ? ` of ${events.length}` : ""}`}>
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {shown.map((e) => {
            const open = expanded === e.id;
            return (
              <div key={e.id} style={{ borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${SEV_COLOR[e.severity]}`, opacity: e.resolved ? 0.6 : 1 }}>
                <button
                  onClick={() => setExpanded(open ? null : e.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={chip(T.inputBg, T.ink2)}>{KIND_LABEL[e.kind]}</span>
                    <span style={chip(SEV_BG[e.severity], SEV_COLOR[e.severity])}>{SEV_LABEL[e.severity]}</span>
                    {e.resolved && <span style={chip(T.greenBg, T.greenDark)}><Check size={10} /> resolved</span>}
                    <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: T.ink3 }}>{diagTime(e.ts)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginTop: 4 }}>{e.title}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2, fontFamily: MONO }}>{e.source}</div>
                </button>
                {open && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {e.detail && (
                      <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>{e.detail}</div>
                    )}
                    {e.context && (
                      <pre style={{ margin: 0, padding: "8px 10px", background: T.inputBg, borderRadius: 8, fontFamily: MONO, fontSize: 10.5, color: T.ink2, overflowX: "auto", maxHeight: 180 }}>
                        {JSON.stringify(e.context, null, 2)}
                      </pre>
                    )}
                    <button
                      onClick={() => toggleResolved(e)}
                      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: e.resolved ? T.ink2 : T.greenDark, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
                    >
                      {e.resolved ? <><RotateCcw size={13} /> Reopen</> : <><Check size={13} /> Mark resolved</>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && (
            <div style={{ padding: "22px 14px", fontSize: 12, color: T.ink3, textAlign: "center" }}>
              {events.length === 0 ? "No events logged yet." : "No events match this filter."}
            </div>
          )}
        </div>
      </Card>

      <div style={{ textAlign: "center", padding: "2px 0 22px", fontSize: 10.5, color: T.ink4 }}>
        stored on-device (IndexedDB) · ring-buffered · export any time to dissect
      </div>
    </div>
  );
}
