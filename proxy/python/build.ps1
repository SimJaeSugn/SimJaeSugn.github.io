$ErrorActionPreference = "Stop"

Write-Host "=== Python 사이드카 빌드 ==="

if (Test-Path "venv\Scripts\Activate.ps1") {
    . "venv\Scripts\Activate.ps1"
}

pyinstaller `
    --onefile `
    --noconsole `
    --name uxer-sidecar `
    --distpath dist `
    --workpath build `
    main.py

Write-Host "=== 빌드 완료: dist\uxer-sidecar.exe ==="
