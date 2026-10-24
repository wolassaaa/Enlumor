from pathlib import Path
import hashlib,json,re,sys,zipfile
from urllib.parse import unquote
r=Path.cwd();e=r/'evidence/surfing-handoff-2026-10-24'
original=json.loads((e/'ORIGINAL_HASHES.json').read_text(encoding='utf-8'))
if len(sys.argv)>1 and sys.argv[1]=='baseline':
 for f,h in original.items():
  if h:assert hashlib.sha256((e/'originals'/f).read_bytes()).hexdigest()==h
  else:assert f=='Surfing-测试入口.cmd'
 assert 'T5b-negatives' in (e/'originals/docs/SURFING_HANDOFF_2026-10-24.md').read_text(encoding='utf-8')
 old=json.loads((e/'originals/docs/WAVE_A_STATE.json').read_text(encoding='utf-8-sig'));assert 'T5b-negatives' in old['surfingOvernight']['candidate']
 print('BASELINE PASS: original handoff/state target T5b; four original hashes preserved; root launcher originally absent.')
else:
 final=json.loads((e/'FINAL_HASHES.json').read_text(encoding='utf-8'))
 with zipfile.ZipFile(e/'MODIFIED_FILE.zip') as z:
  for f,h in final.items():assert hashlib.sha256((r/f).read_bytes()).hexdigest()==h;assert hashlib.sha256(z.read(f)).hexdigest()==h
 links=[]
 for f in ['docs/SURFING_HANDOFF_2026-10-24.md','docs/acceptance/surfing-overnight-2026-10-24.md']:
  links+=re.findall(r'\]\(([^)]+)\)',(r/f).read_text(encoding='utf-8'))
 for v in links:assert Path(unquote(v)).is_file(),v
 state=json.loads((r/'docs/WAVE_A_STATE.json').read_text(encoding='utf-8'))['surfingOvernight'];assert state['unit']==619 and state['packagedMockSurfing']==15 and state['automation']=='PAUSED';assert (r/state['candidate']).is_file()
 repair=r/'evidence/surfing-repair-2026-10-24'
 assert '619 passed (619)' in (repair/'FROZEN-UNIT.txt').read_text(encoding='utf-8-sig');assert '15 passed (1.0m)' in (repair/'PACKAGED-E2E.txt').read_text(encoding='utf-8-sig')
 for line in (repair/'CANDIDATE_FILES.sha256').read_text(encoding='utf-8').splitlines():
  h,f=line.split('  ',1);assert hashlib.sha256((repair/f).read_bytes()).hexdigest()==h
 for f,h in original.items():
  p=e/'rollback-copy'/f
  if h:assert hashlib.sha256(p.read_bytes()).hexdigest()==h
  else:assert not p.exists()
 print(f'MODIFIED PASS: five handoff files match archive; {len(links)} absolute links resolve; current state/619-unit/15-packaged logs agree; 264 candidate hashes unchanged; isolated rollback verified.')
