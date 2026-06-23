$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# ─────────────────────────────────────────────────────────────────────────────
# release-desktop.ps1 — 로컬에서 직접 GitHub Release 게시(자동 업데이트 배포)
#
#   build-desktop.ps1 은 로컬 산출물만 만든다(electron\dist, --publish never).
#   이 스크립트는 거기에 "게시"를 더해, 내 PC에서 빌드한 NSIS exe·latest.yml·blockmap 을
#   electron-builder --publish always 로 GitHub Release(v<버전>)에 바로 올린다.
#   설치된 앱은 이 릴리스를 electron-updater 로 받아 자동 업데이트한다.
#
#   버전 단일 원천: electron/package.json 의 version. (직접 수정 후 이 스크립트 실행)
#   게시 인증:      GH_TOKEN(또는 GITHUB_TOKEN) 환경변수. 없으면 gh CLI 토큰을 재활용한다.
#
#   사용:  electron/package.json 의 version 을 올린 뒤 →  .\release-desktop.ps1
# ─────────────────────────────────────────────────────────────────────────────

function Step($n, $msg) { Write-Host "`n[$n/2] $msg" -ForegroundColor Cyan }
function Fail($msg)      { Write-Host "[실패] $msg" -ForegroundColor Red; exit 1 }

# 버전 단일 원천: electron/package.json
$ver = (Get-Content "$root\electron\package.json" -Raw | ConvertFrom-Json).version
if (-not $ver) { Fail "electron/package.json 에서 version 을 읽지 못했습니다" }

Write-Host "============================================" -ForegroundColor White
Write-Host " UXERManager Desktop 릴리스 v$ver (로컬 → GitHub Release)" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ── 게시 토큰 확보: GH_TOKEN 우선, 없으면 gh CLI 토큰 재활용(repo 권한 필요) ──
if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
    Write-Host "[토큰] GH_TOKEN 미설정 — gh CLI 토큰 재활용 시도..." -ForegroundColor Yellow
    $tok = $null
    try { $tok = (gh auth token 2>$null) } catch {}
    if ($tok) {
        $env:GH_TOKEN = $tok.Trim()
        Write-Host "[토큰] gh auth token 사용" -ForegroundColor Green
    } else {
        Fail "게시 토큰이 없습니다. `$env:GH_TOKEN 에 repo 권한 토큰을 지정하거나 'gh auth login' 후 다시 실행하세요."
    }
}

Step 1 "Python 사이드카 빌드 중..."
Set-Location "$root\proxy\python"
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Fail "pip install" }
powershell -ExecutionPolicy Bypass -File ".\build.ps1" -Clean
if ($LASTEXITCODE -ne 0) { Fail "Python 빌드" }

Step 2 "Electron NSIS 빌드 + GitHub Release 게시 중..."
Set-Location "$root\electron"
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install" }
# release = electron-builder --win --x64 --publish always (exe·latest.yml·blockmap 게시, releaseType:release)
npm run release
if ($LASTEXITCODE -ne 0) { Fail "electron-builder 게시" }

Set-Location $root
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " 릴리스 완료 — GitHub Release v$ver 게시됨" -ForegroundColor Green
Write-Host " https://github.com/SimJaeSugn/SimJaeSugn.github.io/releases/tag/v$ver" -ForegroundColor Green
Write-Host " 설치된 앱은 다음 실행 시 자동 업데이트 안내가 표시됩니다." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# 참고: 로컬 게시는 package.json 버전으로 릴리스(태그 v$ver 포함)를 electron-builder 가 만든다.
# 저장소와 릴리스가 어긋나지 않게, 버전 올린 package.json 은 커밋·push 해두기를 권장한다:
#   git add electron/package.json electron/package-lock.json; git commit -m "v$ver"; git push
