from pathlib import Path
import hashlib,shutil,difflib,zipfile
root=Path.cwd();base=root/'evidence/surfing-2026-10-24';out=base/'T5-package';copy=out/'rollback-copy'
old={'package.json':'T3B-budget/originals/package.json','package-lock.json':'T3B-budget/originals/package-lock.json','scripts/build.mjs':'T3B-budget/originals/build.mjs','python/export_pdf.py':'T3A-source/originals/export_pdf.py','src/main/index.ts':'T3C-ui/originals/index.ts','src/main/preload.ts':'T3C-ui/originals/preload.ts','src/shared/model.ts':'T3C-ui/originals/model.ts','src/renderer/main.tsx':'T3C-ui/originals/main.tsx','src/renderer/style.css':'T3C-ui/originals/style.css','docs/WAVE_A_STATE.json':'T5-package/originals/docs/WAVE_A_STATE.json'}
for f,source in old.items():
 target=out/'originals'/f;target.parent.mkdir(parents=True,exist_ok=True)
 if target.resolve()!=(base/source).resolve():shutil.copy2(base/source,target)
new=sorted(str(p.relative_to(root)).replace('\\','/') for pattern in ['src/main/surfing-*.ts','src/shared/surfing-*.ts','src/renderer/surfing-*.ts','tests/surfing-*.test.ts'] for p in root.glob(pattern))+['src/renderer/SurfingPanel.tsx','tests/e2e/surfing.spec.ts','tests/python/test_surfing_source.py','docs/SURFING_OVERNIGHT_2026-10-24.md','docs/acceptance/surfing-overnight-2026-10-24.md']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();diff=[];original=[];final=[]
copy.mkdir(exist_ok=True);shutil.copytree(root/'src',copy/'src',dirs_exist_ok=True);shutil.copytree(root/'tests/python',copy/'tests/python',dirs_exist_ok=True);(copy/'tests').mkdir(exist_ok=True);shutil.copy2(root/'tests/cruise-takeover.test.ts',copy/'tests/cruise-takeover.test.ts')
with zipfile.ZipFile(out/'SOURCE_SNAPSHOT.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in [*old,*new]:
  z.write(root/f,f);final.append(f'{sha(root/f)}  {f}');dest=copy/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/f,dest)
  previous=[]
  if f in old:
   p=out/'originals'/f;original.append(f'{sha(p)}  {f}');previous=p.read_text(encoding='utf-8').splitlines(True);d=copy/'originals'/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,d)
  diff.extend(difflib.unified_diff(previous,(root/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f if f in old else '/dev/null',tofile='b/'+f))
(out/'DIFF_FILE.patch').write_text(''.join(diff),encoding='utf-8',newline='\n')
for folder in [out,copy]:
 (folder/'ORIGINAL_FILES.sha256').write_text('\n'.join(original)+'\n',encoding='utf-8',newline='\n');(folder/'FINAL_FILES.sha256').write_text('\n'.join(final)+'\n',encoding='utf-8',newline='\n')
(copy/'.surfing-rollback-copy').write_text('isolated nightly source rollback fixture\n');(copy/'vitest.config.mts').write_text("import react from '@vitejs/plugin-react';export default {plugins:[react()],test:{include:['tests/cruise-takeover.test.ts']}};\n",encoding='utf-8')
commands=[f'cp -- "originals/{f}" "{f}"' for f in old]+[f'rm -- "{f}"' for f in new]
(out/'ROLLBACK.sh').write_text('''#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_SOURCE_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
'''+ '\n'.join(commands)+f'''
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: {len(old)} original hashes restored; {len(new)} new Surfing source/doc files absent; live source and candidate retained.'
''',encoding='utf-8',newline='\n')
print('Source capsule staged:',len(old),'originals,',len(new),'new files. Package output untouched.')
