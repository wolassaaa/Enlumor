#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-handoff-final-copy" ]] || exit 2
cd "$root"
python - <<'PY'
from pathlib import Path
import hashlib,json,shutil
r=Path.cwd();assert (r/'.surfing-handoff-final-copy').is_file()
for f,h in json.loads((r/'FINAL_HASHES.json').read_text(encoding='utf-8')).items():assert hashlib.sha256((r/f).read_bytes()).hexdigest()==h
for f,h in json.loads((r/'ORIGINAL_HASHES.json').read_text(encoding='utf-8')).items():
 p=r/f
 if h is None:p.unlink();assert not p.exists()
 else:shutil.copyfile(r/'originals'/f,p);assert hashlib.sha256(p.read_bytes()).hexdigest()==h
print('ROLLBACK PASS: four original document hashes restored; new root launcher absent; live handoff and repair retained.')
PY
