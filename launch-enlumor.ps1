$ErrorActionPreference = 'Stop'
$manifest = Join-Path $PSScriptRoot 'release\latest.json'
if (-not (Test-Path -LiteralPath $manifest)) { throw 'Run npm run release:verified first.' }
$release = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
$exe = Join-Path (Join-Path $PSScriptRoot 'release') $release.exe
if (-not (Test-Path -LiteralPath $exe)) { throw 'Released application is missing.' }
Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot
