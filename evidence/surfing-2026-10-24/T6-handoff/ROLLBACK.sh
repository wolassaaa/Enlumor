#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-handoff-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
rm -- docs/SURFING_HANDOFF_2026-10-24.md
[[ ! -e docs/SURFING_HANDOFF_2026-10-24.md ]]
echo 'ROLLBACK PASS: isolated handoff absent; live handoff and candidate retained.'
