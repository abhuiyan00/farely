// ─── Offer overlay (Bolt-style full-screen ride offer) ────────────────────────
// Real map with the route framed behind a bottom card: badge row, big NET price,
// countdown progress bar, pickup/dropoff legs, per-hr/km/min metrics, plain-
// language verdict reason, giant Accept. Decline floats top-right like Bolt.

import { X, Star } from "lucide-react";
import MapView from "../components/MapView";
import { useSession, effectiveTier } from "../lib/session";
import { money, VERDICT_LABEL, type ScoredOffer } from "../lib/engine";
import { T, VC, VBG, MONO, SANS } from "../lib/theme";

interface Props {
  scored: ScoredOffer;
  timeLeft: number;
  totalTime: number;
}

function decide(d: "accept" | "decline") {
  window.dispatchEvent(new CustomEvent("farely:decide", { detail: d }));
}

const badge = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 10px",
  borderRadius: 8,
  background: bg,
  color,
  fontSize: 12,
  fontWeight: 700,
});

export default function OfferOverlay({ scored, timeLeft, totalTime }: Props) {
  const { state } = useSession();
  const lite = effectiveTier(state) === "lite";
  const v = scored.verdict;
  const vc = VC[v];
  const pct = Math.max(0, Math.min(1, timeLeft / totalTime));

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, fontFamily: SANS }}>
      <MapView
        center={[state.position.lng, state.position.lat]}
        driver={state.position}
        route={{ from: scored.from, to: scored.to, driver: state.position }}
        interactive={false}
        lite={lite}
      />

      {/* decline pill (Bolt top-right) */}
      <button
        onClick={() => decide("decline")}
        aria-label="Decline offer"
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          right: 14,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "11px 18px",
          borderRadius: 999,
          border: "none",
          background: T.black,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: T.shadow,
        }}
      >
        <X size={16} /> Decline · {timeLeft}s
      </button>

      {/* offer card */}
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, zIndex: 2 }}>
        <div style={{ background: T.card, borderRadius: 18, overflow: "hidden", boxShadow: T.shadow, border: `1.5px solid ${vc}` }} aria-live="polite">
          {/* badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "12px 14px 0" }}>
            <span style={badge(T.black, "#fff")}>{scored.platform}</span>
            {scored.surge > 1 && <span style={badge(T.greenBg, T.green)}>⌁ {scored.surge}× High demand</span>}
            <span style={badge(VBG[v], vc)}>{VERDICT_LABEL[v]}</span>
            {scored.approx && (
              <span title="Some fields estimated from the screen capture" style={badge(T.marginalBg, T.marginal)}>~ est.</span>
            )}
            {(scored.passenger || scored.rating > 0) && (
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>
                {scored.passenger} <Star size={12} fill={T.marginal} color={T.marginal} /> {scored.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* price */}
          <div style={{ padding: "8px 14px 2px", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: vc, lineHeight: 1 }}>
              {money(scored.net)}
            </span>
            <span style={{ fontSize: 12, color: T.ink3, fontWeight: 500 }}>net in pocket</span>
          </div>
          {/* honest money trail: what the app shows → tax → car costs → real net */}
          <div style={{ padding: "2px 14px 0", fontSize: 11, color: T.ink3, fontWeight: 500 }}>
            {scored.platform} {money(scored.fare)}{" "}
            <span style={{ color: T.ink2 }}>{scored.tax > 0 ? "net of fee · pre-tax" : "NET · tax incl."}</span>
            {scored.tax > 0 && <> · −tax {money(scored.tax)}</>} · −car{" "}
            {money(scored.runningCost + scored.deadheadCost)}
          </div>
          <div style={{ padding: "4px 14px 8px", fontSize: 11.5, color: T.ink2 }}>▸ {scored.reason}</div>

          {/* countdown bar */}
          <div style={{ height: 4, background: T.border }}>
            <div style={{ height: "100%", width: `${pct * 100}%`, background: vc, transition: lite ? undefined : "width 1s linear" }} />
          </div>

          {/* legs */}
          <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", border: `3px solid ${T.green}` }} />
              <div style={{ width: 2, flex: 1, background: T.border, margin: "3px 0" }} />
              <div style={{ width: 10, height: 10, background: T.black }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>
                {scored.deadheadMin} min · {scored.deadheadKm} km <span style={{ color: T.ink3, fontWeight: 500 }}>to pickup</span>
              </div>
              <div style={{ fontSize: 13.5, color: T.ink2, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scored.from.name}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>
                {scored.tripMin} min · {scored.tripKm} km <span style={{ color: T.ink3, fontWeight: 500 }}>trip</span>
              </div>
              <div style={{ fontSize: 13.5, color: T.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scored.to.name}</div>
            </div>
          </div>

          {/* metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${T.border}` }}>
            {[
              { label: "zł/h", value: scored.perHr.toFixed(0) },
              { label: "zł/km", value: scored.perKm.toFixed(2) },
              { label: "zł/min", value: scored.perMin.toFixed(2) },
            ].map((m, i) => (
              <div key={m.label} style={{ textAlign: "center", padding: "9px 0", borderRight: i < 2 ? `1px solid ${T.border}` : undefined }}>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: vc }}>{m.value}</div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* accept */}
          <div style={{ padding: 12 }}>
            <button
              onClick={() => decide("accept")}
              aria-label={`Accept ${scored.platform} offer, net ${money(scored.net)}`}
              style={{
                width: "100%",
                padding: "16px 0",
                borderRadius: 14,
                border: "none",
                cursor: "pointer",
                background: vc,
                color: "#fff",
                fontFamily: SANS,
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.02em",
              }}
            >
              Accept · {scored.perHr.toFixed(0)} zł/h
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
