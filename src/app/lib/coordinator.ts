// ─── Multi-app coordinator (pure state machine) ───────────────────────────────
// The Mystro-style rule set real multi-appers follow by hand: one active trip
// per active app. Accept on Bolt → Uber/FreeNow pause; trip ends → everything
// switches back to taking orders; the app the driver needs comes to the front.
// (Multi-apping lifts earnings 20–40% but only if the other apps are paused so
// the acceptance rate doesn't tank — that toggling is what this automates.)
//
// Pure logic: the session reducer runs it on the web (simulation), and
// MultiAppCoordinator.kt mirrors the same transitions on-device against the
// real Bolt/Uber/FreeNow apps. Farely still NEVER accepts an offer itself —
// the human taps Accept; only the pause/resume/switch chores are automated.
//
// Identity checks (Uber "Real-Time ID Check", Bolt selfie verification) are
// sacred: when a platform asks for a face photo, every bit of automation
// suspends and the overlay hides until the check is done. Farely must never
// sit between the driver and a camera prompt.

import type { Platform } from "./engine";

export type AppActivity =
  | "active" // online, taking new orders
  | "paused" // online but not receiving (auto-paused by Farely or the driver)
  | "onTrip" // driver is completing an order on this app
  | "verifying" // platform is running a face/ID check — hands off
  | "offline";

export interface PlatformStatus {
  platform: Platform;
  activity: AppActivity;
  /** What the app was doing before an ID check froze it. */
  resumeTo?: AppActivity;
  changedAt: number;
}

export interface CoordSettings {
  autoPause: boolean; // accept on A → pause B and C
  autoResume: boolean; // trip done → un-pause B and C ("turn orders back on")
  autoSwitch: boolean; // bring the app that needs the driver to the front
  allowIdCheck: boolean; // face verification always passes through untouched
}

export const DEFAULT_COORD: CoordSettings = {
  autoPause: true,
  autoResume: true,
  autoSwitch: true,
  allowIdCheck: true,
};

export type CoordEvent =
  | { type: "accept"; platform: Platform }
  | { type: "tripEnd"; platform: Platform }
  | { type: "idCheckStart"; platform: Platform }
  | { type: "idCheckEnd"; platform: Platform }
  | { type: "online"; on: boolean }
  | { type: "installed"; platforms: Platform[] };

/**
 * What the coordinator wants done as a result of a transition. On the web these
 * become in-app notifications + UI state; on-device the Kotlin side performs
 * the real taps (pause/resume buttons) and app switches.
 */
export interface CoordEffect {
  kind: "pause" | "resume" | "switch" | "hideOverlay" | "notice";
  platform?: Platform;
  title: string;
  body?: string;
}

export function initialStatuses(installed: Platform[], online = true): PlatformStatus[] {
  const now = Date.now();
  return installed.map((platform) => ({
    platform,
    activity: online ? "active" : "offline",
    changedAt: now,
  }));
}

const list = (ps: Platform[]) =>
  ps.length <= 1 ? ps.join("") : `${ps.slice(0, -1).join(", ")} & ${ps[ps.length - 1]}`;

function set(
  statuses: PlatformStatus[],
  platform: Platform,
  patch: Partial<PlatformStatus>,
  now: number,
): PlatformStatus[] {
  return statuses.map((s) =>
    s.platform === platform ? { ...s, ...patch, changedAt: now } : s,
  );
}

/**
 * Advance the board. Returns the new per-platform statuses plus the effects the
 * host must carry out. Deterministic and side-effect-free so the web sim and
 * the native service can't drift apart in behaviour.
 */
export function coordinate(
  statuses: PlatformStatus[],
  ev: CoordEvent,
  s: CoordSettings,
  now = Date.now(),
): { statuses: PlatformStatus[]; effects: CoordEffect[] } {
  const effects: CoordEffect[] = [];
  let next = statuses;

  switch (ev.type) {
    case "accept": {
      next = set(next, ev.platform, { activity: "onTrip" }, now);
      if (s.autoPause) {
        const toPause = next.filter(
          (x) => x.platform !== ev.platform && x.activity === "active",
        );
        for (const x of toPause) {
          next = set(next, x.platform, { activity: "paused" }, now);
          effects.push({
            kind: "pause",
            platform: x.platform,
            title: `${x.platform} paused`,
            body: `You accepted on ${ev.platform} — new ${x.platform} requests are stopped so your acceptance rate survives.`,
          });
        }
      }
      if (s.autoSwitch) {
        effects.push({
          kind: "switch",
          platform: ev.platform,
          title: `Switched to ${ev.platform}`,
          body: "Navigation is up — finish the order, Farely handles the rest.",
        });
      }
      break;
    }

    case "tripEnd": {
      next = set(next, ev.platform, { activity: "active" }, now);
      if (s.autoResume) {
        const toResume = next.filter((x) => x.activity === "paused");
        if (toResume.length > 0) {
          for (const x of toResume) next = set(next, x.platform, { activity: "active" }, now);
          effects.push({
            kind: "resume",
            title: `${list(toResume.map((x) => x.platform))} back online`,
            body: "Trip finished — every app is taking orders again.",
          });
        }
      }
      break;
    }

    case "idCheckStart": {
      const cur = next.find((x) => x.platform === ev.platform);
      next = set(
        next,
        ev.platform,
        { activity: "verifying", resumeTo: cur?.activity ?? "active" },
        now,
      );
      // Automation freezes app-wide; the overlay gets out of the camera's way.
      effects.push({ kind: "hideOverlay", title: "Overlay hidden" });
      effects.push({
        kind: "notice",
        platform: ev.platform,
        title: `${ev.platform} identity check`,
        body: "Face verification in progress — Farely paused all automation and hid its overlay. The camera is untouched.",
      });
      break;
    }

    case "idCheckEnd": {
      const cur = next.find((x) => x.platform === ev.platform);
      next = set(
        next,
        ev.platform,
        { activity: cur?.resumeTo ?? "active", resumeTo: undefined },
        now,
      );
      effects.push({
        kind: "notice",
        platform: ev.platform,
        title: "Verification done",
        body: `${ev.platform} confirmed it's you — automation resumed.`,
      });
      break;
    }

    case "online": {
      next = next.map((x) => ({
        ...x,
        activity: ev.on ? "active" : "offline",
        resumeTo: undefined,
        changedAt: now,
      }));
      break;
    }

    case "installed": {
      const online = next.some((x) => x.activity !== "offline");
      const kept = next.filter((x) => ev.platforms.includes(x.platform));
      const added = ev.platforms
        .filter((p) => !kept.some((x) => x.platform === p))
        .map<PlatformStatus>((platform) => ({
          platform,
          activity: online ? "active" : "offline",
          changedAt: now,
        }));
      next = [...kept, ...added];
      break;
    }
  }

  return { statuses: next, effects };
}

/** True while any platform is mid-verification — every automation must idle. */
export function anyVerifying(statuses: PlatformStatus[]): boolean {
  return statuses.some((s) => s.activity === "verifying");
}

export const ACTIVITY_LABEL: Record<AppActivity, string> = {
  active: "ACTIVE",
  paused: "PAUSED",
  onTrip: "ON TRIP",
  verifying: "ID CHECK",
  offline: "OFFLINE",
};
