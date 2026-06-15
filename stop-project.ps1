param(
  [int[]]$Ports = @(3004, 3005, 3006, 3007, 3016)
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$escapedRoot = $ProjectRoot.Replace("\", "\\")
$currentPid = $PID

function Stop-IfRunning {
  param([int]$ProcessId)
  if ($ProcessId -eq $currentPid) {
    return
  }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

$projectProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $currentPid -and
  $_.CommandLine -and
  (
    $_.CommandLine -like "*$ProjectRoot*" -or
    $_.CommandLine -like "*$escapedRoot*"
  ) -and
  (
    $_.Name -match "^node(\\.exe)?$" -or
    $_.CommandLine -like "*next dev*" -or
    $_.CommandLine -like "*next\\dist\\server\\lib\\start-server.js*"
  )
}

foreach ($process in $projectProcesses) {
  Stop-IfRunning -ProcessId $process.ProcessId
}

foreach ($port in $Ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($owner -and $owner.CommandLine -and ($owner.CommandLine -like "*$ProjectRoot*" -or $owner.CommandLine -like "*$escapedRoot*")) {
      Stop-IfRunning -ProcessId $listener.OwningProcess
    }
  }
}

Start-Sleep -Seconds 1
$remaining = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue | Where-Object {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue
  $owner -and $owner.CommandLine -and ($owner.CommandLine -like "*$ProjectRoot*" -or $owner.CommandLine -like "*$escapedRoot*")
}

if ($remaining) {
  $portsText = ($remaining | ForEach-Object { "$($_.LocalPort):$($_.OwningProcess)" }) -join ", "
  throw "Some project listeners are still running: $portsText"
}

Write-Host "Stopped project processes for $ProjectRoot"
