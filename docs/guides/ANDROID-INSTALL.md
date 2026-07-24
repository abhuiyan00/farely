# Farely — Android Installation Guide (real phone)

Install the Farely APK on your own Android phone. This is the **production** way to
run Farely: the accessibility service reads real Bolt/Uber/FreeNow offers off the
screen, scores them with the same engine as the web demo, and shows the verdict as
an over-app bubble while you drive.

> Just want to try the app without a phone? Use the [web demo](DEMO.md) or the
> [emulator](EMULATOR.md) instead — installation and demo are fully independent.

---

## Prerequisites (one-time)

| # | Requirement | How |
|---|---|---|
| 1 | **Node.js 18+** | <https://nodejs.org> — verify with `node -v` |
| 2 | **Android SDK** | Install [Android Studio](https://developer.android.com/studio) with default options (puts the SDK in `%LOCALAPPDATA%\Android\Sdk`) |
| 3 | **JDK 17+** | Bundled with Android Studio — nothing extra to do |
| 4 | **Project deps** | `pnpm install` (or `npm install`) in the repo root |
| 5 | **USB debugging on the phone** | Settings → About phone → tap **Build number** 7× → back → **Developer options** → enable **USB debugging** |

## Install — one click

1. Plug the phone in via USB.
2. Double-click **`Install-To-Phone.bat`** in the repo root.
3. When the phone shows **"Allow USB debugging?"**, tick *Always allow* and accept.
4. Wait for `Done` — **Farely** appears in the app drawer.

The script runs: web build → `cap copy` → `gradlew assembleDebug` → `adb install`.
The first Gradle build downloads dependencies and can take a few minutes; later
runs take seconds.

## Install — manual (what the script does)

```bash
# from the repo root
npm run apk
#   → apps/android/android/app/build/outputs/apk/debug/app-debug.apk

# then, with the phone connected:
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe install -r ^
  apps\android\android\app\build\outputs\apk\debug\app-debug.apk
```

No USB cable? Copy `app-debug.apk` to the phone (Drive/USB-C stick), open it in a
file manager, and allow *Install unknown apps* when prompted.

## First run on the phone (one-time setup)

1. **Open Farely** — the same UI as the web demo, full-bleed.
2. **Enable the Offer Reader**: Android **Settings → Accessibility → Farely Offer
   Reader → On**. This is the service that reads offer cards from ride apps.
   Farely's Settings tab shows `ENABLED` when it's active.
3. **Allow "Display over other apps"** when asked — that's the verdict bubble.
4. Open Bolt/Uber and go online — when an offer card appears, Farely scores it and
   the bubble shows ACCEPT / MARGINAL / DECLINE with the net numbers.
5. In **Farely → Car**, set your real car (search autofills consumption and costs);
   in **Settings**, set your net zł/h target. Both persist.

Optional keys (Settings → *Cloud vision & live data*): your own **Anthropic** key
for the unknown-screen classifier and **Ticketmaster** key for live events. Farely
works fully without them.

## Updating

Re-run `Install-To-Phone.bat` (or `npm run apk` + `adb install -r …`) after any
code change. User data (car, targets, history) survives reinstalls.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `adb: no devices found` | Re-plug USB, accept the debugging prompt on the phone, or set USB mode to *File transfer* |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | A build signed with a different key is installed: `adb uninstall com.farely.app`, then install again |
| Gradle fails with SDK errors | Open `apps/android/android` once in Android Studio — it repairs `local.properties` and downloads missing SDK pieces |
| Offer Reader won't stay enabled | Some OEMs (Xiaomi/Huawei) kill accessibility services — exempt Farely from battery optimization |
| Bubble doesn't appear | Check *Display over other apps* permission for Farely |

## Privacy note

Farely is on-device by default — earnings, logs, and captures stay on the phone.
The only network calls are map tiles, car-spec lookups, and (only if you opt in
with your own key) the cloud-vision classifier. Identity/face-check screens are
**never** sent anywhere. Details: [`docs/VISION.md`](../VISION.md).
