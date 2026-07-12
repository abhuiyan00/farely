// ─── Diagnostics database — Farely's black box ───────────────────────────────
// A flat, exportable log of everything Farely does or trips over: caught errors
// and uncaught exceptions, the decisions it makes, screens it can't classify,
// cloud-vision verdicts, coordinator actions, and network outcomes. The point is
// to be able to *dissect it later* and tune the app. Pure types + helpers here
// (UI-free, side-effect-free); persistence lives in diagStore.ts (IndexedDB) and
// the review UI in DiagnosticsScreen.tsx.

export type DiagKind =
  | "error" // a caught error with context
  | "exception" // an uncaught error (window.onerror / unhandledrejection)
  | "decision" // an accept/decline/verdict Farely produced
  | "unknown-case" // a screen or control Farely couldn't classify
  | "vision" // a cloud-vision classification result
  | "coord" // a multi-app coordinator action or anomaly
  | "network" // an outbound fetch outcome (events, car spec, vision)
  | "events"; // a live-events refresh outcome

export type DiagSeverity = "info" | "warn" | "error" | "critical";

export interface DiagEvent {
  id: string;
  ts: number; // Date.now()
  kind: DiagKind;
  severity: DiagSeverity;
  source: string; // module/screen that logged it, e.g. "liveEvents", "vision", "App"
  title: string; // one-line summary
  detail?: string; // longer message / stack
  context?: Record<string, unknown>; // structured extras (platform, url, verdict…)
  resolved: boolean; // driver marked it handled (tuning triage)
}

export const DIAG_KINDS: DiagKind[] = [
  "error",
  "exception",
  "decision",
  "unknown-case",
  "vision",
  "coord",
  "network",
  "events",
];

export const DIAG_SEVERITIES: DiagSeverity[] = ["info", "warn", "error", "critical"];

export const KIND_LABEL: Record<DiagKind, string> = {
  error: "Error",
  exception: "Exception",
  decision: "Decision",
  "unknown-case": "Unknown case",
  vision: "Vision",
  coord: "Coordinator",
  network: "Network",
  events: "Events",
};

export const SEV_LABEL: Record<DiagSeverity, string> = {
  info: "Info",
  warn: "Warn",
  error: "Error",
  critical: "Critical",
};

export const SEV_RANK: Record<DiagSeverity, number> = { info: 0, warn: 1, error: 2, critical: 3 };

let seq = 0;
function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DiagInput {
  kind: DiagKind;
  severity?: DiagSeverity;
  source: string;
  title: string;
  detail?: string;
  context?: Record<string, unknown>;
}

export function makeDiag(input: DiagInput): DiagEvent {
  return {
    id: newId(),
    ts: Date.now(),
    kind: input.kind,
    severity: input.severity ?? "info",
    source: input.source,
    title: input.title,
    detail: input.detail,
    context: input.context,
    resolved: false,
  };
}

export interface DiagFilter {
  kind?: DiagKind | "all";
  severity?: DiagSeverity | "all";
  resolved?: "all" | "open" | "resolved";
  query?: string;
}

export function filterDiag(events: DiagEvent[], f: DiagFilter): DiagEvent[] {
  const q = f.query?.trim().toLowerCase();
  return events.filter((e) => {
    if (f.kind && f.kind !== "all" && e.kind !== f.kind) return false;
    if (f.severity && f.severity !== "all" && e.severity !== f.severity) return false;
    if (f.resolved === "open" && e.resolved) return false;
    if (f.resolved === "resolved" && !e.resolved) return false;
    if (q) {
      const hay = `${e.title} ${e.detail ?? ""} ${e.source} ${e.kind}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface DiagSummary {
  total: number;
  unresolved: number;
  byKind: Record<DiagKind, number>;
  bySeverity: Record<DiagSeverity, number>;
  worst: DiagSeverity | null; // worst *unresolved* severity present
}

export function summarize(events: DiagEvent[]): DiagSummary {
  const byKind = Object.fromEntries(DIAG_KINDS.map((k) => [k, 0])) as Record<DiagKind, number>;
  const bySeverity = Object.fromEntries(DIAG_SEVERITIES.map((s) => [s, 0])) as Record<
    DiagSeverity,
    number
  >;
  let unresolved = 0;
  let worst: DiagSeverity | null = null;
  for (const e of events) {
    byKind[e.kind]++;
    bySeverity[e.severity]++;
    if (!e.resolved) {
      unresolved++;
      if (!worst || SEV_RANK[e.severity] > SEV_RANK[worst]) worst = e.severity;
    }
  }
  return { total: events.length, unresolved, byKind, bySeverity, worst };
}

/** The whole DB as a portable JSON blob — pull it off the phone and dissect it. */
export function diagToJson(events: DiagEvent[]): string {
  return JSON.stringify(
    { exported: new Date().toISOString(), app: "Farely", count: events.length, events },
    null,
    2,
  );
}

/** Compact wall-clock for the list ("14:07" today, "Jul 12 14:07" otherwise). */
export function diagTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const hm = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return hm;
  return `${d.toLocaleString("en", { month: "short", day: "numeric" })} ${hm}`;
}
