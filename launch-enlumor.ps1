$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'release\Enlumor 0.1.1.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Run npm run portable first.' }
Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot
