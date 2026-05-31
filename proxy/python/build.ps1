$ErrorActionPreference = "Stop"

Write-Host "=== Python 사이드카 빌드 ==="

if (Test-Path "venv\Scripts\Activate.ps1") {
    . "venv\Scripts\Activate.ps1"
}

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
    --copy-metadata langgraph `
    --copy-metadata langchain-core `
    --copy-metadata langchain-openai `
    --copy-metadata langsmith `
    --copy-metadata openai `
    --copy-metadata tiktoken `
    --copy-metadata pydantic `
    main.py

Write-Host "=== 빌드 완료: dist\uxer-sidecar.exe ==="
