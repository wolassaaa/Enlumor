#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")" && pwd)"
target="$(realpath -m -- "${1:?Usage: ROLLBACK.sh path-to-export_pdf.py}")"
case "$target" in "$root"/*) ;; *) echo 'Target must stay inside Enlumor'; exit 2;; esac
expected='3a6cedd4312c03014c869c8a0a15e959081945039c5fc3635f2c57e73322fb8e'
actual="$(sha256sum -- "$target" | cut -d ' ' -f 1)"
[[ "$actual" == "$expected" ]] || { echo 'Modified hash mismatch; no file changed'; exit 2; }
temporary="$(mktemp "${target}.rollback.XXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
git -C "$root" show 7f65e03:python/export_pdf.py > "$temporary"
mv -f -- "$temporary" "$target"
echo 'ROLLBACK: RESTORED 7f65e03 python/export_pdf.py'
