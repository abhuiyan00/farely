// ─── Farely design tokens ─────────────────────────────────────────────────────
// Bolt/Uber-driver hybrid: full-bleed light map, white floating chips, green
// primary, orange "go offline" pill, verdict colors preserved from the engine.

export const T = {
  // surfaces
  bg: "#f6f7f9",
  card: "#ffffff",
  sheet: "#ffffff",
  chip: "#ffffff",
  inputBg: "#f2f4f6",
  mapFallback: "#e8ecef",

  // ink
  ink: "#16181d",
  ink2: "rgba(22,24,29,0.60)",
  ink3: "rgba(22,24,29,0.40)",
  ink4: "rgba(22,24,29,0.22)",
  border: "rgba(22,24,29,0.10)",
  borderStrong: "rgba(22,24,29,0.18)",

  // brand (Bolt-ish green + Uber black + offline orange)
  green: "#17b26a",
  greenDark: "#0e9a58",
  greenBg: "#e7f7ef",
  orange: "#f7941d",
  orangeBg: "#fdf1df",
  black: "#111318",
  blue: "#276ef1", // Uber blue
  blueBg: "#eaf1fe",

  // verdict
  accept: "#17b26a",
  marginal: "#e8930c",
  decline: "#e5484d",
  acceptBg: "#e7f7ef",
  marginalBg: "#fcf2e2",
  declineBg: "#fdebec",

  shadow: "0 4px 18px rgba(16,18,23,0.14)",
  shadowSoft: "0 2px 10px rgba(16,18,23,0.10)",
} as const;

export const VC: Record<string, string> = {
  accept: T.accept,
  marginal: T.marginal,
  decline: T.decline,
};
export const VBG: Record<string, string> = {
  accept: T.acceptBg,
  marginal: T.marginalBg,
  decline: T.declineBg,
};

// Fonts: Inter for UI (Bolt/Uber use similar geometric sans), mono for numbers.
export const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const MONO = "'JetBrains Mono', monospace";
export const HEAD = "'Barlow Condensed', sans-serif";
