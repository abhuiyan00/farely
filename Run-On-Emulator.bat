@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM  Farely — one-click DEMO on the Android Emulator (no phone needed).
REM  Steps: web build -> copy into the Android project -> gradle APK ->
REM         boot the "FarelyPhone" virtual device -> install -> launch.
REM
REM  First time only: if no virtual device exists yet, this script tells you
REM  exactly how to create one (docs/guides/EMULATOR.md has screenshots-level
REM  detail). Every later run is fully automatic.
REM
REM  Optional: set FARELY_AVD to use a specific virtual device name.
REM ═══════════════════════════════════════════════════════════════════════════
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "ADB=%SDK%\platform-tools\adb.exe"
set "EMU=%SDK%\emulator\emulator.exe"
set "APK=%~dp0apps\android\android\app\build\outputs\apk\debug\app-debug.apk"

if not exist "%EMU%" (
  echo [!] Android Emulator not found at %EMU%
  echo     Install Android Studio ^(https://developer.android.com/studio^) with the
  echo     default SDK options, then run this script again.
  pause & exit /b 1
)

REM ── pick a virtual device ───────────────────────────────────────────────────
set "AVD=%FARELY_AVD%"
if "%AVD%"=="" (
  for /f "delims=" %%A in ('"%EMU%" -list-avds 2^>nul') do (
    if "!AVD!"=="" set "AVD=%%A"
  )
)
if "%AVD%"=="" (
  echo [!] No Android virtual device exists yet ^(one-time setup^):
  echo.
  echo     1. Open Android Studio and go to  More Actions ^> Virtual Device Manager
  echo     2. Click "+" ^(Create virtual device^), pick "Pixel 6", click Next
  echo     3. Pick the recommended system image ^(download if asked^), Next, Finish
  echo.
  echo     Full walkthrough: docs\guides\EMULATOR.md
  echo     Then run this script again — everything after this is automatic.
  pause & exit /b 1
)
echo Using virtual device: %AVD%

echo.
echo [1/5] Building the web app...
call npm run build || (echo Web build failed. & pause & exit /b 1)

echo.
echo [2/5] Copying web assets into the Android project...
pushd apps\android
call npx cap copy android || (popd & echo Capacitor copy failed. & pause & exit /b 1)
popd

echo.
echo [3/5] Building the APK...
pushd apps\android\android
call gradlew.bat assembleDebug || (popd & echo Android build failed. & pause & exit /b 1)
popd

echo.
echo [4/5] Booting the emulator (skipped if already running)...
"%ADB%" get-state >nul 2>&1
if errorlevel 1 (
  start "Farely emulator" "%EMU%" -avd "%AVD%" -netdelay none -netspeed full
)
echo     Waiting for Android to finish booting...
"%ADB%" wait-for-device
:bootwait
for /f "delims=" %%B in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set "BOOTED=%%B"
if not "%BOOTED%"=="1" (
  timeout /t 3 /nobreak >nul
  goto bootwait
)

echo.
echo [5/5] Installing and launching Farely...
"%ADB%" install -r "%APK%" || (echo Install failed. & pause & exit /b 1)
"%ADB%" shell am start -n com.farely.app/.MainActivity

echo.
echo Done — Farely is running on the emulator.
echo Tip: the web simulator drives the offers there; real capture needs a phone
echo      with Bolt/Uber installed (see Install-To-Phone.bat).
pause
