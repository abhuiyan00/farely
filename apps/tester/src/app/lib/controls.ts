// ─── Control learning (pure core) ─────────────────────────────────────────────
// No ride app ships a "Pause" button, and the real controls (online/offline
// toggle, "Stop new requests", the in-trip markers, the ID-check screen) differ
// per app and per locale — often an icon/pill with no matchable text at all.
// Guessing labels is fragile. So Farely *learns* them: on the driver's own phone
// the accessibility service dumps the live node tree of each app, the driver
// tags which node is which control, and the resulting per-app selector profile
// drives MultiAppCoordinator.kt (viewId first — stable across locale — text as a
// fallback). This module is the pure half: types, role guessing, selector
// merging, a web-sim dump, and export. UI-free and side-effect-free.

import type { Platform } from "./engine";

/** A single node captured from the accessibility tree (mirrors NodeCap.kt). */
export interface NodeCapture {
  text?: string;
  desc?: string; // contentDescription
  viewId?: string; // viewIdResourceName, e.g. "ee.mtakso.driver:id/go_online"
  cls?: string; // className
  clickable: boolean;
  bounds?: string; // "[l,t][r,b]"
}

/** One capture of whatever app screen is in the foreground. */
export interface ScreenDump {
  platform: Platform;
  capturedAt: number;
  nodes: NodeCapture[];
  /** "sim" when produced by mockDump on the web build; "device" from the phone. */
  source: "sim" | "device";
}

/**
 * The controls Farely needs to find. `offline`/`online` are the toggles it taps
 * on the *other* apps; `stopRequests` halts back-to-back on the app you're
 * driving; `trip`/`idCheck` are read-only markers that drive detection (never
 * tapped — idCheck freezes everything).
 */
export type ControlRole = "offline" | "stopRequests" | "online" | "trip" | "idCheck";

export const ROLE_ORDER: ControlRole[] = ["offline", "online", "stopRequests", "trip", "idCheck"];

/** Roles the coordinator can't run the pause/resume/detect loop without. */
export const REQUIRED_ROLES: ControlRole[] = ["offline", "online", "trip", "idCheck"];

export const ROLE_META: Record<
  ControlRole,
  { label: string; hint: string; taps: boolean }
> = {
  offline: {
    label: "Go offline",
    hint: "Toggle that stops this app taking orders (tapped on the OTHER apps when you accept a ride).",
    taps: true,
  },
  online: {
    label: "Go online",
    hint: "Toggle that brings the app back online after your trip ends.",
    taps: true,
  },
  stopRequests: {
    label: "Stop new requests",
    hint: "In-trip menu control that halts back-to-back offers on the app you're driving.",
    taps: true,
  },
  trip: {
    label: "On-trip marker",
    hint: "Text shown only while a trip is live (Navigate, Arrived, Drop-off…). Read, never tapped.",
    taps: false,
  },
  idCheck: {
    label: "ID-check marker",
    hint: "Text on the face/selfie verification screen. Seeing it freezes all automation.",
    taps: false,
  },
};

/** A learned way to find one control. viewId is stable; text is the fallback. */
export interface Selector {
  viewId?: string;
  text?: string;
}

/** Per platform → per role → how to find it. What the coordinator consumes. */
export type SelectorProfile = Partial<Record<Platform, Partial<Record<ControlRole, Selector>>>>;

// Verified EN + best-guess PL hints, reused from the coordinator's heuristics,
// only to *suggest* a role for a freshly captured node — the driver confirms.
const ROLE_HINTS: Record<ControlRole, string[]> = {
  stopRequests: ["stop new requests", "stop receiving requests", "wstrzymaj nowe"],
  offline: ["go offline", "offline", "stop receiving", "stop orders", "zakończ pracę", "wstrzymaj"],
  online: ["go online", "online", "resume", "take orders", "wznów", "rozpocznij pracę", "przyjmuj"],
  trip: ["navigate", "arrived", "start trip", "en route", "drop-off", "nawiguj", "dojechał", "zakończ przejazd"],
  idCheck: [
    "real-time id", "identity", "verify your", "verify it's you", "selfie", "photo verification",
    "face", "zweryfikuj", "weryfikacja", "tożsamość", "zrób selfie", "zrób zdjęcie",
  ],
};

/** Best-guess role for a captured node, or null if nothing matches. */
export function guessRole(n: NodeCapture): ControlRole | null {
  const hay = `${n.text ?? ""} ${n.desc ?? ""}`.toLowerCase().trim();
  if (!hay) return null;
  // stopRequests before offline: its phrase contains "stop" substrings offline also lists.
  for (const role of ["stopRequests", "idCheck", "trip", "online", "offline"] as ControlRole[]) {
    if (ROLE_HINTS[role].some((h) => hay.includes(h))) return role;
  }
  return null;
}

/** Turn a captured node into a selector (viewId preferred, text as fallback). */
export function selectorFor(n: NodeCapture): Selector {
  const sel: Selector = {};
  if (n.viewId) sel.viewId = n.viewId;
  const t = n.text || n.desc;
  if (t) sel.text = t;
  return sel;
}

export function selectorSummary(s: Selector): string {
  if (s.viewId) return `#${s.viewId.split("/").pop()}`;
  if (s.text) return `“${s.text}”`;
  return "—";
}

/** Immutable set of one platform+role selector. */
export function setSelector(
  profile: SelectorProfile,
  platform: Platform,
  role: ControlRole,
  sel: Selector,
): SelectorProfile {
  return { ...profile, [platform]: { ...(profile[platform] ?? {}), [role]: sel } };
}

/** Immutable clear of one platform+role selector. */
export function clearSelector(
  profile: SelectorProfile,
  platform: Platform,
  role: ControlRole,
): SelectorProfile {
  const roles = { ...(profile[platform] ?? {}) };
  delete roles[role];
  return { ...profile, [platform]: roles };
}

export interface Coverage {
  role: ControlRole;
  have: boolean;
  required: boolean;
  selector?: Selector;
}

/** Per-role learned/missing state for one platform, in display order. */
export function coverage(profile: SelectorProfile, platform: Platform): Coverage[] {
  const roles = profile[platform] ?? {};
  return ROLE_ORDER.map((role) => ({
    role,
    have: !!roles[role],
    required: REQUIRED_ROLES.includes(role),
    selector: roles[role],
  }));
}

/** How many required roles are taught for a platform (for progress readouts). */
export function requiredLearned(profile: SelectorProfile, platform: Platform): number {
  const roles = profile[platform] ?? {};
  return REQUIRED_ROLES.filter((r) => roles[r]).length;
}

/** True once every required control is taught for the platform. */
export function isPlatformReady(profile: SelectorProfile, platform: Platform): boolean {
  return requiredLearned(profile, platform) === REQUIRED_ROLES.length;
}

/** Pretty JSON the driver can copy out / hand back for the native default map. */
export function profileToJson(profile: SelectorProfile): string {
  return JSON.stringify(profile, null, 2);
}

// ─── Web-sim dumps ────────────────────────────────────────────────────────────
// The web build has no accessibility tree, so the Learn screen demos against
// representative node trees — the real control plus realistic noise so the
// filter/guess UX is meaningful. Shapes and viewIds mirror what the real driver
// apps expose (best-effort; the point is the flow, tuned for real on device).

export type SimScene = "online" | "trip" | "verify";

export const SIM_SCENES: { key: SimScene; label: string; open: string }[] = [
  { key: "online", label: "Home / online toggle", open: "Open the app on its main map with the online/offline button." },
  { key: "trip", label: "On a trip", open: "Start (or be on) a trip so the Navigate / in-trip menu shows." },
  { key: "verify", label: "Identity check", open: "The face/selfie verification screen, if you can trigger one." },
];

const PKG: Record<Platform, string> = {
  Uber: "com.ubercab.driver",
  Bolt: "ee.mtakso.driver",
  FreeNow: "taxi.android.driver",
};

function node(p: Partial<NodeCapture> & { clickable?: boolean }): NodeCapture {
  return { clickable: false, ...p };
}

/** A representative (fake) tree for the web demo. */
export function mockDump(platform: Platform, scene: SimScene): ScreenDump {
  const pkg = PKG[platform];
  const id = (s: string) => `${pkg}:id/${s}`;
  let nodes: NodeCapture[];

  if (scene === "online") {
    nodes = [
      node({ text: "Go offline", viewId: id("online_toggle"), cls: "android.widget.Button", clickable: true, bounds: "[40,1720][680,1840]" }),
      node({ text: platform === "Uber" ? "You're online" : "Online", viewId: id("status_pill"), cls: "android.widget.TextView", bounds: "[280,120][440,180]" }),
      node({ desc: "Menu", viewId: id("menu_button"), cls: "android.widget.ImageButton", clickable: true, bounds: "[24,120][96,192]" }),
      node({ text: "23,50 zł", viewId: id("today_earnings"), cls: "android.widget.TextView", bounds: "[500,120][700,180]" }),
      node({ text: "Wrocław", cls: "android.widget.TextView", bounds: "[300,60][420,110]" }),
      node({ desc: "Recenter map", viewId: id("recenter"), cls: "android.widget.ImageButton", clickable: true, bounds: "[620,1500][700,1580]" }),
    ];
  } else if (scene === "trip") {
    nodes = [
      node({ text: "Navigate", viewId: id("navigate_button"), cls: "android.widget.Button", clickable: true, bounds: "[40,1720][680,1840]" }),
      node({ text: "Arrived", viewId: id("arrive_button"), cls: "android.widget.Button", clickable: true, bounds: "[40,1560][680,1680]" }),
      node({ desc: "Trip options", viewId: id("trip_menu"), cls: "android.widget.ImageButton", clickable: true, bounds: "[620,120][700,200]" }),
      node({ text: "Stop new requests", viewId: id("stop_new_requests"), cls: "android.widget.TextView", clickable: true, bounds: "[40,900][680,980]" }),
      node({ text: "Dropoff · ul. Świdnicka 12", cls: "android.widget.TextView", bounds: "[40,300][680,360]" }),
      node({ text: "4.9 ★", cls: "android.widget.TextView", bounds: "[40,220][200,280]" }),
    ];
  } else {
    nodes = [
      node({ text: platform === "Uber" ? "Real-Time ID Check" : "Verify it's you", viewId: id("verify_title"), cls: "android.widget.TextView", bounds: "[40,200][680,300]" }),
      node({ text: "Take a selfie to keep driving", viewId: id("verify_subtitle"), cls: "android.widget.TextView", bounds: "[40,320][680,420]" }),
      node({ desc: "Camera preview", viewId: id("camera_preview"), cls: "android.view.TextureView", bounds: "[80,500][620,1200]" }),
      node({ text: "Take photo", viewId: id("shutter"), cls: "android.widget.Button", clickable: true, bounds: "[240,1500][460,1620]" }),
    ];
  }

  return { platform, capturedAt: Date.now(), nodes, source: "sim" };
}
