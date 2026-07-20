@echo off
setlocal
title Globe Dashboard Launcher

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dashboard.ps1"

if errorlevel 1 (
  echo.
  echo The dashboard launcher failed. See the message above.
  pause
)

endlocal
