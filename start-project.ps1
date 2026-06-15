param(
  [int]$Port = 3006
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $npm) {
  throw "npm.cmd not found. Please install Node.js and npm first."
}

function Get-PortOwner {
  param([int]$PortToCheck)
  $listener = Get-NetTCPConnection -LocalPort $PortToCheck -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) {
    return $null
  }
  return Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-IsProjectProcess {
  param($Process)
  if (-not $Process -or -not $Process.CommandLine) {
    return $false
  }
  $escapedRoot = $ProjectRoot.Replace("\", "\\")
  return ($Process.CommandLine -like "*$ProjectRoot*" -or $Process.CommandLine -like "*$escapedRoot*")
}

$selectedPort = $Port
for ($candidate = $Port; $candidate -le ($Port + 20); $candidate++) {
  $owner = Get-PortOwner -PortToCheck $candidate
  if (-not $owner) {
    $selectedPort = $candidate
    break
  }
  if (Test-IsProjectProcess -Process $owner) {
    Write-Host "Project already appears to be running on http://localhost:$candidate"
    Write-Host "Owner PID: $($owner.ProcessId)"
    exit 0
  }
  Write-Host "Port $candidate is occupied by $($owner.Name) PID $($owner.ProcessId), trying next port..."
}

$outLog = Join-Path $ProjectRoot ".next-dev-$selectedPort.out.log"
$errLog = Join-Path $ProjectRoot ".next-dev-$selectedPort.err.log"

Write-Host "Starting A-share Mainline Assistant on http://localhost:$selectedPort"
Write-Host "Project root: $ProjectRoot"
Write-Host "Logs: $outLog / $errLog"

$process = Start-Process `
  -FilePath $npm.Source `
  -ArgumentList @("run", "dev", "--", "-p", "$selectedPort") `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Start-Sleep -Seconds 5

$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$selectedPort/" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  Write-Host "Server did not respond in time. Check logs:"
  Write-Host $outLog
  Write-Host $errLog
  exit 1
}

Write-Host "Started successfully: http://localhost:$selectedPort"
Write-Host "PID: $($process.Id)"
exit 0
