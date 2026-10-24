#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- "originals/WAVE_A_STATE.json" "docs/WAVE_A_STATE.json"
cp -- "originals/SURFING_OVERNIGHT_2026-10-24.md" "docs/SURFING_OVERNIGHT_2026-10-24.md"
cp -- "originals/surfing-overnight-2026-10-24.md" "docs/acceptance/surfing-overnight-2026-10-24.md"
rm -- "tests/e2e/surfing-large.spec.ts"
rm -- "evidence/surfing-2026-10-24/T5c-large/fixtures/large.pdf"
rm -- "evidence/surfing-2026-10-24/T5c-large/fixtures/overlimit.pdf"
rm -- "evidence/surfing-2026-10-24/T5c-large/fixtures/input-manifest.json"
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: three original document hashes restored; four new test/input files absent; live coverage and candidate retained.'
