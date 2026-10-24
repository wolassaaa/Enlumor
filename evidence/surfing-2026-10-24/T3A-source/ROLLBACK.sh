#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
cp -- originals/export_pdf.py python/export_pdf.py
cp -- originals/surfing-requests.ts src/main/surfing-requests.ts
cp -- originals/surfing-requests.test.ts tests/surfing-requests.test.ts
rm -- src/main/surfing-source.ts tests/surfing-source.test.ts tests/python/test_surfing_source.py
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
[[ ! -e src/main/surfing-source.ts && ! -e tests/surfing-source.test.ts && ! -e tests/python/test_surfing_source.py ]]
echo 'ROLLBACK PASS: three original hashes restored; three new files absent; live candidate remains changed.'
