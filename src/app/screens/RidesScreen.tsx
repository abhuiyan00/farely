// ─── Rides: earnings activity (Uber "Earnings Activity" style) ────────────────
// Summary tiles up top, filter chips, then one card per decision with the
// price, outcome badge, platform · time · distance line and both addresses.

import { useMemo, useState } from "react";
import { useSession, type Decision } from "../lib/session";
import { money } from "../lib/engine";
import { T, VC, VBG, MONO, SANS } from "../lib/theme";

type Filter = "all" | "accept" | "decline";

const OUTCOME: Record<Decision, { label: string; color: string; bg: string }> = {
  accept: { label: "Completed", color: T.accept, bg: T.acceptBg },
  decline: { label: "Declined", color: T.decline, bg: T.declineBg },
  expired: { label: "Expired", color: T.marginal, bg: T.marginalBg },
};

export default function RidesScreen() {
  const { state } = useSession();
  const [filter, setFilter] = useState<Filter>("all");

  const summary = useMemo(() => {
    const taken = state.log.filter((e) => e.decision === "accept");
    const net = taken.reduce((s, e) => s + e.scored.net, 0);
    const hours = taken.reduce((s, e) => s + (e.scored.tripMin + e.scored.deadheadMin), 0) / 60;
    const km = taken.reduce((s, e) => s + e.scored.tripKm + e.scored.deadheadKm, 0);
    return {
      net,
      hr: hours > 0 ? net / hours : null,
      km,
      count: taken.length,
    };
  }, [state.log]);

  const rows = state.log.filter((e) =>
    filter === "all" ? true : filter === "accept" ? e.decision === "accept" : e.decision !== "accept",
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: T.bg, fontFamily: SANS }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 10px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>Earnings activity</div>
        <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>Every offer scored this session — taken or not</div>
      </div>

      {/* summary card */}
      <div style={{ margin: "0 14px 12px", background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        {[
          { label: "Net", value: money(summary.net) },
          { label: "zł/h", value: summary.hr != null ? summary.hr.toFixed(0) : "—" },
          { label: "km", value: summary.km.toFixed(0) },
          { label: "Trips", value: String(summary.count) },
        ].map((s, i) => (
          <div key={s.label} style={{ textAlign: "center", padding: "13px 4px", borderRight: i < 3 ? `1px solid ${T.border}` : undefined }}>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: T.ink }}>{s.value}</div>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* filter chips */}
      <div style={{ display: "flex", gap: 8, padding: "0 14px 12px" }}>
        {(
          [
            ["all", "All"],
            ["accept", "Completed"],
            ["decline", "Skipped"],
          ] as [Filter, string][]
        ).map(([f, label]) => {
          const on = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={on}
              style={{
                padding: "7px 16px",
                borderRadius: 999,
                border: on ? "none" : `1px solid ${T.borderStrong}`,
                background: on ? T.black : T.card,
                color: on ? "#fff" : T.ink2,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: SANS,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: T.ink3, fontSize: 13 }}>
          Nothing here yet. Go online on the Home tab — every scored offer lands in this list.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 14px 20px" }}>
          {rows.map((e, i) => {
            const s = e.scored;
            const o = OUTCOME[e.decision];
            const totalMin = s.tripMin + s.deadheadMin;
            return (
              <div key={i} style={{ background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: e.decision === "accept" ? T.ink : T.ink3 }}>
                    {e.decision === "accept" ? `+${money(s.net)}` : money(s.net)}
                  </span>
                  <span style={{ padding: "2.5px 9px", borderRadius: 6, background: o.bg, color: o.color, fontSize: 10.5, fontWeight: 700 }}>{o.label}</span>
                  <span style={{ padding: "2.5px 9px", borderRadius: 6, background: VBG[s.verdict], color: VC[s.verdict], fontSize: 10.5, fontWeight: 700 }}>
                    scored {s.verdict.toUpperCase()}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: T.ink3 }}>{e.time}</span>
                </div>
                <div style={{ fontSize: 12, color: T.ink2, margin: "5px 0 8px" }}>
                  {s.platform} · {totalMin} min · {(s.deadheadKm + s.tripKm).toFixed(1)} km · {s.perHr.toFixed(0)} zł/h
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.ink }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.from.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.ink, marginTop: 4 }}>
                  <span style={{ width: 8, height: 8, background: T.black, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.to.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
