param(
  [int]$Port = 3006,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$nextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"

if (-not $npm) {
  throw "npm.cmd not found. Please install Node.js and npm first."
}

if (-not $node) {
  throw "node.exe not found. Please install Node.js first."
}

if (-not (Test-Path -LiteralPath $nextBin)) {
  throw "Next.js CLI not found at $nextBin. Please run npm install first."
}

function Get-PortOwner {
  param([int]$PortToCheck)
  $listener = Get-NetTCPConnection -LocalPort $PortToCheck -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) {
    return $null
  }
  return Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-PortBindable {
  param([int]$PortToCheck)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $PortToCheck)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Test-IsProjectProcess {
  param($Process)
  if (-not $Process -or -not $Process.CommandLine) {
    return $false
  }
  $escapedRoot = $ProjectRoot.Replace("\", "\\")
  return ($Process.CommandLine -like "*$ProjectRoot*" -or $Process.CommandLine -like "*$escapedRoot*")
}

function Stop-ProjectProcess {
  param($Process)
  if (-not $Process -or -not $Process.ProcessId) {
    return
  }
  Write-Host "Stopping existing project process PID $($Process.ProcessId) before clean start..."
  Stop-Process -Id $Process.ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-AllProjectNodeProcesses {
  $projectProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    (
      $_.CommandLine -like "*$ProjectRoot*" -or
      $_.CommandLine -like "*$($ProjectRoot.Replace('\', '\\'))*"
    ) -and
    (
      $_.Name -match "^node(\.exe)?$" -or
      $_.CommandLine -like "*next dev*" -or
      $_.CommandLine -like "*next\dist\server\lib\start-server.js*"
    )
  }
  foreach ($process in $projectProcesses) {
    Stop-ProjectProcess -Process $process
  }
  Start-Sleep -Seconds 1
}

function Remove-NextCache {
  $nextPath = Join-Path $ProjectRoot ".next"
  $resolvedRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
  $resolvedNext = [System.IO.Path]::GetFullPath($nextPath)
  if (-not $resolvedNext.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected .next path: $resolvedNext"
  }
  if (Test-Path -LiteralPath $resolvedNext) {
    Write-Host "Removing stale Next.js cache: $resolvedNext"
    Remove-Item -LiteralPath $resolvedNext -Recurse -Force
  }
}

if ($Clean) {
  Stop-AllProjectNodeProcesses
  Remove-NextCache
} else {
  Stop-AllProjectNodeProcesses
}

$selectedPort = $Port
for ($candidate = $Port; $candidate -le ($Port + 20); $candidate++) {
  $owner = Get-PortOwner -PortToCheck $candidate
  if (-not $owner) {
    if (Test-PortBindable -PortToCheck $candidate) {
      $selectedPort = $candidate
      break
    }
    Write-Host "Port $candidate is not bindable on 127.0.0.1, trying next port..."
    continue
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
$statusFile = Join-Path $ProjectRoot ".project-server.json"

Write-Host "Starting A-share Mainline Assistant on http://localhost:$selectedPort"
Write-Host "Project root: $ProjectRoot"
Write-Host "Logs: $outLog / $errLog"

$process = Start-Process `
  -FilePath $node.Source `
  -ArgumentList @($nextBin, "dev", "-p", "$selectedPort", "-H", "127.0.0.1") `
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

$status = [ordered]@{
  url = "http://localhost:$selectedPort"
  host = "127.0.0.1"
  port = $selectedPort
  pid = $process.Id
  launcherPid = $process.Id
  listenerPid = $process.Id
  mode = "next-dev"
  projectRoot = $ProjectRoot
  outLog = $outLog
  errLog = $errLog
  startedAt = (Get-Date).ToString("o")
}

$listener = Get-NetTCPConnection -LocalPort $selectedPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener -and $listener.OwningProcess) {
  $status.pid = [int]$listener.OwningProcess
  $status.listenerPid = [int]$listener.OwningProcess
}

$status | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding UTF8

Write-Host "Started successfully: http://localhost:$selectedPort"
Write-Host "PID: $($status.pid)"
if ($status.launcherPid -ne $status.listenerPid) {
  Write-Host "Launcher PID: $($status.launcherPid)"
}
Write-Host "Status: $statusFile"
exit 0
