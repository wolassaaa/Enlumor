#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- "originals/index.ts" "src/main/index.ts"
cp -- "originals/preload.ts" "src/main/preload.ts"
cp -- "originals/model.ts" "src/shared/model.ts"
cp -- "originals/surfing-requests.ts" "src/main/surfing-requests.ts"
cp -- "originals/main.tsx" "src/renderer/main.tsx"
cp -- "originals/style.css" "src/renderer/style.css"
cp -- "originals/surfing-requests.test.ts" "tests/surfing-requests.test.ts"
rm -- "src/main/surfing-runtime.ts"
rm -- "src/shared/surfing-bridge.ts"
rm -- "src/renderer/SurfingPanel.tsx"
rm -- "tests/surfing-runtime.test.ts"
rm -- "tests/e2e/surfing.spec.ts"
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: seven original hashes restored; five new files absent; live Surfing candidate retains changes.'
