@echo off
REM One-click build + install of the Farely debug APK to a USB-connected phone.
REM Steps: web build -> copy into android/ -> gradle build -> adb install.
REM Requires: USB debugging ON, phone plugged in, and you've accepted the
REM "Allow USB debugging?" prompt on the phone screen.
setlocal
cd /d "%~dp0"
REM Resolve adb.exe: use it from PATH if present, else the default per-user SDK
REM location (works regardless of the Windows username).
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
where adb >nul 2>&1 && set "ADB=adb"
set "APK=%~dp0apps\android\android\app\build\outputs\apk\debug\app-debug.apk"

echo [1/4] Building web app...
call npm run build
if errorlevel 1 (
  echo Web build failed - fix the error above and retry.
  pause
  exit /b 1
)

echo.
echo [2/4] Copying web assets into the Android project...
pushd apps\android
call npx cap copy android
if errorlevel 1 (
  echo Capacitor copy failed.
  popd
  pause
  exit /b 1
)
popd

echo.
echo [3/4] Building the APK (first run can take a few minutes)...
cd apps\android\android
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo Android build failed - see the error above.
  cd ..\..\..
  pause
  exit /b 1
)
cd ..\..\..

echo.
echo [4/4] Installing on the phone...
"%ADB%" devices
echo.

if not exist "%APK%" (
  echo APK not found at %APK%
  pause
  exit /b 1
)

"%ADB%" install -r "%APK%"
if errorlevel 1 (
  echo Install failed. Is the phone plugged in with USB debugging allowed?
  pause
  exit /b 1
)

echo.
echo Done. Look for "Farely" in your app drawer.
echo First time only: enable Settings ^> Accessibility ^> Farely Offer Reader,
echo then open Bolt/Uber - offers get scored and the verdict bubble appears.
pause
