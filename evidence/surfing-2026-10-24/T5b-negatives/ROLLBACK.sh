#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_SOURCE_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- "originals/surfing-requests.ts" "src/main/surfing-requests.ts"
cp -- "originals/surfing-requests.test.ts" "tests/surfing-requests.test.ts"
cp -- "originals/surfing.spec.ts" "tests/e2e/surfing.spec.ts"
cp -- "originals/WAVE_A_STATE.json" "docs/WAVE_A_STATE.json"
cp -- "originals/SURFING_OVERNIGHT_2026-10-24.md" "docs/SURFING_OVERNIGHT_2026-10-24.md"
cp -- "originals/surfing-overnight-2026-10-24.md" "docs/acceptance/surfing-overnight-2026-10-24.md"
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: six original source/doc hashes restored; live error-prefix fix and candidate retained.'
