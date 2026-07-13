// ─── Events: venue calendar → demand you can plan a shift around ──────────────
// Zoo closings, Hala Stulecia / A2 concerts, Opera curtain, NFM recitals,
// match days — every let-out is a crowd needing rides. The list shows when
// each one ends, how big the wave is, and what the venue's zone should pay at
// that moment (same EpH model as the map). One tap exports the positioning
// window to the phone's calendar (.ics on web, calendar insert on Android).

import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, MapPin, BadgeCheck, RefreshCw, Radio } from "lucide-react";
import {
  upcomingEvents,
  letOutMs,
  letOutEph,
  eventsToIcs,
  downloadIcs,
  eventCalendarEntry,
  CROWD_LABEL,
  type VenueEvent,
} from "../lib/events";
import { fetchLiveEvents } from "../lib/liveEvents";
import { roadKm, effectiveHrBar, money } from "../lib/engine";
import { useSession } from "../lib/session";
import { logDiag } from "../lib/diagStore";
import { FarelyBridge, IS_NATIVE } from "../lib/bridge";
import { T, MONO, SANS } from "../lib/theme";

const DAY_MS = 86_400_000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

const CROWD_COLOR: Record<VenueEvent["crowd"], string> = {
  1: T.ink3,
  2: T.marginal,
  3: T.green,
};

async function exportToCalendar(e: VenueEvent) {
  if (IS_NATIVE) {
    const c = eventCalendarEntry(e);
    try {
      await FarelyBridge.addToCalendar(c);
      return;
    } catch {
      // fall through to the .ics download the WebView can still offer
    }
  }
  downloadIcs(`farely-${e.id}.ics`, eventsToIcs([e]));
}

export default function EventsScreen() {
  const { state, dispatch } = useSession();
  const target = effectiveHrBar(state.thresholds);
  const now = useMemo(() => new Date(), []);
  const events = useMemo(() => upcomingEvents(now, 10, state.liveEvents), [now, state.liveEvents]);
  const [refreshing, setRefreshing] = useState(false);

  const liveCount = state.liveEvents.length;
  const hasKey = !!state.keys.ticketmaster;

  const refresh = () => {
    setRefreshing(true);
    fetchLiveEvents(state.keys.ticketmaster).then(({ events: ev, error }) => {
      setRefreshing(false);
      if (ev.length) {
        dispatch({ type: "SET_LIVE_EVENTS", events: ev });
        logDiag({ kind: "events", severity: "info", source: "EventsScreen", title: `Refreshed ${ev.length} live events`, context: { count: ev.length } });
      } else {
        dispatch({
          type: "NOTIFY",
          kind: "event",
          title: hasKey ? "No new live events" : "Add a Ticketmaster key",
          body: hasKey
            ? error ?? "Nothing returned right now."
            : "Settings → Cloud vision & live data — add a free key to pull live Wrocław events.",
        });
        if (error && error !== "no Ticketmaster API key")
          logDiag({ kind: "network", severity: "warn", source: "EventsScreen", title: `Live events refresh failed — ${error}`, context: { error } });
      }
    });
  };

  const days = useMemo(() => {
    const out: { key: string; ms: number }[] = [];
    for (let i = 0; i <= 9; i++) {
      const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i).getTime();
      out.push({ key: dayKey(ms), ms });
    }
    return out;
  }, [now]);
  const [selected, setSelected] = useState(days[0].key);

  const byDay = useMemo(() => {
    const m = new Map<string, VenueEvent[]>();
    for (const e of events) {
      const k = dayKey(e.startMs);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [events]);

  const dayEvents = byDay.get(selected) ?? [];
  const selectedMs = days.find((d) => d.key === selected)?.ms ?? days[0].ms;

  const exportDay = () => {
    if (dayEvents.length === 0) return;
    downloadIcs(`farely-${new Date(selectedMs).toISOString().slice(0, 10)}.ics`, eventsToIcs(dayEvents));
    dispatch({
      type: "NOTIFY",
      kind: "event",
      title: `${dayEvents.length} let-outs exported`,
      body: "Import the .ics into your phone calendar — each entry is the positioning window with a 15-min reminder.",
    });
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: T.bg, fontFamily: SANS }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 10px", display: "flex", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>Events</div>
          <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>
            Venue let-outs = ride waves you can be early for
          </div>
          <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
            {liveCount > 0 ? (
              <>
                <Radio size={11} color={T.green} /> {liveCount} live · updated {state.eventsFetchedAt ? hhmm(state.eventsFetchedAt) : "—"}
              </>
            ) : hasKey ? (
              "No live events cached — tap refresh"
            ) : (
              "Seeded + typical schedule · add a Ticketmaster key for live"
            )}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
          <button
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh live events"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999, border: `1px solid ${T.borderStrong}`, cursor: refreshing ? "default" : "pointer", background: T.card, color: T.ink, fontSize: 12, fontWeight: 700, fontFamily: SANS, opacity: refreshing ? 0.6 : 1 }}
          >
            <RefreshCw size={14} /> {refreshing ? "…" : "Refresh"}
          </button>
          {!IS_NATIVE && (
            <button
              onClick={exportDay}
              disabled={dayEvents.length === 0}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999, border: "none", cursor: dayEvents.length === 0 ? "default" : "pointer", background: dayEvents.length === 0 ? T.inputBg : T.black, color: dayEvents.length === 0 ? T.ink4 : "#fff", fontSize: 12, fontWeight: 700, fontFamily: SANS }}
            >
              <CalendarDays size={14} /> Export day
            </button>
          )}
        </div>
      </div>

      {/* day strip */}
      <div style={{ display: "flex", gap: 7, padding: "2px 14px 12px", overflowX: "auto" }}>
        {days.map(({ key, ms }) => {
          const d = new Date(ms);
          const on = key === selected;
          const count = byDay.get(key)?.length ?? 0;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              aria-pressed={on}
              style={{
                flexShrink: 0,
                width: 52,
                padding: "8px 0 7px",
                borderRadius: 12,
                border: on ? "none" : `1px solid ${T.borderStrong}`,
                background: on ? T.black : T.card,
                color: on ? "#fff" : T.ink,
                cursor: "pointer",
                textAlign: "center",
                fontFamily: SANS,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.75 }}>{DOW[d.getDay()]}</div>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{d.getDate()}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: on ? "#8ef0be" : count ? T.green : T.ink4 }}>
                {count ? `${count} ev` : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {/* events for the day */}
      {dayEvents.length === 0 ? (
        <div style={{ textAlign: "center", padding: "42px 24px", color: T.ink3, fontSize: 13 }}>
          No venue events on this day.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 14px 20px" }}>
          {dayEvents.map((e) => {
            const out = letOutMs(e);
            const eph = letOutEph(e);
            const dist = Math.round(roadKm(state.position, e.venue) * 10) / 10;
            const clears = eph >= target;
            return (
              <div key={e.id} style={{ background: T.card, borderRadius: 14, boxShadow: T.shadowSoft, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: T.ink }}>{hhmm(e.startMs)}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.title}
                  </span>
                  {(() => {
                    const src = e.source ?? (e.verified ? "listing" : "typical");
                    if (src === "live")
                      return (
                        <span title="Live from Ticketmaster" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.green, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          <Radio size={11} /> live
                        </span>
                      );
                    if (src === "listing")
                      return (
                        <span title="Published listing" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.blue, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          <BadgeCheck size={12} /> listed
                        </span>
                      );
                    return null;
                  })()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.ink2, marginTop: 3 }}>
                  <MapPin size={12} />
                  {e.venue.name} · {e.venue.zone} · {dist} km
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                  <span style={{ padding: "3px 9px", borderRadius: 7, background: T.bg, fontSize: 10.5, fontWeight: 700, color: CROWD_COLOR[e.crowd] }}>
                    {CROWD_LABEL[e.crowd].toUpperCase()} CROWD
                  </span>
                  <span style={{ fontSize: 11, color: T.ink2 }}>
                    lets out <b style={{ color: T.ink }}>~{hhmm(out)}</b>
                  </span>
                  <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: clears ? T.green : T.marginal }}>
                    ~{eph} zł/h
                  </span>
                </div>

                <button
                  onClick={() => {
                    void exportToCalendar(e);
                    dispatch({
                      type: "NOTIFY",
                      kind: "event",
                      title: `${e.venue.short} let-out saved`,
                      body: `Calendar block ${hhmm(out - 30 * 60_000)}–${hhmm(out + 45 * 60_000)} with a 15-min heads-up.`,
                    });
                  }}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "10px 0",
                    borderRadius: 11,
                    border: `1px solid ${T.borderStrong}`,
                    background: T.bg,
                    color: T.ink,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: SANS,
                  }}
                >
                  <CalendarPlus size={15} /> Add to phone calendar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: "center", padding: "0 24px 20px", fontSize: 10.5, color: T.ink4 }}>
        “live” = pulled from Ticketmaster on open · “listed” = seeded published listing · the rest follow the
        venue's typical schedule. Net zł/h = zone rate at let-out × crowd size vs your {money(target)}/h target.
      </div>
    </div>
  );
}
