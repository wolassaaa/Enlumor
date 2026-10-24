#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-issues-copy" ]] || exit 2
cd "$root"
python - <<'PY'
from pathlib import Path
import hashlib,json,shutil
r=Path.cwd();assert (r/'.surfing-issues-copy').is_file()
for f,h in json.loads((r/'FINAL_HASHES.json').read_text()).items():assert hashlib.sha256((r/f).read_bytes()).hexdigest()==h
for f,h in json.loads((r/'ORIGINAL_HASHES.json').read_text()).items():
 p=r/f
 if h is None:p.unlink();assert not p.exists()
 else:shutil.copyfile(r/'originals'/f,p);assert hashlib.sha256(p.read_bytes()).hexdigest()==h
print('ROLLBACK PASS: two original documents restored; two new issue ledgers absent; live issue records retained.')
PY
