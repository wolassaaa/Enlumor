# Runs the real-model benchmark on each benchmark PDF, then the in-app test mode.
# REAL MODEL CALLS: this costs money. Settings come from set-acceptance-key.ps1 (user environment variables).
# Usage: run-acceptance.ps1 [-Benchmarks lumen,attention] [-Model id] [-SkipInApp]
# Benchmark PDFs are read from .cache/benchmarks (gitignored): <name>-benchmark.pdf and <name>-qr-only.pdf.
# Make them with: python tests/acceptance/benchmark.py add paper.pdf tests/acceptance/<name>-benchmark.json .cache/benchmarks/<name>-benchmark.pdf [--qr-only]
param([string[]]$Benchmarks = @('lumen', 'attention', 'attention-hard'), [string]$Model = '', [switch]$SkipInApp)
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$pdfs = Join-Path $root '.cache\benchmarks'
foreach ($name in 'ENDPOINT', 'MODEL', 'PROTOCOL', 'KEY') {
  $value = [Environment]::GetEnvironmentVariable("ENLUMOR_ACCEPTANCE_$name", 'User')
  if ($value) { Set-Item "env:ENLUMOR_ACCEPTANCE_$name" $value } else { Remove-Item "env:ENLUMOR_ACCEPTANCE_$name" -ErrorAction SilentlyContinue }
}
if (-not $env:ENLUMOR_ACCEPTANCE_ENDPOINT) { throw 'Run scripts/acceptance/set-acceptance-key.ps1 first.' }
if ($Model) { $env:ENLUMOR_ACCEPTANCE_MODEL = $Model }
foreach ($b in $Benchmarks) {
  $file = Join-Path $pdfs "$b-benchmark.pdf"
  if (-not (Test-Path -LiteralPath $file)) { throw "Missing $file. See the header of this script for how to make it." }
}
Remove-Item env:ENLUMOR_ACCEPTANCE_MANIFEST -ErrorAction SilentlyContinue
Push-Location $root
try {
  # Build once; each run then drives the built app directly.
  npm run build | Out-Null
  foreach ($b in $Benchmarks) {
    $env:ENLUMOR_ACCEPTANCE_PDF = Join-Path $pdfs "$b-benchmark.pdf"
    Write-Host "=== $b ==="
    npx playwright test -c playwright.acceptance.config.ts real-model 2>&1 | Select-String -Pattern 'ACCEPTANCE REPORT|passed|failed|Error' | ForEach-Object { $_.Line }
  }
  if (-not $SkipInApp) {
    Write-Host '=== in-app test mode ==='
    $env:ENLUMOR_INAPP = '1'
    $env:ENLUMOR_INAPP_FILES = ($Benchmarks | ForEach-Object { "$_-qr-only.pdf" }) -join ','
    npx playwright test -c playwright.acceptance.config.ts in-app-real 2>&1 | Select-String -Pattern 'IN_APP|passed|failed|Error' | ForEach-Object { $_.Line }
  }
} finally {
  Remove-Item env:ENLUMOR_ACCEPTANCE_KEY, env:ENLUMOR_INAPP, env:ENLUMOR_INAPP_FILES -ErrorAction SilentlyContinue
  Pop-Location
}
