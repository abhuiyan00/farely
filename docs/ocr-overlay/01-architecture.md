# 01 — Architecture

## 1. High-level data flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Bolt / Uber / FreeNow driver app  (a NEW ride offer pops up)     │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Android fires an accessibility event
                            │  (TYPE_WINDOW_CONTENT_CHANGED / notification)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  FarelyAccessibilityService  (native Kotlin) — EVENT-TRIGGERED     │
│                                                                   │
│   1. Is the foreground app a known ride-hailing package?          │
│   2. Read node tree → try to extract fare / distance / pickup     │
│   3. If text NOT in node tree → capture screen (MediaProjection)  │
│      → ML Kit OCR → extract the same fields                       │
│   4. Normalize into a RawOffer JSON                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Capacitor bridge (native → JS)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  WebView (existing React app + src/app/lib/engine.ts)             │
│                                                                   │
│   5. Map RawOffer → engine `Offer`                                │
│   6. scoreOffer(offer, vehicle, thresholds) → ScoredOffer         │
│      (verdict: accept | marginal | decline, + plain reason)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Capacitor bridge (JS → native)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Overlay bubble  (SYSTEM_ALERT_WINDOW) drawn on top of Bolt/Uber  │
│   → big ACCEPT / MARGINAL / DECLINE + zł/hr + one-line reason     │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Why this shape

- **Reuse the engine.** `engine.ts` is pure, UI-free TypeScript. It stays in the
  WebView untouched. We only change *where offers come from* — not how they're
  scored. This is the whole leverage of the project.
- **Node tree before OCR.** OCR is the expensive, fragile path. Many Android apps
  expose offer text as real `TextView` nodes, readable in microseconds with no
  image processing. OCR is a fallback, not the default.
- **Event-triggered, never polling.** The service sleeps until Android signals a
  screen-content change in a target app. No continuous capture → no battery/CPU
  drain between offers (see [03](03-android-permissions-and-legal.md) risk notes).

## 3. Module boundaries

| Layer | Location | Responsibility | Language |
|-------|----------|----------------|----------|
| Offer engine | `src/app/lib/engine.ts` (existing) | Scoring, cost model, verdicts | TS |
| Web UI | `src/app/App.tsx` (existing) | Screens, overlay content rendering | TSX |
| Native shell | `android/` (added in Phase 1, Capacitor) | Host the WebView, bridge | Kotlin/Gradle |
| Capture service | `android/…/FarelyAccessibilityService.kt` (Phase 2) | Detect + read offers | Kotlin |
| OCR fallback | `android/…/OcrReader.kt` (Phase 2) | MediaProjection + ML Kit | Kotlin |
| Overlay | `android/…/OverlayController.kt` (Phase 3) | Draw verdict bubble | Kotlin |
| Bridge plugin | `android/…/FarelyBridgePlugin.kt` (Phase 2) | native ⇄ JS messaging | Kotlin |

Rule: **all business logic stays in `engine.ts`.** Native code only *captures*
and *displays*. It never decides accept/decline.

## 4. The parse contract (native → JS)

The native service emits a `RawOffer`. The WebView maps it to the engine's
`Offer` (`src/app/lib/engine.ts:149`). Fields the engine needs:

```ts
// engine `Offer` (existing) — target shape
interface Offer {
  id: number;
  platform: "Uber" | "Bolt" | "FreeNow";
  from: Place; to: Place;      // Place = { name, lat, lng, hub? }
  tripKm: number; tripMin: number;
  deadheadKm: number; deadheadMin: number;
  fare: number;                // gross fare shown on the platform card
  surge: number;               // 1.0 if unknown
  passenger: string;           // "" if not shown
  rating: number;              // 5 if not shown
  timestamp: number;
}
```

```jsonc
// RawOffer emitted by native — only what a screen actually shows
{
  "platform": "Bolt",          // derived from the foreground package name
  "fare": 23.50,               // parsed "23,50 zł" → number
  "pickupText": "Rynek 12",    // free text; geocoded/looked-up JS-side
  "dropoffText": "Wrocław Airport",
  "tripKm": 8.4,               // may be null if card omits it
  "tripMin": 18,               // may be null
  "surgeText": "1.4x",         // optional
  "source": "node" | "ocr",    // which path produced this
  "capturedAt": 1751414400000
}
```

### Mapping notes / open questions
- **Pickup/dropoff → `Place` (lat/lng).** Offer cards show text, not coordinates.
  Options: (a) match against `PLACES[]` in `engine.ts:113`; (b) add on-device
  geocoding later. Deadhead distance needs the driver's current GPS position.
- **Missing fields.** Cards vary. When `tripKm`/`tripMin` absent, either estimate
  from pickup/dropoff geo (haversine already in engine, `roadKm` at `engine.ts:143`)
  or mark the offer low-confidence in the overlay.
- **Currency parsing.** Handle `zł`, comma decimals (`23,50`), thin spaces.
- **Confidence.** `source: "ocr"` offers carry OCR confidence; below a threshold,
  overlay should say "low confidence — check manually".

## 5. What could break (design risks)
- App UI redesign changes node structure / layout → parser breaks. Keep parsing
  rules data-driven and per-platform, versioned.
- Offer card drawn on `SurfaceView` → node tree empty → forces OCR path.
- Multiple offers stacked → must pick the active/top card.
- Locale differences (km vs mi, decimal separator, language).
