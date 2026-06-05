$ErrorActionPreference = "Stop"
# 주의: $ErrorActionPreference="Stop" 은 PowerShell cmdlet 에러만 멈춘다.
# pyinstaller 같은 네이티브 exe 의 실패(0이 아닌 exit code)는 자동으로 안 멈추므로
# 아래에서 $LASTEXITCODE 를 직접 검사한다(없으면 빌드 실패해도 "완료"로 속는다).

# 경로를 스크립트 위치 기준으로 고정 (cwd 무관하게 dist/build/main.py 해소)
Set-Location $PSScriptRoot
$exe = Join-Path $PSScriptRoot "dist\uxer-sidecar.exe"

Write-Host "=== Python 사이드카 빌드 ===" -ForegroundColor White

# ── 사전 점검 ①: 실행 중인 사이드카가 dist\uxer-sidecar.exe 를 잠그면 PyInstaller 가
#    덮어쓰지 못한다. 어차피 이 빌드가 교체할 exe 이므로 잔존 프로세스를 종료해 잠금을 푼다.
$stray = Get-Process -Name "uxer-sidecar" -ErrorAction SilentlyContinue
if ($stray) {
    Write-Host "[정리] 실행 중인 사이드카 종료(exe 잠금 해제): PID $($stray.Id -join ', ')" -ForegroundColor Yellow
    $stray | Stop-Process -Force
    Start-Sleep -Milliseconds 800
}

if (-not (Test-Path (Join-Path $PSScriptRoot "dist"))) {
    New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot "dist") | Out-Null
}

# ── 사전 점검 ②: 기존 exe 가 여전히 쓰기 잠김이면(다른 앱이 사용 중) 명확히 실패시킨다.
if (Test-Path $exe) {
    try {
        $fs = [System.IO.File]::Open($exe, 'Open', 'ReadWrite', 'None')
        $fs.Close()
    } catch {
        Write-Host "[실패] $exe 가 잠겨 있습니다(다른 프로세스가 사용 중)." -ForegroundColor Red
        Write-Host "       데스크탑 앱을 완전히 종료한 뒤 다시 빌드하세요." -ForegroundColor Red
        exit 1
    }
}

if (Test-Path "venv\Scripts\Activate.ps1") {
    . "venv\Scripts\Activate.ps1"
}

# 갱신 검증용: 빌드 전 기존 exe 시각 기록
$before = if (Test-Path $exe) { (Get-Item $exe).LastWriteTimeUtc } else { [datetime]::MinValue }

# langchain / langgraph 계열은 동적 임포트와 패키지 메타데이터(importlib.metadata)에
# 의존하므로, PyInstaller 가 누락하지 않도록 collect-all + copy-metadata 를 명시한다.
# (없으면 설치는 되어도 번들 exe 실행 시 ModuleNotFound / PackageNotFound 로 죽는다)
pyinstaller `
    --onefile `
    --noconsole `
    --name uxer-sidecar `
    --distpath dist `
    --workpath build `
    --collect-all langgraph `
    --collect-all langchain_core `
    --collect-all langchain_openai `
    --collect-all langsmith `
    --collect-all openai `
    --collect-all tiktoken `
    --collect-all openpyxl `
    --copy-metadata langgraph `
    --copy-metadata langchain-core `
    --copy-metadata langchain-openai `
    --copy-metadata langsmith `
    --copy-metadata openai `
    --copy-metadata tiktoken `
    --copy-metadata pydantic `
    main.py

# ── 사후 점검 ①(핵심): PyInstaller(네이티브)의 실패 exit code 를 직접 확인 ──
if ($LASTEXITCODE -ne 0) {
    Write-Host "[실패] PyInstaller 가 코드 $LASTEXITCODE 로 종료했습니다. 위 로그를 확인하세요." -ForegroundColor Red
    exit 1
}

# ── 사후 점검 ②: 산출물 존재 검증 ──
if (-not (Test-Path $exe)) {
    Write-Host "[실패] 빌드가 끝났다고 했지만 $exe 가 없습니다." -ForegroundColor Red
    exit 1
}

# 타임스탬프 갱신 여부는 '실패'가 아니라 '재생성 vs 이미 최신' 구분용일 뿐이다.
# PyInstaller 는 소스 변경이 없으면 기존 exe 를 재사용한다(증분 no-op = 정상, 이미 최신).
# 잠금으로 인한 진짜 실패는 사전점검 ②([System.IO.File]::Open)와 사후 exit code 검사 ③ 가 잡는다.
if ((Get-Item $exe).LastWriteTimeUtc -le $before) {
    Write-Host "=== 이미 최신: dist\uxer-sidecar.exe (소스 변경 없어 재생성 생략 · $((Get-Item $exe).LastWriteTime)) ===" -ForegroundColor Yellow
} else {
    Write-Host "=== 빌드 완료: dist\uxer-sidecar.exe (갱신 $((Get-Item $exe).LastWriteTime)) ===" -ForegroundColor Green
}
