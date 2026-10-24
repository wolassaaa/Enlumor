#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || { echo 'ROLLBACK_REJECTED: isolated-copy marker required'; exit 2; }
cd "$root"
sha256sum -c NEW_FILES.sha256 >/dev/null
while IFS= read -r line; do
  path="${line:66}"
  case "$path" in src/shared/surfing-context.ts|src/shared/surfing-route.ts|tests/surfing-context.test.ts|tests/surfing-route.test.ts) rm -- "$path";; *) echo 'ROLLBACK_REJECTED: unexpected path'; exit 2;; esac
done < NEW_FILES.sha256
[[ ! -e src/shared/surfing-context.ts && ! -e src/shared/surfing-route.ts && ! -e tests/surfing-context.test.ts && ! -e tests/surfing-route.test.ts ]]
echo 'ROLLBACK PASS: four new files absent as at baseline; delivered working tree remains changed.'
