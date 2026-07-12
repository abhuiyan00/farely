// ─── Device tier detection (potato-phone autodetect) ─────────────────────────
// Farely has to run on whatever phone the driver already owns. We sniff the
// signals the browser/WebView exposes and, when they say "low-end", the app
// drops to LITE: no WebGL map (DOM projection instead), no decorative
// animation, slower refresh clocks. Detection is automatic; Settings shows the
// verdict and lets the driver override it either way.

export type PerfTier = "full" | "lite";
export type PerfMode = "auto" | PerfTier;

export interface DeviceProfile {
  tier: PerfTier;
  reasons: string[]; // why we called it lite (empty when full)
  memGb: number | null;
  cores: number | null;
  reducedMotion: boolean;
  saveData: boolean;
}

export function detectDevice(): DeviceProfile {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const memGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = nav.connection?.saveData === true;
  const slowNet = nav.connection?.effectiveType === "2g" || nav.connection?.effectiveType === "slow-2g";

  const reasons: string[] = [];
  if (memGb != null && memGb <= 3) reasons.push(`${memGb} GB RAM`);
  if (cores != null && cores <= 4) reasons.push(`${cores} CPU cores`);
  if (saveData) reasons.push("data saver on");
  if (slowNet) reasons.push("2G-class network");
  if (reducedMotion) reasons.push("reduced motion preferred");

  return {
    tier: reasons.length > 0 ? "lite" : "full",
    reasons,
    memGb,
    cores,
    reducedMotion,
    saveData,
  };
}

/** Fold the native side's verdict in (Android isLowRamDevice beats heuristics). */
export function withNativeProfile(
  d: DeviceProfile,
  native: { lowRam?: boolean; totalMemGb?: number },
): DeviceProfile {
  if (!native.lowRam) return d;
  const reasons = [...new Set([...d.reasons, "Android low-RAM device"])];
  return { ...d, tier: "lite", reasons };
}
