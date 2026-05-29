# UXERManager 미들웨어 — Windows Task Scheduler Watchdog 등록
# 실행: 관리자 권한 PowerShell에서
# .\scripts\install-watchdog.ps1 -ExePath "C:\path\to\uxermanager.exe"

param(
  [Parameter(Mandatory=$true)]
  [string]$ExePath
)

$TaskName    = "UXERManager-Middleware"
$Description = "UXERManager 미들웨어 자동 재시작 (Watchdog)"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action   = New-ScheduledTaskAction -Execute $ExePath
$Trigger  = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
              -MultipleInstances IgnoreNew `
              -RestartCount 3 `
              -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit (New-TimeSpan -Hours 0)

Register-ScheduledTask `
  -TaskName    $TaskName `
  -Action      $Action `
  -Trigger     $Trigger `
  -Settings    $Settings `
  -Description $Description `
  -RunLevel    Highest

Write-Host "등록 완료: $TaskName"
Write-Host "즉시 시작: Start-ScheduledTask -TaskName '$TaskName'"
