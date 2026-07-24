// ─── Cloud-vision unknown-case classifier ────────────────────────────────────
// When Farely hits a screen its heuristics + learned selectors can't place — an
// app update, a redesigned layout, a promo takeover — it captures the screen and
// asks a vision model what it is, then takes a decision and logs it. This is a
// deliberate departure from the on-device-only stance (see docs/VISION.md §5/§6):
// the driver opted in, uses their OWN Anthropic key, and the two hard boundaries
// still hold — Farely never proposes tapping a ride offer's Accept, and an
// identity/face check is classified as a *freeze* so automation stands down.
//
// TWO tiers, and the free one is the default. Most drivers have no Anthropic key
// but every Android phone ships Google's on-device text recognition (ML Kit — the
// same OCR engine behind Google Lens, free, offline, no key). So the baseline path
// is: read the screen's text on-device, then classify it with the deterministic
// keyword heuristic below (`heuristicClassify`). A cloud key is an OPTIONAL sharper
// read for unusual redesigns the keywords miss — not a requirement.
//   NB (native): on device, wire the ML Kit OCR string of the captured screen into
//   `ScreenCapture.hint` so this heuristic runs on real text; the cloud call is only
//   reached when the driver has set a key.
// Transport mirrors carLookup.feGet: CapacitorHttp on device (no CORS), a Vite
// dev proxy (/anthropic) in `npm run dev`, direct fetch otherwise. On any cloud
// failure it falls back to the same on-device heuristic so the flow never dead-ends.

import { Capacitor, CapacitorHttp } from "@capacitor/core";

const IS_NATIVE = Capacitor.isNativePlatform();
const IS_DEV = import.meta.env.DEV;

// Vision-capable + most-capable default; swap to a cheaper vision model
// (e.g. Haiku 4.5) here if the classifier runs very frequently.
export const VISION_MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type VisionClass = "offer" | "trip" | "idCheck" | "appUpdate" | "unknown";
export type VisionAction = "freeze" | "note" | "map-control" | "none";

export interface VisionControl {
  role: string; // online | offline | stopRequests | accept | decline | other
  text?: string;
}

export interface VisionResult {
  class: VisionClass;
  confidence: number; // 0..1
  summary: string; // one short line describing what was seen
  controls: VisionControl[];
  action: VisionAction;
  raw?: string; // raw model output, kept for the diagnostics DB
  error?: string; // set when the real call failed and we fell back
  method: "cloud" | "on-device"; // cloud vision model, or the free on-device text heuristic
}

export interface ScreenCapture {
  platform?: string;
  image?: string; // base64 PNG (no data: prefix)
  mediaType?: string; // default image/png
  hint?: string; // text description / node-tree summary when no image is available
}

const CLASSES: VisionClass[] = ["offer", "trip", "idCheck", "appUpdate", "unknown"];
const ACTIONS: VisionAction[] = ["freeze", "note", "map-control", "none"];

function promptFor(capture: ScreenCapture): string {
  return (
    `You are Farely's on-screen classifier for a rideshare driver assistant ` +
    `(Bolt / Uber / FreeNow, Wrocław). You are shown a screenshot and/or a text ` +
    `description of whatever is currently on the driver's phone. Farely only ` +
    `automates the *chore* controls of the OTHER apps (go online/offline, ` +
    `"stop new requests"); it must NEVER tap a ride offer's Accept, and must get ` +
    `completely out of the way of any identity/face verification.\n\n` +
    `Classify the screen as exactly one of:\n` +
    `- "offer": an incoming ride/delivery offer card (fare, distance, accept/decline).\n` +
    `- "trip": an active trip / navigation screen.\n` +
    `- "idCheck": any identity or face verification (selfie, "Real-Time ID Check", ` +
    `"take a photo of yourself", document scan). SAFETY-CRITICAL.\n` +
    `- "appUpdate": an app update / changelog / forced-update / new-feature / consent screen.\n` +
    `- "unknown": anything you cannot confidently place.\n\n` +
    `Respond with ONLY a JSON object, no prose:\n` +
    `{"class":"...","confidence":0.0,"summary":"one short line",` +
    `"controls":[{"role":"online|offline|stopRequests|accept|decline|other","text":"visible label"}],` +
    `"action":"freeze|note|map-control|none"}\n\n` +
    `Choose "action" by: idCheck → "freeze"; appUpdate or unknown → "note"; if you ` +
    `clearly see an online/offline/stop-requests control Farely could learn → ` +
    `"map-control"; otherwise "none". Never propose tapping accept.` +
    (capture.hint ? `\n\nText description of the screen: ${capture.hint}` : "")
  );
}

function buildBody(capture: ScreenCapture) {
  const content: Array<Record<string, unknown>> = [];
  if (capture.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: capture.mediaType || "image/png", data: capture.image },
    });
  }
  content.push({ type: "text", text: promptFor(capture) });
  return { model: VISION_MODEL, max_tokens: 700, messages: [{ role: "user", content }] };
}

interface AnthropicMessage {
  content?: Array<{ type: string; text?: string }>;
}

function textFrom(data: AnthropicMessage): string {
  return (data.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
}

async function callAnthropic(body: unknown, apiKey: string): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (IS_NATIVE) {
    const res = await CapacitorHttp.post({
      url: ANTHROPIC_URL,
      headers,
      data: body,
      connectTimeout: 20000,
      readTimeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`anthropic ${res.status}`);
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    return textFrom(data as AnthropicMessage);
  }
  // dev: Vite proxy /anthropic dodges CORS; prod web: the direct-browser-access
  // header lets the API accept a browser Origin.
  const url = IS_DEV ? "/anthropic/v1/messages" : ANTHROPIC_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  return textFrom((await res.json()) as AnthropicMessage);
}

const normClass = (c: unknown): VisionClass =>
  CLASSES.includes(c as VisionClass) ? (c as VisionClass) : "unknown";
const normAction = (a: unknown): VisionAction =>
  ACTIONS.includes(a as VisionAction) ? (a as VisionAction) : "note";

function parseResult(raw: string): VisionResult | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const controls = Array.isArray(o.controls)
      ? (o.controls as Array<Record<string, unknown>>).slice(0, 8).map((c) => ({
          role: String(c.role ?? "other"),
          text: c.text != null ? String(c.text) : undefined,
        }))
      : [];
    return {
      class: normClass(o.class),
      confidence: typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.5,
      summary: String(o.summary ?? "").slice(0, 200),
      controls,
      action: normAction(o.action),
      raw,
      method: "cloud",
    };
  } catch {
    return null;
  }
}

// ─── On-device heuristic classifier (the free, no-key default) ────────────────
// Runs on the screen's OCR text (ML Kit on device; the canned `hint` in the web
// demo). Scores each class by weighted keyword hits so confidence is real, not a
// flat 0.5, and pulls the chore-control labels (online/offline/stop) out of the
// text so the coordinator can learn them. idCheck detection is deliberately broad
// — a missed identity check is the one unsafe outcome — and always wins.

const CLASS_CUES: Array<{ cls: VisionClass; re: RegExp }> = [
  { cls: "idCheck", re: /selfie|verif|id ?check|real.?time id|face scan|photo of yourself|document scan|hold your (face|phone)|blink|look at the camera/gi },
  { cls: "appUpdate", re: /update|new version|what.?s new|upgrade|changelog|install now|got it|introducing|we.?ve added|terms|consent|accept & continue/gi },
  { cls: "offer", re: /\boffer\b|\bfare\b|\baccept\b|pick.?up|drop.?off|\bdecline\b|\bzł\b|\bpln\b|min away|new request/gi },
  { cls: "trip", re: /navigat|en route|arriv|to destination|start trip|end trip|drop.?off|slide to|complete/gi },
];

const CONTROL_CUES: Array<{ role: string; re: RegExp }> = [
  { role: "offline", re: /go offline|stop driving|end (shift|dispatch)/i },
  { role: "online", re: /go online|start driving|start receiving|you.?re online/i },
  { role: "stopRequests", re: /stop new requests|stop requests|pause|don.?t send|no new (rides|requests)/i },
  { role: "accept", re: /\baccept\b/i },
  { role: "decline", re: /\bdecline\b|\breject\b|\bdismiss\b/i },
];

function countHits(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function heuristicClassify(capture: ScreenCapture): VisionResult {
  const h = (capture.hint ?? "").toLowerCase();
  const scores = CLASS_CUES.map(({ cls, re }) => ({ cls, hits: countHits(h, re) }));
  // idCheck outranks everything on any hit (safety); otherwise the strongest cue wins.
  const idHits = scores.find((s) => s.cls === "idCheck")!.hits;
  const top = idHits > 0
    ? { cls: "idCheck" as VisionClass, hits: idHits }
    : scores.reduce((a, b) => (b.hits > a.hits ? b : a), { cls: "unknown" as VisionClass, hits: 0 });

  const cls = top.hits > 0 ? top.cls : "unknown";
  // Real confidence: rises with corroborating keyword hits, capped so on-device
  // never claims certainty a cloud read would. Unknown stays deliberately low.
  const confidence = cls === "unknown" ? 0.3 : Math.min(0.85, 0.45 + 0.13 * top.hits);

  const controls: VisionControl[] = CONTROL_CUES.filter((c) => c.re.test(h)).map((c) => ({
    role: c.role,
    text: (capture.hint ?? "").match(c.re)?.[0],
  }));
  const hasChoreControl = controls.some((c) => c.role === "online" || c.role === "offline" || c.role === "stopRequests");

  const action: VisionAction =
    cls === "idCheck" ? "freeze"
    : cls === "offer" || cls === "trip" ? "none"
    : hasChoreControl ? "map-control"
    : "note";

  return {
    class: cls,
    confidence,
    summary:
      cls === "unknown"
        ? "Read on-device — no familiar cues found; logged for review (add a cloud key for a sharper read)"
        : `Read on-device: looks like a ${cls} screen`,
    controls,
    action,
    method: "on-device",
  };
}

/**
 * Classify a captured screen. The free default is the on-device heuristic; a cloud
 * key upgrades to the vision model, and on any cloud failure we fall back to the
 * same on-device read so the flow never dead-ends. The ID-check safety rule is
 * enforced by callers acting on `action`.
 */
export async function classifyScreen(capture: ScreenCapture, apiKey?: string): Promise<VisionResult> {
  if (!apiKey) return heuristicClassify(capture);
  try {
    const raw = await callAnthropic(buildBody(capture), apiKey);
    const parsed = parseResult(raw);
    if (!parsed) return { ...heuristicClassify(capture), error: "could not parse model output", raw };
    return parsed;
  } catch (e) {
    return { ...heuristicClassify(capture), error: e instanceof Error ? e.message : "vision call failed" };
  }
}

// Canned unknown screens for the web demo ("Simulate unknown screen" in Settings)
// so the capture → vision → decision → DB path is exercisable without a device.
export const SIM_SCREENS: Array<{ key: string; label: string; hint: string; platform: string }> = [
  { key: "update", label: "Uber app update", platform: "Uber", hint: "A full-screen 'Update available — install the newest version of Uber Driver' prompt with a large Update button and a small Later link." },
  { key: "promo", label: "Bolt new-feature takeover", platform: "Bolt", hint: "A Bolt Driver feature announcement: 'Introducing Priority Zones', an illustration, and a Got it button. No offer or trip." },
  { key: "verify", label: "Unexpected selfie check", platform: "Uber", hint: "A verification screen asking the driver to take a selfie to confirm identity — 'Real-Time ID Check: take a photo of yourself'." },
  { key: "weird", label: "Unrecognized screen", platform: "FreeNow", hint: "An unfamiliar settings-like screen with several toggles and no offer, trip, or verification elements." },
];
