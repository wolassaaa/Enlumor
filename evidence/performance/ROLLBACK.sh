#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
root="$(pwd -P)"
target="$root/.cache/performance-rollback"
mkdir -p "$target"
resolved="$(cd "$target" && pwd -P)"
[ "$resolved" = "$root/.cache/performance-rollback" ] || exit 2
printf '%s  %s\n' '126de1ef6fc5ffb04b4e1e84d75aea366587878453df95f14132d81aacbdd5e1' 'evidence/performance/original-workspace.ts' | sha256sum -c -
cp src/main/workspace.ts "$target/workspace.ts"
cp evidence/performance/original-workspace.ts "$target/workspace.ts"
cmp evidence/performance/original-workspace.ts "$target/workspace.ts"
node scripts/check-autosave.mjs .cache/performance-rollback/workspace.ts 20
printf 'ROLLBACK_RESTORED_BASELINE=PASS; LIVE_SOURCE_UNCHANGED=YES\n'
cmp src/main/workspace.ts evidence/performance/MODIFIED_FILE.ts
