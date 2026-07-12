@echo off
REM One-click Farely preview.
REM Double-click this file: it starts the local server and Vite auto-opens your
REM browser at the correct http://localhost:<port>/ (module scripts need http,
REM so opening index.html directly from disk will NOT work).
REM Keep the window that appears open while previewing; close it to stop.
cd /d "%~dp0"
npm run dev
