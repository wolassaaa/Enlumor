$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed' }
}
& '.\.venv\Scripts\python.exe' -m pip install -r requirements-build.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Node dependency installation failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
Write-Host 'Enlumor ready. Run npm start, or npm run portable then launch-enlumor.ps1.'
