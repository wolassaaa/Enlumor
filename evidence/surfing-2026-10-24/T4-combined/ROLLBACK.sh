#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- "originals/src/main/surfing-runtime.ts" "src/main/surfing-runtime.ts"
cp -- "originals/src/main/surfing-requests.ts" "src/main/surfing-requests.ts"
cp -- "originals/tests/surfing-runtime.test.ts" "tests/surfing-runtime.test.ts"
cp -- "originals/src/main/index.ts" "src/main/index.ts"
cp -- "originals/src/main/preload.ts" "src/main/preload.ts"
cp -- "originals/src/shared/surfing-bridge.ts" "src/shared/surfing-bridge.ts"
cp -- "originals/src/renderer/main.tsx" "src/renderer/main.tsx"
cp -- "originals/src/renderer/SurfingPanel.tsx" "src/renderer/SurfingPanel.tsx"
cp -- "originals/tests/e2e/surfing.spec.ts" "tests/e2e/surfing.spec.ts"
rm -- "src/main/surfing-sessions.ts"
rm -- "src/shared/surfing-session.ts"
rm -- "tests/surfing-sessions.test.ts"
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: nine original hashes restored; three new files absent; live candidate retains changes.'
