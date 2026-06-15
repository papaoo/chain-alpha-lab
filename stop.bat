@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

echo Stopping A-share Mainline Assistant...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop-project.ps1"

if errorlevel 1 (
  echo Stop failed.
  exit /b 1
)

echo Stop completed.
exit /b 0
