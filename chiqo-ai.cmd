@echo off
setlocal EnableExtensions
title chiqo.ai

REM Anchor to the directory this script lives in so double-clicking works
REM regardless of where the user launched it from.
cd /d "%~dp0"

REM Pre-check Node so the user gets a clean message even before launch.js
REM has had a chance to print the banner.
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  chiqo.ai — Node.js is not installed.
  echo  Install the LTS build from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

node scripts\launch.js
set EXITCODE=%errorlevel%
echo.
pause
exit /b %EXITCODE%
