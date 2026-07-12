// ─── Native bridge (Capacitor plugin surface, shared by App + screens) ────────
// One place that knows the FarelyBridge plugin shape. On the web every method
// safely no-ops/rejects (guard with IS_NATIVE); on-device it talks to
// FarelyBridgePlugin.kt.

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { RawOffer } from "./engine";
import type { ScreenDump, SelectorProfile } from "./controls";

export interface CoordNativeEvent {
  type: "accept" | "tripEnd" | "idCheckStart" | "idCheckEnd" | "action";
  platform: string;
  title?: string;
  body?: string;
}

export interface FarelyBridgePlugin {
  addListener(
    event: "farely:rawOffer",
    cb: (data: { raw: RawOffer }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "farely:coord",
    cb: (data: CoordNativeEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "farely:controlDump",
    cb: (data: ScreenDump) => void,
  ): Promise<PluginListenerHandle>;
  showOverlay(opts: {
    verdict: string;
    net: number;
    perHr: number;
    perKm: number;
    reason: string;
  }): Promise<{ shown: boolean }>;
  hideOverlay(): Promise<void>;
  status(): Promise<{ captureEnabled: boolean }>;
  /** Push the driver's autopilot switches down to MultiAppCoordinator.kt. */
  configureCoordinator(opts: {
    autoPause: boolean;
    autoResume: boolean;
    autoSwitch: boolean;
    allowIdCheck: boolean;
  }): Promise<void>;
  /** Android hardware verdict for lite mode (ActivityManager.isLowRamDevice). */
  deviceProfile(): Promise<{ lowRam: boolean; totalMemGb: number }>;
  /** Open the phone's calendar insert screen prefilled (no permission needed). */
  addToCalendar(opts: {
    title: string;
    location: string;
    notes: string;
    beginMs: number;
    endMs: number;
  }): Promise<{ opened: boolean }>;
  /** Post through Farely's own Android notification channel. */
  notify(opts: { title: string; body: string }): Promise<void>;
  /**
   * Learn-controls: dump the node tree of whichever target app is in the
   * foreground. Resolves immediately with a count; the full tree arrives on the
   * `farely:controlDump` event so a big tree doesn't block the bridge call.
   */
  dumpControls(): Promise<{ ok: boolean; platform?: string; count?: number }>;
  /** Push the learned per-app control selectors down to MultiAppCoordinator.kt. */
  configureSelectors(profile: SelectorProfile): Promise<void>;
}

export const FarelyBridge = registerPlugin<FarelyBridgePlugin>("FarelyBridge");
export const IS_NATIVE = Capacitor.isNativePlatform();
