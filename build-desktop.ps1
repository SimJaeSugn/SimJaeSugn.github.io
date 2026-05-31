$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step($n, $msg) { Write-Host "`n[$n/3] $msg" -ForegroundColor Cyan }
function Fail($msg)      { Write-Host "[실패] $msg" -ForegroundColor Red; exit 1 }

Write-Host "============================================" -ForegroundColor White
Write-Host " UXERManager Desktop 빌드" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

Step 1 "Python 사이드카 빌드 중..."
Set-Location "$root\proxy\python"
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Fail "pip install" }
powershell -ExecutionPolicy Bypass -File ".\build.ps1"
if ($LASTEXITCODE -ne 0) { Fail "Python 빌드" }

Step 2 "Electron 앱 빌드 중..."
Set-Location "$root\electron"
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install" }
npm run build:win
if ($LASTEXITCODE -ne 0) { Fail "Electron 빌드" }

Step 3 "Inno Setup 설치파일 생성 중..."
Set-Location $root
iscc electron\installer.iss
if ($LASTEXITCODE -ne 0) { Fail "Inno Setup" }

Write-Host "`n============================================" -ForegroundColor Green
Write-Host " 빌드 완료" -ForegroundColor Green
Write-Host " 산출물: electron\dist\UXERManager_Desktop_Setup_1.0.0.exe" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
