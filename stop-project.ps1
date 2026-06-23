param(
  [int[]]$Ports = @(3004, 3005, 3006, 3007, 3015, 3016)
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StatusFile = Join-Path $ProjectRoot ".project-server.json"
$CurrentPid = $PID

function Test-IsProjectCommandLine {
  param([string]$CommandLine)
  if (-not $CommandLine) {
    return $false
  }
  $escapedRoot = $ProjectRoot.Replace("\", "\\")
  return ($CommandLine -like "*$ProjectRoot*" -or $CommandLine -like "*$escapedRoot*")
}

function Add-Pid {
  param(
    [hashtable]$Set,
    [int]$ProcessId
  )
  if ($ProcessId -gt 0 -and $ProcessId -ne $CurrentPid) {
    $Set[$ProcessId] = $true
  }
}

function Add-ProjectPidIfValid {
  param(
    [hashtable]$Set,
    [int]$ProcessId
  )
  if ($ProcessId -le 0) {
    return
  }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if ($process -and (Test-IsProjectCommandLine -CommandLine $process.CommandLine)) {
    Add-Pid -Set $Set -ProcessId $ProcessId
  }
}

function Add-Descendants {
  param(
    [hashtable]$Set,
    [int[]]$ParentIds
  )
  $queue = New-Object System.Collections.Queue
  foreach ($parentId in $ParentIds) {
    if ($parentId -gt 0) {
      $queue.Enqueue($parentId)
    }
  }
  while ($queue.Count -gt 0) {
    $parentId = [int]$queue.Dequeue()
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
      $childId = [int]$child.ProcessId
      if ($childId -le 0 -or $childId -eq $CurrentPid -or $Set.ContainsKey($childId)) {
        continue
      }
      Add-Pid -Set $Set -ProcessId $childId
      $queue.Enqueue($childId)
    }
  }
}

function Get-JsonInt {
  param(
    $Object,
    [string]$Name
  )
  if (-not $Object) {
    return 0
  }
  $property = $Object.PSObject.Properties[$Name]
  if (-not $property -or $null -eq $property.Value) {
    return 0
  }
  return [int]$property.Value
}

$targetPids = @{}

if (Test-Path -LiteralPath $StatusFile) {
  try {
    $status = Get-Content -Raw -Encoding UTF8 -LiteralPath $StatusFile | ConvertFrom-Json
    if ($status.projectRoot -and ([string]$status.projectRoot) -ne $ProjectRoot) {
      Write-Host "Ignoring status file for different project root: $($status.projectRoot)"
    } else {
      Add-ProjectPidIfValid -Set $targetPids -ProcessId (Get-JsonInt -Object $status -Name "pid")
      Add-ProjectPidIfValid -Set $targetPids -ProcessId (Get-JsonInt -Object $status -Name "listenerPid")
      Add-ProjectPidIfValid -Set $targetPids -ProcessId (Get-JsonInt -Object $status -Name "launcherPid")
    }
  } catch {
    Write-Host "Could not read status file, falling back to port scan: $($_.Exception.Message)"
  }
}

foreach ($port in $Ports) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    Add-ProjectPidIfValid -Set $targetPids -ProcessId ([int]$listener.OwningProcess)
  }
}

Add-Descendants -Set $targetPids -ParentIds @($targetPids.Keys | ForEach-Object { [int]$_ })

if ($targetPids.Count -eq 0) {
  if (Test-Path -LiteralPath $StatusFile) {
    Remove-Item -LiteralPath $StatusFile -Force
  }
  Write-Host "No running project process found for $ProjectRoot"
  exit 0
}

foreach ($processId in @($targetPids.Keys | Sort-Object -Descending)) {
  Write-Host "Stopping project PID $processId"
  Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
$remaining = @(Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue | Where-Object {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue
  $owner -and (Test-IsProjectCommandLine -CommandLine $owner.CommandLine)
})

if ($remaining.Count -gt 0) {
  $portsText = ($remaining | ForEach-Object { "$($_.LocalPort):$($_.OwningProcess)" }) -join ", "
  throw "Some project listeners are still running: $portsText"
}

if (Test-Path -LiteralPath $StatusFile) {
  Remove-Item -LiteralPath $StatusFile -Force
}

Write-Host "Stopped project processes for $ProjectRoot"
