$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step($n, $msg) { Write-Host "`n[$n/2] $msg" -ForegroundColor Cyan }
function Fail($msg)      { Write-Host "[실패] $msg" -ForegroundColor Red; exit 1 }

# 버전 단일 원천: electron/package.json — electron-builder(NSIS)가 설치파일명·exe 메타데이터·완료 안내 문구에 사용.
# (사이드카 /ping 버전은 proxy/python/build.ps1 이 같은 원천에서 파생)
$ver = (Get-Content "$root\electron\package.json" -Raw | ConvertFrom-Json).version
if (-not $ver) { Fail "electron/package.json 에서 version 을 읽지 못했습니다" }

Write-Host "============================================" -ForegroundColor White
Write-Host " UXERManager Desktop 빌드 v$ver" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

Step 1 "Python 사이드카 빌드 중..."
Set-Location "$root\proxy\python"
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Fail "pip install" }
powershell -ExecutionPolicy Bypass -File ".\build.ps1" -Clean
if ($LASTEXITCODE -ne 0) { Fail "Python 빌드" }

Step 2 "Electron 앱 + NSIS 설치파일 빌드 중..."
Set-Location "$root\electron"
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install" }
# build:win = electron-builder --win --x64 --publish never (NSIS 설치파일 직접 생성, 로컬은 미배포)
npm run build:win
if ($LASTEXITCODE -ne 0) { Fail "Electron/NSIS 빌드" }

Write-Host "`n============================================" -ForegroundColor Green
Write-Host " 빌드 완료" -ForegroundColor Green
Write-Host " 산출물: electron\dist\AgenticERM_Desktop_Setup_$ver.exe" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
