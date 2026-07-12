// ─── Farely app shell ─────────────────────────────────────────────────────────
// Android-first driver assistant. Full-bleed on the phone (Capacitor) and on
// narrow browser windows; on desktop the app renders inside a phone frame for
// demoing. Five tabs (Home map / Rides / Events / Car / Settings) plus a
// full-screen Bolt-style offer overlay driven by the phase machine below:
//
//   incoming ──(sim timer | native capture)──▶ offer ──accept──▶ trip ─▶ result ─▶ incoming
//                                                └─(decline/expire)──▶ result ─▶ incoming
//
// Accepting starts the multi-app coordinator (lib/coordinator.ts): the other
// platforms pause, the accepted app comes forward, and when the trip ends
// everything goes back to taking orders. A platform ID check (face photo)
// freezes all of that until it's done — Farely never gets between the driver
// and a verification camera.
//
// On device, the FarelyBridge Capacitor plugin pushes screen-captured offers in
// and mirrors verdicts onto the over-app bubble; on the web the simulator
// generates realistic Wrocław offers instead.

import { useState, useEffect, useMemo, useReducer, useRef, useCallback } from "react";
import { Home, History, Car, SlidersHorizontal, CalendarDays } from "lucide-react";
import { type PluginListenerHandle } from "@capacitor/core";
import {
  generateOffer,
  offerFromRaw,
  scoreOffer,
  money,
  liveZones,
  rankZones,
  effectiveHrBar,
  type Platform,
} from "./lib/engine";
import { upcomingEvents, letOutMs, CROWD_LABEL } from "./lib/events";
import { withNativeProfile } from "./lib/device";
import { FarelyBridge, IS_NATIVE } from "./lib/bridge";
import {
  SessionCtx,
  reducer,
  initialState,
  persist,
  hhmm,
  type Decision,
} from "./lib/session";
import { T, SANS, HEAD, MONO } from "./lib/theme";
import HomeScreen from "./screens/HomeScreen";
import OfferOverlay from "./screens/OfferOverlay";
import RidesScreen from "./screens/RidesScreen";
import CarScreen from "./screens/CarScreen";
import EventsScreen from "./screens/EventsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import LearnControlsScreen from "./screens/LearnControlsScreen";
import IdCheckOverlay from "./screens/IdCheckOverlay";

const SIM_OFFER_SECONDS = 18;
const NATIVE_OFFER_SECONDS = 25;
const ID_CHECK_CHANCE = 0.12; // sim: platforms re-verify occasionally
const ID_CHECK_MIN_GAP_MS = 3 * 60_000;

type Phase = "incoming" | "offer" | "trip" | "result";
type Screen = "home" | "rides" | "events" | "car" | "settings" | "learn";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const [phase, setPhase] = useState<Phase>("incoming");
  const [rawOffer, setRawOffer] = useState<ReturnType<typeof generateOffer> | null>(null);
  const [timeLeft, setTimeLeft] = useState(SIM_OFFER_SECONDS);
  const [totalTime, setTotalTime] = useState(SIM_OFFER_SECONDS);
  const [tripLeft, setTripLeft] = useState(0);
  const [tripTotal, setTripTotal] = useState(1);
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const [online, setOnline] = useState(true);
  const [captureOn, setCaptureOn] = useState(false);
  const seqRef = useRef(0);
  const lastIdCheckRef = useRef(0);

  // phone frame on desktop, full-bleed on device / narrow windows
  const [framed, setFramed] = useState(() => !IS_NATIVE && window.innerWidth >= 640);
  useEffect(() => {
    if (IS_NATIVE) return;
    const onResize = () => setFramed(window.innerWidth >= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // persist profile/targets/platforms/autopilot/perf/learned-controls across restarts
  useEffect(() => {
    persist(state);
  }, [state.vehicle, state.thresholds, state.installed, state.coord, state.perfMode, state.selectors]); // eslint-disable-line react-hooks/exhaustive-deps

  const scored = useMemo(
    () => (rawOffer ? scoreOffer(rawOffer, state.vehicle, state.thresholds) : null),
    [rawOffer, state.vehicle, state.thresholds],
  );
  const scoredRef = useRef(scored);
  scoredRef.current = scored;
  const positionRef = useRef(state.position);
  positionRef.current = state.position;

  const resolve = useCallback((decision: Decision) => {
    const s = scoredRef.current;
    if (s) dispatch({ type: "DECIDE", scored: s, decision });
    setLastDecision(decision);
    if (decision === "accept" && s) {
      // Drive the order to completion: ~0.35 s per trip-minute, 5–12 s on web.
      const secs = Math.min(12, Math.max(5, Math.round(s.tripMin * 0.35)));
      setTripTotal(secs);
      setTripLeft(secs);
      setPhase("trip");
    } else {
      setPhase("result");
    }
  }, []);

  useEffect(() => {
    const h = (e: Event) => resolve((e as CustomEvent).detail as Decision);
    window.addEventListener("farely:decide", h);
    return () => window.removeEventListener("farely:decide", h);
  }, [resolve]);

  // Settings "Simulate ID check" (web demo) fires this.
  useEffect(() => {
    const h = (e: Event) => {
      const platform = (e as CustomEvent).detail as Platform;
      lastIdCheckRef.current = Date.now();
      dispatch({ type: "ID_CHECK_START", platform });
    };
    window.addEventListener("farely:idcheck", h);
    return () => window.removeEventListener("farely:idcheck", h);
  }, []);

  // Native: real captured offers replace the simulator entirely.
  useEffect(() => {
    if (!IS_NATIVE) return;
    let handle: PluginListenerHandle | undefined;
    FarelyBridge.addListener("farely:rawOffer", ({ raw }) => {
      const offer = offerFromRaw(raw, positionRef.current, seqRef.current++);
      if (!offer) return; // couldn't even read a fare — stay silent
      setRawOffer(offer);
      setTimeLeft(NATIVE_OFFER_SECONDS);
      setTotalTime(NATIVE_OFFER_SECONDS);
      setPhase("offer");
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, []);

  // Native: the on-device coordinator reports what it saw/did in the real apps;
  // mirror it into session state so every screen stays truthful.
  useEffect(() => {
    if (!IS_NATIVE) return;
    let handle: PluginListenerHandle | undefined;
    FarelyBridge.addListener("farely:coord", (ev) => {
      const platform = ev.platform as Platform;
      switch (ev.type) {
        case "accept": {
          const s = scoredRef.current;
          if (s && s.platform === platform) resolve("accept");
          else dispatch({ type: "NOTIFY", kind: "coord", title: `${platform} trip started`, body: ev.body });
          break;
        }
        case "tripEnd":
          dispatch({ type: "TRIP_END", platform });
          setPhase((p) => (p === "trip" ? "incoming" : p));
          break;
        case "idCheckStart":
          dispatch({ type: "ID_CHECK_START", platform });
          break;
        case "idCheckEnd":
          dispatch({ type: "ID_CHECK_END", platform });
          break;
        case "action":
          dispatch({ type: "NOTIFY", kind: "coord", title: ev.title ?? "Autopilot", body: ev.body });
          break;
      }
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, [resolve]);

  // Native: keep MultiAppCoordinator.kt on the driver's autopilot settings.
  useEffect(() => {
    if (!IS_NATIVE) return;
    FarelyBridge.configureCoordinator(state.coord).catch(() => {});
  }, [state.coord]);

  // Native: push the learned control selectors so the coordinator taps/reads the
  // real buttons (viewId-first) instead of guessing from label heuristics.
  useEffect(() => {
    if (!IS_NATIVE) return;
    FarelyBridge.configureSelectors(state.selectors).catch(() => {});
  }, [state.selectors]);

  // Native: hardware says more than browser heuristics (isLowRamDevice).
  useEffect(() => {
    if (!IS_NATIVE) return;
    FarelyBridge.deviceProfile()
      .then((p) => dispatch({ type: "SET_DEVICE", device: withNativeProfile(state.device, p) }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native: mirror the verdict onto the over-app bubble while an offer is live.
  useEffect(() => {
    if (!IS_NATIVE) return;
    if (phase === "offer" && scored && !state.idCheck) {
      FarelyBridge.showOverlay({
        verdict: scored.verdict,
        net: scored.net,
        perHr: scored.perHr,
        perKm: scored.perKm,
        reason: scored.reason,
      }).catch(() => {});
    } else {
      FarelyBridge.hideOverlay().catch(() => {});
    }
  }, [phase, scored, state.idCheck]);

  // Native: poll whether the accessibility capture service is running.
  useEffect(() => {
    if (!IS_NATIVE) return;
    const check = () =>
      FarelyBridge.status()
        .then((s) => setCaptureOn(s.captureEnabled))
        .catch(() => setCaptureOn(false));
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  // Simulator: next offer while online (web only, never during an ID check).
  useEffect(() => {
    if (IS_NATIVE || phase !== "incoming" || !online || state.idCheck) return;
    const id = setTimeout(() => {
      setRawOffer(generateOffer(state.position, state.installed, seqRef.current++));
      setTimeLeft(SIM_OFFER_SECONDS);
      setTotalTime(SIM_OFFER_SECONDS);
      setPhase("offer");
    }, 2600 + Math.random() * 2200);
    return () => clearTimeout(id);
  }, [phase, online, state.position, state.installed, state.idCheck]);

  // Offer countdown.
  useEffect(() => {
    if (phase !== "offer") return;
    if (timeLeft <= 0) {
      resolve("expired");
      return;
    }
    const id = setTimeout(() => setTimeLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timeLeft, resolve]);

  const finishTrip = useCallback(() => {
    const s = scoredRef.current;
    if (s) {
      dispatch({ type: "TRIP_END", platform: s.platform });
      // Occasionally a platform wants proof it's still you behind the wheel.
      const now = Date.now();
      if (Math.random() < ID_CHECK_CHANCE && now - lastIdCheckRef.current > ID_CHECK_MIN_GAP_MS) {
        lastIdCheckRef.current = now;
        dispatch({ type: "ID_CHECK_START", platform: s.platform });
      }
    }
    setPhase("result");
  }, []);

  // Trip countdown (web sim; on device the native tripEnd event ends the phase).
  useEffect(() => {
    if (phase !== "trip" || IS_NATIVE) return;
    if (tripLeft <= 0) {
      finishTrip();
      return;
    }
    const id = setTimeout(() => setTripLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, tripLeft, finishTrip]);

  // Result toast → back to scanning.
  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(() => {
      setRawOffer(null);
      setPhase("incoming");
    }, 1700);
    return () => clearTimeout(id);
  }, [phase]);

  // Ambient watcher: Farely's own notifications for things worth interrupting
  // for (NN/g: timely + specific + rare). Zone dies → notice once per episode;
  // venue let-out inside 45 min → notice once per event.
  const zoneWasBelowRef = useRef(false);
  const notifiedEventsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const target = effectiveHrBar(state.thresholds);
      const rank = rankZones(liveZones(now, positionRef.current), target, positionRef.current);
      const below = !!rank.here && rank.here.eph < target;
      if (below && !zoneWasBelowRef.current && rank.here) {
        const next = rank.meetsTarget ? rank.clearsTarget[0] : rank.best;
        dispatch({
          type: "NOTIFY",
          kind: "zone",
          title: `${rank.here.name} dropped below target`,
          body: `${rank.here.eph} zł/h here — best move: ${next.name} @ ${next.eph} zł/h, ${next.distKm} km.`,
        });
      }
      zoneWasBelowRef.current = below;

      for (const e of upcomingEvents(now, 1)) {
        const minsToOut = (letOutMs(e) - now.getTime()) / 60_000;
        if (minsToOut > 0 && minsToOut <= 45 && !notifiedEventsRef.current.has(e.id)) {
          notifiedEventsRef.current.add(e.id);
          dispatch({
            type: "NOTIFY",
            kind: "event",
            title: `${e.venue.short} lets out ${hhmm(new Date(letOutMs(e)))}`,
            body: `${e.title} — ${CROWD_LABEL[e.crowd]} crowd. Position nearby for the wave.`,
          });
        }
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [state.thresholds]);

  const toggleOnline = useCallback(() => {
    setOnline((o) => {
      dispatch({ type: "SET_ONLINE", on: !o });
      return !o;
    });
  }, []);

  const tabs = [
    { id: "home" as Screen, label: "Home", icon: Home },
    { id: "rides" as Screen, label: "Rides", icon: History },
    { id: "events" as Screen, label: "Events", icon: CalendarDays },
    { id: "car" as Screen, label: "Car", icon: Car },
    { id: "settings" as Screen, label: "Settings", icon: SlidersHorizontal },
  ];

  const pausedNow = state.statuses.filter((s) => s.activity === "paused").map((s) => s.platform);

  const toast =
    phase === "result" && lastDecision ? (
      <div
        role="status"
        aria-live="assertive"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 86,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "13px 16px",
          borderRadius: 14,
          background: lastDecision === "accept" ? T.green : T.black,
          color: "#fff",
          fontFamily: SANS,
          fontSize: 14.5,
          fontWeight: 700,
          boxShadow: T.shadow,
        }}
      >
        {lastDecision === "accept" && scoredRef.current
          ? `✓ Trip done · +${money(scoredRef.current.net)} net${state.coord.autoResume && state.installed.length > 1 ? " · apps back online" : ""}`
          : lastDecision === "expired"
            ? "Offer expired"
            : "✕ Declined"}
      </div>
    ) : null;

  // On-trip banner: the driver is inside the platform app finishing the order;
  // Farely shows what the autopilot did and when the fleet resumes.
  const tripBanner =
    phase === "trip" && scored ? (
      <div
        role="status"
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 76,
          zIndex: 55,
          background: T.card,
          borderRadius: 16,
          boxShadow: T.shadow,
          border: `1.5px solid ${T.blue}`,
          overflow: "hidden",
          fontFamily: SANS,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px 8px" }}>
          <span style={{ padding: "3px 9px", borderRadius: 7, background: T.blueBg, color: T.blue, fontSize: 11.5, fontWeight: 800 }}>
            {scored.platform} · ON TRIP
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            → {scored.to.short}
          </span>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: T.green }}>
            +{money(scored.net)}
          </span>
        </div>
        <div style={{ padding: "0 14px 9px", fontSize: 11, color: T.ink2 }}>
          {IS_NATIVE
            ? "Finish the order in the app — Farely resumes the others at drop-off"
            : pausedNow.length > 0
              ? `${pausedNow.join(" & ")} paused — auto-resume at drop-off`
              : "Solo app — nothing to pause"}
          {!IS_NATIVE && (
            <button
              onClick={finishTrip}
              style={{ marginLeft: 8, padding: "2px 10px", borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: T.bg, color: T.ink, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
            >
              Finish now
            </button>
          )}
        </div>
        <div style={{ height: 4, background: T.border }}>
          <div
            style={{
              height: "100%",
              width: `${(1 - tripLeft / tripTotal) * 100}%`,
              background: T.blue,
              transition: "width 1s linear",
            }}
          />
        </div>
      </div>
    ) : null;

  const app = (
    <div style={{ position: "relative", width: "100%", height: "100%", background: T.bg, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* screens */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        {screen === "home" && (
          <HomeScreen
            online={online}
            onToggleOnline={toggleOnline}
            waiting={phase === "incoming"}
            captureOn={captureOn}
            isNative={IS_NATIVE}
            onOpenEvents={() => setScreen("events")}
          />
        )}
        {screen === "rides" && <RidesScreen />}
        {screen === "events" && <EventsScreen />}
        {screen === "car" && <CarScreen />}
        {screen === "settings" && (
          <SettingsScreen captureOn={captureOn} isNative={IS_NATIVE} onOpenLearn={() => setScreen("learn")} />
        )}
        {screen === "learn" && <LearnControlsScreen onClose={() => setScreen("settings")} />}

        {/* full-screen offer */}
        {phase === "offer" && scored && !state.idCheck && (
          <OfferOverlay scored={scored} timeLeft={timeLeft} totalTime={totalTime} />
        )}
        {tripBanner}
        {toast}

        {/* platform face/ID verification — automation stands down */}
        {state.idCheck && (
          <IdCheckOverlay
            platform={state.idCheck}
            isNative={IS_NATIVE}
            onDone={() => dispatch({ type: "ID_CHECK_END", platform: state.idCheck! })}
          />
        )}
      </div>

      {/* bottom nav (Bolt style) */}
      <div
        role="tablist"
        aria-label="Primary"
        style={{
          display: "flex",
          background: T.card,
          borderTop: `1px solid ${T.border}`,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {tabs.map((tab) => {
          const active = screen === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => setScreen(tab.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "9px 0 4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: active ? T.green : T.ink3,
                fontFamily: SANS,
              }}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <SessionCtx.Provider value={{ state, dispatch }}>
      {framed ? (
        <div style={{ minHeight: "100vh", background: "#dfe4ea", display: "flex", alignItems: "center", justifyContent: "center", padding: 28, position: "relative" }}>
          <div style={{ position: "absolute", top: 20, left: 24 }}>
            <div style={{ fontFamily: HEAD, fontSize: 14, fontWeight: 700, letterSpacing: "0.18em", color: "rgba(20,24,31,0.30)" }}>FARELY</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: "rgba(20,24,31,0.22)", marginTop: 2 }}>
              driver assistant · live simulation · Wrocław
            </div>
          </div>
          <div style={{ width: 390, height: 844, borderRadius: 46, overflow: "hidden", border: "10px solid #16181d", boxShadow: "0 48px 96px rgba(20,24,31,0.35)", position: "relative" }}>
            {app}
          </div>
        </div>
      ) : (
        <div style={{ position: "fixed", inset: 0 }}>{app}</div>
      )}
    </SessionCtx.Provider>
  );
}
