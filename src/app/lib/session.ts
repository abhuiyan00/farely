// ─── Shared session state (context + reducer + persistence) ──────────────────
// Everything the screens share: vehicle, thresholds, position, decision log,
// platforms, the multi-app coordinator board, Farely's own notification feed,
// and the performance tier. Vehicle + thresholds + coordinator switches +
// perf mode survive restarts via localStorage.

import { createContext, useContext } from "react";
import {
  DEFAULT_VEHICLE,
  DEFAULT_THRESHOLDS,
  PLACES,
  tuneThresholds,
  type Place,
  type Platform,
  type ScoredOffer,
  type Thresholds,
  type ThresholdMode,
  type VehicleProfile,
} from "./engine";
import {
  DEFAULT_COORD,
  coordinate,
  initialStatuses,
  type CoordEffect,
  type CoordSettings,
  type PlatformStatus,
} from "./coordinator";
import { detectDevice, type DeviceProfile, type PerfMode, type PerfTier } from "./device";
import {
  setSelector,
  clearSelector,
  type ControlRole,
  type Selector,
  type SelectorProfile,
} from "./controls";

export type Decision = "accept" | "decline" | "expired";

export interface LogEntry {
  scored: ScoredOffer;
  decision: Decision;
  time: string;
  prevThresholds: Thresholds;
  prevPosition: Place;
}

// ─── Farely's own notification feed ───────────────────────────────────────────
// NN/g on notifications: each one must be timely, relevant and specific, and
// too many kills trust. So notices are generated only for state changes the
// driver would otherwise have to notice themselves (apps paused/resumed, zone
// died, let-out soon, ID check) and the feed is capped.

export type NoticeKind = "coord" | "zone" | "event" | "idcheck" | "system";

export interface Notice {
  id: number;
  ts: number;
  kind: NoticeKind;
  title: string;
  body?: string;
}

const NOTICE_CAP = 50;
let noticeSeq = 1;

export function makeNotice(kind: NoticeKind, title: string, body?: string): Notice {
  return { id: noticeSeq++, ts: Date.now(), kind, title, body };
}

/** Coordinator effects → notices (hideOverlay is a UI action, not news). */
function noticesFromEffects(effects: CoordEffect[]): Notice[] {
  return effects
    .filter((e) => e.kind !== "hideOverlay")
    .map((e) => makeNotice(e.kind === "notice" ? "idcheck" : "coord", e.title, e.body));
}

export interface SessionState {
  vehicle: VehicleProfile;
  thresholds: Thresholds;
  position: Place;
  log: LogEntry[];
  installed: Platform[];
  startedAt: number;
  ocrMs: number;
  // multi-app coordination
  coord: CoordSettings;
  statuses: PlatformStatus[];
  idCheck: Platform | null; // platform currently running a face/ID check
  // notifications
  notices: Notice[];
  noticesReadAt: number;
  // performance
  perfMode: PerfMode; // driver's choice; "auto" defers to detection
  device: DeviceProfile; // what detection concluded
  // learned per-app control selectors (Learn-controls) → drives the coordinator
  selectors: SelectorProfile;
}

export type Action =
  | { type: "DECIDE"; scored: ScoredOffer; decision: Decision }
  | { type: "TRIP_END"; platform: Platform }
  | { type: "ID_CHECK_START"; platform: Platform }
  | { type: "ID_CHECK_END"; platform: Platform }
  | { type: "SET_ONLINE"; on: boolean }
  | { type: "SET_COORD"; patch: Partial<CoordSettings> }
  | { type: "SET_PERF_MODE"; mode: PerfMode }
  | { type: "SET_DEVICE"; device: DeviceProfile }
  | { type: "SET_SELECTOR"; platform: Platform; role: ControlRole; selector: Selector }
  | { type: "CLEAR_SELECTOR"; platform: Platform; role: ControlRole }
  | { type: "NOTIFY"; kind: NoticeKind; title: string; body?: string }
  | { type: "NOTICES_SEEN" }
  | { type: "CLEAR_NOTICES" }
  | { type: "UNDO" }
  | { type: "UPDATE_VEHICLE"; patch: Partial<VehicleProfile> }
  | { type: "SET_TARGET_HR"; value: number }
  | { type: "SET_TARGET_KM"; value: number }
  | { type: "SET_THRESHOLD_MODE"; mode: ThresholdMode }
  | { type: "SET_OCR_MS"; value: number }
  | { type: "TOGGLE_PLATFORM"; platform: Platform };

export const HOME = PLACES.find((p) => p.zone === "City Centre")!;

const PERSIST_KEY = "farely:session:v2";

interface Persisted {
  vehicle: VehicleProfile;
  thresholds: Thresholds;
  installed: Platform[];
  coord?: CoordSettings;
  perfMode?: PerfMode;
  selectors?: SelectorProfile;
}

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

export function persist(state: SessionState) {
  try {
    const p: Persisted = {
      vehicle: state.vehicle,
      thresholds: state.thresholds,
      installed: state.installed,
      coord: state.coord,
      perfMode: state.perfMode,
      selectors: state.selectors,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(p));
  } catch {
    // storage full/blocked — session still works, just won't survive restart
  }
}

export function initialState(): SessionState {
  const saved = load();
  const installed = saved.installed ?? ["Uber", "Bolt"];
  return {
    vehicle: { ...DEFAULT_VEHICLE, ...saved.vehicle },
    thresholds: { ...DEFAULT_THRESHOLDS, ...saved.thresholds },
    position: HOME,
    log: [],
    installed,
    startedAt: Date.now(),
    ocrMs: 1500,
    coord: { ...DEFAULT_COORD, ...saved.coord },
    statuses: initialStatuses(installed, true),
    idCheck: null,
    notices: [],
    noticesReadAt: Date.now(),
    perfMode: saved.perfMode ?? "auto",
    device: detectDevice(),
    selectors: saved.selectors ?? {},
  };
}

/** The tier the UI should actually render at (driver override wins). */
export function effectiveTier(state: SessionState): PerfTier {
  return state.perfMode === "auto" ? state.device.tier : state.perfMode;
}

export function unreadCount(state: SessionState): number {
  return state.notices.filter((n) => n.ts > state.noticesReadAt).length;
}

export function hhmm(d = new Date()) {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function pushNotices(state: SessionState, add: Notice[]): SessionState {
  if (add.length === 0) return state;
  return { ...state, notices: [...add.reverse(), ...state.notices].slice(0, NOTICE_CAP) };
}

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "DECIDE": {
      const { scored, decision } = action;
      const entry: LogEntry = {
        scored,
        decision,
        time: hhmm(),
        prevThresholds: state.thresholds,
        prevPosition: state.position,
      };
      const thresholds =
        decision === "expired"
          ? state.thresholds
          : tuneThresholds(state.thresholds, scored, decision);
      const position = decision === "accept" ? scored.to : state.position;
      let next: SessionState = { ...state, log: [entry, ...state.log], thresholds, position };
      if (decision === "accept") {
        // Mystro rule: the moment one app has your car, the others stop asking.
        const r = coordinate(state.statuses, { type: "accept", platform: scored.platform }, state.coord);
        next = pushNotices({ ...next, statuses: r.statuses }, noticesFromEffects(r.effects));
      }
      return next;
    }
    case "TRIP_END": {
      const r = coordinate(state.statuses, { type: "tripEnd", platform: action.platform }, state.coord);
      return pushNotices({ ...state, statuses: r.statuses }, noticesFromEffects(r.effects));
    }
    case "ID_CHECK_START": {
      const r = coordinate(state.statuses, { type: "idCheckStart", platform: action.platform }, state.coord);
      return pushNotices(
        { ...state, statuses: r.statuses, idCheck: action.platform },
        noticesFromEffects(r.effects),
      );
    }
    case "ID_CHECK_END": {
      const r = coordinate(state.statuses, { type: "idCheckEnd", platform: action.platform }, state.coord);
      return pushNotices(
        { ...state, statuses: r.statuses, idCheck: null },
        noticesFromEffects(r.effects),
      );
    }
    case "SET_ONLINE": {
      const r = coordinate(state.statuses, { type: "online", on: action.on }, state.coord);
      return { ...state, statuses: r.statuses };
    }
    case "SET_COORD":
      return { ...state, coord: { ...state.coord, ...action.patch } };
    case "SET_PERF_MODE":
      return { ...state, perfMode: action.mode };
    case "SET_DEVICE":
      return { ...state, device: action.device };
    case "SET_SELECTOR":
      return {
        ...state,
        selectors: setSelector(state.selectors, action.platform, action.role, action.selector),
      };
    case "CLEAR_SELECTOR":
      return {
        ...state,
        selectors: clearSelector(state.selectors, action.platform, action.role),
      };
    case "NOTIFY":
      return pushNotices(state, [makeNotice(action.kind, action.title, action.body)]);
    case "NOTICES_SEEN":
      return { ...state, noticesReadAt: Date.now() };
    case "CLEAR_NOTICES":
      return { ...state, notices: [], noticesReadAt: Date.now() };
    case "UNDO": {
      // Rolls back money/thresholds/position; the coordinator board self-heals
      // on the next accept/trip-end so it isn't part of the undo snapshot.
      if (state.log.length === 0) return state;
      const [last, ...rest] = state.log;
      return {
        ...state,
        log: rest,
        thresholds: last.prevThresholds,
        position: last.prevPosition,
      };
    }
    case "UPDATE_VEHICLE":
      return { ...state, vehicle: { ...state.vehicle, ...action.patch } };
    case "SET_TARGET_HR":
      return { ...state, thresholds: { ...state.thresholds, targetHr: action.value } };
    case "SET_TARGET_KM":
      return { ...state, thresholds: { ...state.thresholds, targetKm: action.value } };
    case "SET_THRESHOLD_MODE":
      return { ...state, thresholds: { ...state.thresholds, mode: action.mode } };
    case "SET_OCR_MS":
      return { ...state, ocrMs: action.value };
    case "TOGGLE_PLATFORM": {
      const on = state.installed.includes(action.platform);
      const installed = on
        ? state.installed.filter((p) => p !== action.platform)
        : [...state.installed, action.platform];
      if (installed.length === 0) return state;
      const r = coordinate(state.statuses, { type: "installed", platforms: installed }, state.coord);
      return { ...state, installed, statuses: r.statuses };
    }
    default:
      return state;
  }
}

export const SessionCtx = createContext<{
  state: SessionState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}
