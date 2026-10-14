$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run setup.ps1 first.' }
$env:ENLUMOR_PYTHON = $python
$exe = Join-Path $PSScriptRoot 'release\Enlumor 0.1.0.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Run npm run portable first.' }
Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot
