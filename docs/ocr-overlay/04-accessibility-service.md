# 04 — Phase 2: Accessibility Service (Capture) Spec

> This is the "brain" that detects a new offer and reads it. Source is **staged**
> under `native/android/` and copied into `android/app/src/main/…` after Phase 1
> (Capacitor) creates the `android/` project. **It will not compile until then.**

## 1. Responsibilities
1. Detect the foreground app is a target (Bolt / Uber / FreeNow) by package name.
2. On a screen-content / notification event, try to read offer text from the
   **accessibility node tree** (cheap path).
3. If the fields aren't in the node tree, trigger the **OCR fallback**
   (MediaProjection + ML Kit) — see `OcrReader`.
4. Normalize to a `RawOffer` and push it to the WebView via the Capacitor bridge.
5. Never score. Scoring is `scoreOffer()` in the WebView.

## 2. Target packages (verify on real devices)

```kotlin
// Package names must be confirmed per region/version.
val TARGET_PACKAGES = mapOf(
    "ee.mtakso.driver"        to "Bolt",     // Bolt Driver
    "com.ubercab.driver"      to "Uber",     // Uber Driver
    "com.mytaxi.driver"       to "FreeNow"   // FreeNow / mytaxi driver
)
```

## 3. Event flow (pseudocode)

```
onAccessibilityEvent(e):
    pkg = e.packageName
    if pkg not in TARGET_PACKAGES: return
    if e.type not in {WINDOW_CONTENT_CHANGED, WINDOW_STATE_CHANGED, NOTIFICATION_STATE_CHANGED}: return
    if not looksLikeOfferScreen(rootNode): return          # heuristic: contains "zł" + a distance token
    raw = parseFromNodes(rootNode, platform)
    if raw.incomplete and canCapture(): raw = ocrReader.readNow(platform)
    if raw.valid: bridge.emit("farely:rawOffer", raw)
```

## 4. Debounce / de-dup
- Content-changed events fire in bursts → debounce ~300 ms, keep the last.
- Hash `(platform, fare, pickupText, dropoffText)`; drop duplicates within 30 s so
  one offer isn't scored repeatedly as the card animates.

## 5. Staged source layout

```
native/android/
  ├─ FarelyAccessibilityService.kt   # detect + node parse + orchestrate
  ├─ OfferNodeParser.kt              # node-tree → RawOffer (cheap path)
  ├─ OcrReader.kt                    # MediaProjection + ML Kit fallback (stub)
  ├─ FarelyBridgePlugin.kt           # Capacitor plugin: native → JS events
  ├─ RawOffer.kt                     # data class
  └─ AndroidManifest.additions.xml   # service + permission declarations to merge
```

## 6. Integration checklist (after Phase 1)
- [ ] Copy `native/android/*.kt` → `android/app/src/main/java/com/farely/app/`
- [ ] Merge `AndroidManifest.additions.xml` into `android/app/src/main/AndroidManifest.xml`
- [ ] Add ML Kit dep to `android/app/build.gradle`:
      `implementation 'com.google.mlkit:text-recognition:16.0.1'` (verify latest)
- [ ] Add `res/xml/accessibility_service_config.xml`
- [ ] Register `FarelyBridgePlugin` in the Capacitor `MainActivity`
- [ ] JS side: listen for `farely:rawOffer`, map → `Offer`, call `scoreOffer`

## 7. JS-side wiring (WebView, added to App.tsx offer loop)

```ts
// Pseudocode — replaces the simulated incoming-offer trigger in App.tsx
import { Offer, scoreOffer } from "@/app/lib/engine";

FarelyBridge.addListener("farely:rawOffer", (raw) => {
  const offer = mapRawToOffer(raw, currentPosition, PLACES); // resolve places, estimate missing km/min
  const scored = scoreOffer(offer, vehicle, thresholds);
  dispatch({ type: "OFFER_IN", offer: scored });             // reuse existing session flow
  FarelyBridge.showOverlay(scored.verdict, scored.perHr, scored.reason); // Phase 3
});
```

See the staged `.kt` files for the reference native implementation.
