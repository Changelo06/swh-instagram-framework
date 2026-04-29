@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SWH Instagram Framework Builder

REM Anchor to the directory this script lives in so double-clicking works.
cd /d "%~dp0"

echo.
echo  =======================================================
echo   SWH Instagram Framework Builder - one-click launcher
echo  =======================================================
echo.

REM ----- Node check ---------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo         Download Node 20+ from https://nodejs.org/ and try again.
  echo.
  pause
  exit /b 1
)

REM ----- First-run setup ----------------------------------------------------

if not exist "server\node_modules\" (
  echo [setup] Installing server dependencies...
  pushd server
  call npm install
  if errorlevel 1 ( popd & echo [ERROR] npm install failed in server. & pause & exit /b 1 )
  popd
)

if not exist "client\node_modules\" (
  echo [setup] Installing client dependencies...
  pushd client
  call npm install
  if errorlevel 1 ( popd & echo [ERROR] npm install failed in client. & pause & exit /b 1 )
  popd
)

if not exist "client\dist\index.html" (
  echo [build] Building the React UI...
  pushd client
  call npm run build
  if errorlevel 1 ( popd & echo [ERROR] client build failed. & pause & exit /b 1 )
  popd
)

REM ----- API key check ------------------------------------------------------

if not exist "server\.env" (
  echo [setup] server\.env not found - creating from .env.example.
  copy /Y "server\.env.example" "server\.env" >nul
  echo.
  echo   IMPORTANT: open  server\.env  and paste your real API keys:
  echo     ANTHROPIC_API_KEY=sk-ant-...      (required)
  echo     GROQ_API_KEY=gsk_...              (optional, for transcription)
  echo.
  echo   Then run this launcher again.
  echo.
  start "" notepad "server\.env"
  pause
  exit /b 0
)

REM ----- Launch -------------------------------------------------------------

echo [run] Starting server and opening the app in your browser...
echo       Close this window or press Ctrl+C to stop the app.
echo.

node start.js

echo.
echo [run] Server stopped.
pause
endlocal
