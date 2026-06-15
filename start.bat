@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PORT=%~1"

if "%PORT%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-project.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-project.ps1" -Port %PORT%
)

exit /b %errorlevel%
