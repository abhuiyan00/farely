# native/android — staged Kotlin source (Phase 2)

These files are the **reference implementation** of the Farely capture service.
They are **staged**, not built: this repo has no `android/` project yet.

## Activate (after Phase 1 / Capacitor)
1. `npx cap add android` (creates `android/`).
2. Copy `*.kt` → `android/app/src/main/java/com/farely/app/`.
3. Copy `accessibility_service_config.xml` → `android/app/src/main/res/xml/`.
4. Merge `AndroidManifest.additions.xml` into
   `android/app/src/main/AndroidManifest.xml`.
5. Add ML Kit to `android/app/build.gradle`:
   `implementation 'com.google.mlkit:text-recognition:16.0.1'` (verify latest).
6. Register `FarelyBridgePlugin` in `MainActivity`.

See `../../docs/ocr-overlay/04-accessibility-service.md` for the full spec.

> Status: reference scaffold. Package names, node-parse selectors, and the OCR
> path are **stubs/heuristics** and must be validated on real devices with real
> offers (Phase 5). Not compile-tested — no Android toolchain in this repo yet.
