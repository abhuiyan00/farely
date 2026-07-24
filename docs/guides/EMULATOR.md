# Farely — Emulator Guide (virtual phone)

Run the real Android APK on a virtual device — the most precise way to check
findings without a physical phone: you exercise the actual WebView, the Capacitor
bridge, install flow, and Android UI, while keeping the simulator's reproducible
offer stream.

> The web demo ([DEMO.md](DEMO.md)) is faster for pure engine/UI checks; the
> emulator is for verifying **the APK itself** behaves.

---

## One-time setup: create a virtual device

You need this once; afterwards `Run-On-Emulator.bat` is fully automatic.

**Via Android Studio (recommended):**

1. Install [Android Studio](https://developer.android.com/studio) with default options.
2. Open it → **More Actions → Virtual Device Manager** (or *Tools → Device Manager*).
3. Click **＋ Create virtual device** → pick **Pixel 6** → **Next**.
4. Pick the recommended system image (e.g. *API 35*) — click the **download icon**
   next to it if it isn't installed yet (~1.5 GB) → **Next** → **Finish**.

**Via command line (if you have `cmdline-tools`):**

```bat
sdkmanager "system-images;android-35;google_apis;x86_64"
avdmanager create avd -n FarelyPhone -k "system-images;android-35;google_apis;x86_64" -d pixel_6
```

## Run — one click

Double-click **`Run-On-Emulator.bat`** in the repo root. It:

1. builds the web app (`npm run build`),
2. copies it into the Android project (`cap copy`),
3. builds the debug APK (`gradlew assembleDebug`),
4. boots your virtual device (skipped if one is already running),
5. installs the APK and launches Farely.

Set `FARELY_AVD=YourAvdName` first if you have several virtual devices; otherwise
the first one is used.

## Run — manual (what the script does)

```bat
npm run apk

set SDK=%LOCALAPPDATA%\Android\Sdk
%SDK%\emulator\emulator.exe -list-avds
start "" %SDK%\emulator\emulator.exe -avd <NAME> -netdelay none -netspeed full
%SDK%\platform-tools\adb.exe wait-for-device
%SDK%\platform-tools\adb.exe install -r apps\android\android\app\build\outputs\apk\debug\app-debug.apk
%SDK%\platform-tools\adb.exe shell am start -n com.farely.app/.MainActivity
```

## Checking findings precisely

A repeatable verification pass after any change:

1. **Cold launch** — app opens full-bleed to the Home map; Wrocław tiles render
   (needs emulator internet, on by default).
2. **Offer cycle** — within ~5 s an offer overlays with route, NET price, verdict,
   countdown. Accept one, decline one; the toast and the Today chip update.
3. **Numbers spot-check** — on an offer card: `net = fare − (trip km + deadhead km) ×
   running cost/km`; `zł/h = net ÷ (trip + deadhead time)`. Compare against the
   Car tab's `zł/km cost` figure.
4. **Car search** — search `toyota prius` 2012: EPA trims must load (this proves
   native `CapacitorHttp` networking, which the web demo can't test).
5. **Persistence** — change the car + target, kill the app (recents → swipe),
   relaunch: both survive.
6. **Rides log** — entries match what you just did, with correct badges.
7. **Settings** — Offer Reader row shows `OFF` (expected: no ride apps on the
   emulator; the capture path needs a real phone with Bolt/Uber installed).

`adb logcat -s Capacitor chromium` streams the WebView console for deeper checks.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Script says *no virtual device exists* | Do the one-time setup above, run again |
| Emulator boots very slowly / black screen | Enable Windows Hypervisor Platform (Windows features) or install *Android Emulator hypervisor driver* via SDK Manager; give it a minute on first boot |
| Map is a flat grey grid | Emulator has no internet (cold-boot it: Device Manager → ▾ → *Cold Boot Now*) or GPU acceleration is off — launch with `-gpu host` |
| `INSTALL_FAILED_...` | `adb uninstall com.farely.app`, run the script again |
| Two devices listed (`adb: more than one device`) | Unplug the phone or pass `-s emulator-5554` to adb |
