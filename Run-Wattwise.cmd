@echo off
setlocal
cd /d "%~dp0"
title Wattwise - Windows desktop setup
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is needed for this Windows run package.
  echo Install the LTS version from https://nodejs.org/en/download
  echo Then close this window and double-click Run-Wattwise.cmd again.
  echo Python is NOT required.
  echo.
  pause
  exit /b 1
)
node scripts\launch-windows.cjs
if errorlevel 1 (
  echo.
  echo Wattwise could not start. The error is shown above.
  echo Please send that error text or a screenshot for help.
  echo Do not disable Windows Defender, SmartScreen, or your firewall.
  pause
  exit /b 1
)
endlocal
