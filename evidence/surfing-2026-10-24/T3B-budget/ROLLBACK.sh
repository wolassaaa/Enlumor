#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- "originals/package.json" "package.json"
cp -- "originals/package-lock.json" "package-lock.json"
cp -- "originals/build.mjs" "scripts/build.mjs"
cp -- "originals/surfing-requests.ts" "src/main/surfing-requests.ts"
cp -- "originals/surfing-requests.test.ts" "tests/surfing-requests.test.ts"
rm -- "src/renderer/surfing-command-host.ts"
rm -- "tests/surfing-command-host.test.ts"
rm -- "src/main/surfing-token-count.ts"
rm -- "src/main/surfing-tokenizer-models.ts"
rm -- "src/main/surfing-token-worker.ts"
rm -- "src/main/surfing-token-worker-host.ts"
rm -- "tests/surfing-token-count.test.ts"
rm -- "tests/surfing-token-worker.test.ts"
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: five original hashes restored; eight new files absent; live candidate remains changed.'
