// ─── Home: full-bleed live map (Bolt/Uber driver style) ───────────────────────
// Real Wrocław map with demand heat + zł/hr pills, floating chips on top, the
// multi-app status strip (what the autopilot paused/resumed), the bell for
// Farely's own notifications, the orange GO OFFLINE pill, and a bottom sheet
// with today's stats, the move suggestion and upcoming demand signals.

import { useEffect, useMemo, useState } from "react";
import {
  ChevronsRight,
  Navigation,
  Plane,
  Train,
  Sparkles,
  CloudRain,
  Activity,
  Undo2,
  Crosshair,
  Bell,
  CalendarDays,
} from "lucide-react";
import MapView from "../components/MapView";
import NotificationPanel from "../components/NotificationPanel";
import { useSession, effectiveTier, unreadCount } from "../lib/session";
import { ACTIVITY_LABEL, type AppActivity } from "../lib/coordinator";
import { eventSignals } from "../lib/events";
import {
  liveZones,
  rankZones,
  moveSuggestion,
  demandSignals,
  effectiveHrBar,
  money,
  type DemandEvent,
} from "../lib/engine";
import { T, MONO, SANS } from "../lib/theme";

const SIGNAL_ICON: Record<DemandEvent["kind"], React.ReactNode> = {
  flights: <Plane size={14} aria-hidden="true" />,
  transit: <Train size={14} aria-hidden="true" />,
  events: <Sparkles size={14} aria-hidden="true" />,
  weather: <CloudRain size={14} aria-hidden="true" />,
  baseline: <Activity size={14} aria-hidden="true" />,
};

const ACTIVITY_COLOR: Record<AppActivity, string> = {
  active: T.green,
  paused: T.marginal,
  onTrip: T.blue,
  verifying: "#8b5cf6",
  offline: T.ink4,
};

const chipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 42,
  height: 42,
  borderRadius: "50%",
  background: T.chip,
  border: "none",
  boxShadow: T.shadowSoft,
  color: T.ink,
  cursor: "pointer",
};

interface Props {
  online: boolean;
  onToggleOnline: () => void;
  waiting: boolean;
  captureOn: boolean;
  isNative: boolean;
  onOpenEvents: () => void;
}

export default function HomeScreen({ online, onToggleOnline, waiting, captureOn, isNative, onOpenEvents }: Props) {
  const { state, dispatch } = useSession();
  const target = effectiveHrBar(state.thresholds);
  const lite = effectiveTier(state) === "lite";
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const [showNotices, setShowNotices] = useState(false);
  const unread = unreadCount(state);

  // Lite tier saves the clock too: 30 s refresh instead of 10 s.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), lite ? 30000 : 10000);
    return () => clearInterval(id);
  }, [lite]);

  const zones = useMemo(() => liveZones(now, state.position), [now, state.position]);
  const rank = useMemo(() => rankZones(zones, target, state.position), [zones, target, state.position]);
  const move = useMemo(
    () => moveSuggestion(zones, state.vehicle, state.position, target),
    [zones, state.vehicle, state.position, target],
  );
  // Live signals = engine feed (flights/rail/nightlife) + real venue let-outs.
  const signals = useMemo(() => {
    const merged = [...demandSignals(now, state.position), ...eventSignals(now, state.position)];
    return merged.sort((a, b) => a.etaMin - b.etaMin).slice(0, 5);
  }, [now, state.position]);

  const stats = useMemo(() => {
    const taken = state.log.filter((e) => e.decision === "accept");
    const netToday = taken.reduce((s, e) => s + e.scored.net, 0);
    const hours = taken.reduce((s, e) => s + (e.scored.tripMin + e.scored.deadheadMin), 0) / 60;
    const decided = state.log.filter((e) => e.decision !== "expired");
    return {
      netToday,
      netHr: hours > 0 ? netToday / hours : null,
      trips: taken.length,
      acceptRate: decided.length ? Math.round((taken.length / decided.length) * 100) : null,
    };
  }, [state.log]);

  const statusLine = !online
    ? "You're offline"
    : isNative && !captureOn
      ? "Offer Reader off — enable it in Android Accessibility settings"
      : waiting
        ? "Scanning for offers…"
        : "You're online";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: SANS }}>
      <MapView
        center={[state.position.lng, state.position.lat]}
        zoom={11.8}
        driver={state.position}
        zones={zones}
        target={target}
        lite={lite}
      />

      {/* top floating chips */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between", pointerEvents: "none", zIndex: 2 }}>
        <button
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={state.log.length === 0}
          aria-label="Undo last decision"
          style={{ ...chipStyle, pointerEvents: "auto", color: state.log.length === 0 ? T.ink4 : T.ink }}
        >
          <Undo2 size={18} />
        </button>
        <div style={{ pointerEvents: "auto", background: T.chip, borderRadius: 999, boxShadow: T.shadowSoft, padding: "8px 18px", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: T.ink, lineHeight: 1.1 }}>
            {money(stats.netToday)}
          </div>
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>Today</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowNotices(true)}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            style={{ ...chipStyle, pointerEvents: "auto", position: "relative" }}
          >
            <Bell size={18} />
            {unread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 1,
                  right: 0,
                  minWidth: 17,
                  height: 17,
                  borderRadius: 999,
                  background: T.decline,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  border: "2px solid #fff",
                }}
              >
                {unread}
              </span>
            )}
          </button>
          <div
            aria-label={`Target ${target.toFixed(0)} złotych per hour`}
            style={{ ...chipStyle, pointerEvents: "auto", width: "auto", borderRadius: 999, padding: "0 12px", flexDirection: "column", gap: 0 }}
          >
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: T.green, lineHeight: 1.2 }}>{target.toFixed(0)}</span>
            <span style={{ fontSize: 8, color: T.ink3, fontWeight: 600 }}>zł/h goal</span>
          </div>
        </div>
      </div>

      {/* multi-app status strip — what the autopilot is doing with each app */}
      <div
        aria-label="Platform status"
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 64px)", left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, pointerEvents: "none", zIndex: 2 }}
      >
        {state.statuses.map((s) => (
          <div
            key={s.platform}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: T.chip,
              borderRadius: 999,
              boxShadow: T.shadowSoft,
              padding: "5px 10px",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACTIVITY_COLOR[s.activity] }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>{s.platform}</span>
            <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: ACTIVITY_COLOR[s.activity] }}>
              {ACTIVITY_LABEL[s.activity]}
            </span>
          </div>
        ))}
      </div>

      {/* recenter */}
      <button aria-label="Your position" style={{ ...chipStyle, position: "absolute", right: 12, bottom: expanded ? "58%" : 248, transition: lite ? undefined : "bottom 0.25s", zIndex: 2 }}>
        <Crosshair size={18} color={T.ink2} />
      </button>

      {/* go online/offline pill */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: expanded ? "56%" : 232, display: "flex", justifyContent: "center", transition: lite ? undefined : "bottom 0.25s", zIndex: 2 }}>
        <button
          onClick={onToggleOnline}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "13px 30px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: online ? T.orange : T.green,
            color: "#fff",
            fontFamily: SANS,
            fontSize: 16,
            fontWeight: 700,
            boxShadow: T.shadow,
          }}
        >
          <ChevronsRight size={20} />
          {online ? "Go offline" : "Go online"}
        </button>
      </div>

      {/* bottom sheet */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: expanded ? "54%" : 218,
          background: T.sheet,
          borderRadius: "18px 18px 0 0",
          zIndex: 2,
          boxShadow: "0 -6px 24px rgba(16,18,23,0.12)",
          transition: lite ? undefined : "height 0.25s",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse panel" : "Expand panel"}
          style={{ background: "none", border: "none", padding: "10px 0 6px", cursor: "pointer", flexShrink: 0 }}
        >
          <div style={{ width: 44, height: 4, borderRadius: 2, background: T.ink4, margin: "0 auto" }} />
        </button>

        {/* status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 18px 10px", flexShrink: 0 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: online ? T.green : T.ink4, boxShadow: online ? `0 0 8px ${T.green}` : "none" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{statusLine}</span>
          {online && waiting && (
            <div style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", border: `2px solid ${T.border}`, borderTopColor: T.green, animation: lite ? undefined : "farely-spin 0.9s linear infinite" }} />
          )}
          {!lite && <style>{`@keyframes farely-spin { to { transform: rotate(360deg); } }`}</style>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
          {/* stat tiles (Bolt home grid) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              { label: "Net today", value: money(stats.netToday) },
              { label: "Net zł/h", value: stats.netHr != null ? stats.netHr.toFixed(0) : "—" },
              { label: "Trips", value: String(stats.trips) },
              { label: "Acceptance", value: stats.acceptRate != null ? `${stats.acceptRate}%` : "—" },
            ].map((s) => (
              <div key={s.label} style={{ background: T.bg, borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: T.ink2, fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: T.ink }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* move suggestion */}
          {move && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.greenBg, borderRadius: 12, padding: "11px 14px", marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Navigation size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                  Head to {move.zone.name} · {move.zone.eph} zł/h
                </div>
                <div style={{ fontSize: 11, color: T.ink2 }}>
                  +{money(move.gain)} expected vs staying · {move.zone.distKm} km · {move.zone.note}
                </div>
              </div>
            </div>
          )}

          {/* zone died warning */}
          {rank.here && rank.here.eph < target && (
            <div style={{ background: rank.meetsTarget ? T.marginalBg : T.declineBg, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: rank.meetsTarget ? T.marginal : T.decline }}>
                {rank.here.name} is below your target ({rank.here.eph} zł/h &lt; {target.toFixed(0)})
              </div>
              <div style={{ fontSize: 11, color: T.ink2, marginTop: 2 }}>
                {rank.meetsTarget
                  ? `Best zone clearing it: ${rank.clearsTarget[0].name} @ ${rank.clearsTarget[0].eph} zł/h, ${rank.clearsTarget[0].distKm} km away`
                  : `Nothing clears it right now — hottest is ${rank.best.name} @ ${rank.best.eph} zł/h`}
              </div>
            </div>
          )}

          {/* opportunities */}
          <div style={{ display: "flex", alignItems: "center", margin: "4px 2px 8px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Opportunities</span>
            <button
              onClick={onOpenEvents}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", color: T.blue, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
            >
              <CalendarDays size={13} /> Events calendar →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="list">
            {signals.map((s) => {
              const clears = s.eph >= target;
              return (
                <div key={s.id} role="listitem" style={{ display: "flex", alignItems: "center", gap: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: T.blueBg, color: T.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {SIGNAL_ICON[s.kind]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: T.ink2 }}>{s.detail} · {s.distKm} km</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: clears ? T.green : T.marginal }}>{s.eph} zł/h</div>
                    <div style={{ fontSize: 10, color: T.ink3 }}>in {s.etaMin} min</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* all zones */}
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: "12px 2px 8px" }}>Zones · expected zł/h now</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }} role="list">
            {zones.map((z) => {
              const col = z.eph >= target ? T.accept : z.eph >= target * 0.85 ? T.marginal : T.decline;
              const here = z.zone === state.position.zone;
              return (
                <div key={z.zone} role="listitem" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: col }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>
                    {z.name}
                    {here && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: T.blue }}>● YOU</span>}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: col }}>{z.eph}</div>
                  {z.distKm > 0 && <div style={{ fontSize: 10, color: T.ink3, width: 44, textAlign: "right" }}>{z.distKm} km</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showNotices && <NotificationPanel onClose={() => setShowNotices(false)} />}
    </div>
  );
}
