#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c NEW_FILES.sha256 >/dev/null
rm -- src/main/surfing-requests.ts tests/surfing-requests.test.ts
[[ ! -e src/main/surfing-requests.ts && ! -e tests/surfing-requests.test.ts ]]
echo 'ROLLBACK PASS: two service files absent as at baseline; live candidate retains changes.'
