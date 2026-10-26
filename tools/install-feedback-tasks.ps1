param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$exportName = 'naisurf-feedback-export'
$legacyBridgeName = 'naisurf-feedback-bridge'

$legacyBridge = Get-ScheduledTask -TaskName $legacyBridgeName -ErrorAction SilentlyContinue
if ($legacyBridge) {
  Stop-ScheduledTask -TaskName $legacyBridgeName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $legacyBridgeName -Confirm:$false
}

if ($Uninstall) {
  $exportTask = Get-ScheduledTask -TaskName $exportName -ErrorAction SilentlyContinue
  if ($exportTask) {
    Stop-ScheduledTask -TaskName $exportName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $exportName -Confirm:$false
  }
  Write-Output 'naisurf GitHub feedback export task removed.'
  exit 0
}

$exportScript = Join-Path $PSScriptRoot 'export-feedback.mjs'
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument ('"{0}"' -f $exportScript) `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At '00:05'
$settings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $exportName `
  -Description 'naisurf daily GitHub feedback export' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Get-ScheduledTask -TaskName $exportName |
  Select-Object TaskName, State |
  Format-Table -AutoSize
