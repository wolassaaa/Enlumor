from pathlib import Path
import hashlib,shutil,difflib,zipfile
root=Path.cwd();out=root/'evidence/surfing-2026-10-24/T5b-negatives';copy=out/'rollback-copy';files=['src/main/surfing-requests.ts','tests/surfing-requests.test.ts','tests/e2e/surfing.spec.ts','docs/WAVE_A_STATE.json','docs/SURFING_OVERNIGHT_2026-10-24.md','docs/acceptance/surfing-overnight-2026-10-24.md'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
copy.mkdir(exist_ok=True);shutil.copytree(root/'src/shared',copy/'src/shared',dirs_exist_ok=True);(copy/'tests').mkdir(exist_ok=True);diff=[];original=[];final=[]
with zipfile.ZipFile(out/'SOURCE_SNAPSHOT.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in files:
  z.write(root/f,f);p=out/'originals'/Path(f).name;original.append(f'{sha(p)}  {f}');final.append(f'{sha(root/f)}  {f}');dest=copy/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/f,dest);dest=copy/'originals'/Path(f).name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);diff.extend(difflib.unified_diff(p.read_text(encoding='utf-8').splitlines(True),(root/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f))
(out/'DIFF_FILE.patch').write_text(''.join(diff),encoding='utf-8',newline='\n')
for folder in [out,copy]:
 (folder/'ORIGINAL_FILES.sha256').write_text('\n'.join(original)+'\n',encoding='utf-8',newline='\n');(folder/'FINAL_FILES.sha256').write_text('\n'.join(final)+'\n',encoding='utf-8',newline='\n')
(copy/'.surfing-rollback-copy').write_text('isolated T5b error-prefix rollback fixture\n');(copy/'vitest.config.mts').write_text("export default {test:{include:['tests/*.test.ts']}};\n",encoding='utf-8')
commands=[f'cp -- "originals/{Path(f).name}" "{f}"' for f in files]
(out/'ROLLBACK.sh').write_text('''#!/usr/bin/env bash
set -euo pipefail
root="${1:?usage: ROLLBACK.sh ISOLATED_SOURCE_COPY}"
root="$(cd "$root" && pwd -P)"
[[ -f "$root/.surfing-rollback-copy" ]] || exit 2
cd "$root"
sha256sum -c FINAL_FILES.sha256 >/dev/null
'''+ '\n'.join(commands)+'''
sha256sum -c ORIGINAL_FILES.sha256 >/dev/null
echo 'ROLLBACK PASS: six original source/doc hashes restored; live error-prefix fix and candidate retained.'
''',encoding='utf-8',newline='\n')
(copy/'tests/rollback-prefix.test.ts').write_text('''import {it,expect} from 'vitest';
import {SurfingRequests} from '../src/main/surfing-requests';
it('restored baseline maps decorated source error to AI_FAILED and never sends data',async()=>{const context={documentId:'doc',fingerprint:'hash',revision:1},events:any[]=[];let sent=0;const service=new SurfingRequests({getContext:()=>context,load:async()=>{throw Error('SOURCE_CHANGED: fixture-private-path');},profile:()=>({profile:{id:'local',name:'local',protocol:'openai-chat',endpoint:'http://localhost/v1',model:'gpt-4o-mini',maxOutputTokens:100,timeoutMs:1000,parameters:{}},contextWindowTokens:1000}),measureInputTokens:()=>0,generate:async()=>{sent++;return '';},emit:e=>events.push(e)});await service.start({requestId:'r',profileId:'local',context,consent:true});expect(events).toEqual([{requestId:'r',type:'error',code:'AI_FAILED'}]);expect(sent).toBe(0);expect(JSON.stringify(events)).not.toContain('fixture-private');});
''',encoding='utf-8')
print('T5b source evidence staged:',len(files),'modified files; rollback fixture has explicit original-behavior test.')
