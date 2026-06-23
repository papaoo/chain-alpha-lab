@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ARG1=%~1"
set "ARG2=%~2"

if /I "%ARG1%"=="clean" (
  if "%ARG2%"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-project.ps1" -Clean
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-project.ps1" -Clean -Port %ARG2%
  )
) else if "%ARG1%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-project.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-project.ps1" -Port %ARG1%
)

if errorlevel 1 (
  echo Start failed.
  exit /b 1
)

echo.
echo Project status:
powershell -NoProfile -ExecutionPolicy Bypass -Command "$statusFile = Join-Path '%SCRIPT_DIR%' '.project-server.json'; if (Test-Path -LiteralPath $statusFile) { $s = Get-Content -Raw -Encoding UTF8 $statusFile | ConvertFrom-Json; Write-Host ('URL: ' + $s.url); Write-Host ('PID: ' + $s.pid); Write-Host ('Logs: ' + $s.outLog + ' / ' + $s.errLog) } else { Write-Host 'Status file not found.' }"

exit /b %errorlevel%
