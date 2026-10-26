param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$bridgeName = 'naisurf-feedback-bridge'
$exportName = 'naisurf-feedback-export'

if ($Uninstall) {
  foreach ($name in @($bridgeName, $exportName)) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($task) {
      Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $name -Confirm:$false
    }
  }
  Write-Output 'naisurf feedback tasks removed.'
  exit 0
}

$bridgeScript = Join-Path $PSScriptRoot 'feedback-bridge.mjs'
$exportScript = Join-Path $PSScriptRoot 'export-feedback.mjs'
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$bridgeAction = New-ScheduledTaskAction `
  -Execute $node `
  -Argument ('"{0}"' -f $bridgeScript) `
  -WorkingDirectory $root
$bridgeTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$bridgeSettings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650)

Register-ScheduledTask `
  -TaskName $bridgeName `
  -Description 'naisurf local feedback bridge' `
  -Action $bridgeAction `
  -Trigger $bridgeTrigger `
  -Settings $bridgeSettings `
  -Principal $principal `
  -Force | Out-Null

$exportAction = New-ScheduledTaskAction `
  -Execute $node `
  -Argument ('"{0}"' -f $exportScript) `
  -WorkingDirectory $root
$exportTrigger = New-ScheduledTaskTrigger -Daily -At '00:05'
$exportSettings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $exportName `
  -Description 'naisurf daily feedback export' `
  -Action $exportAction `
  -Trigger $exportTrigger `
  -Settings $exportSettings `
  -Principal $principal `
  -Force | Out-Null

$running = Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
if (-not $running) {
  Start-ScheduledTask -TaskName $bridgeName
}

Get-ScheduledTask -TaskName $bridgeName, $exportName |
  Select-Object TaskName, State |
  Format-Table -AutoSize
