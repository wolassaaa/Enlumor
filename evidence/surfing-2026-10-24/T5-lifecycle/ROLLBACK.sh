#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- originals/main.tsx src/renderer/main.tsx
cp -- originals/surfing.spec.ts tests/e2e/surfing.spec.ts
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: two original hashes restored; live transition cancellation remains changed.'
