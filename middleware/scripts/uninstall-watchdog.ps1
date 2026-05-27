# UXERManager Watchdog 제거
Unregister-ScheduledTask -TaskName "UXERManager-Middleware" -Confirm:$false
Write-Host "제거 완료"
