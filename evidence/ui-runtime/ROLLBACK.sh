#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
target="$(realpath -m -- "${1:?Usage: ROLLBACK.sh path-to-python.ts-copy}")"
case "$target" in "$root"/*) ;; *) echo 'Target must stay inside Enlumor'; exit 2;; esac
actual="$(sha256sum -- "$target" | cut -d ' ' -f 1)"
[[ "$actual" == '64e49a1d5d6ee61a6f870a223290487a16804cb7372b17cf507f059c8cc9e09d' ]] || { echo 'Modified hash mismatch; no file changed'; exit 2; }
temporary="$(mktemp "${target}.rollback.XXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
git -C "$root" show 3490561:src/main/python.ts > "$temporary"
mv -f -- "$temporary" "$target"
echo 'ROLLBACK: RESTORED 3490561 src/main/python.ts'
