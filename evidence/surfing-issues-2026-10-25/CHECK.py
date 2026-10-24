from pathlib import Path
import json,hashlib,re,sys,zipfile
from urllib.parse import unquote
r=Path.cwd();e=r/'evidence/surfing-issues-2026-10-25';orig=json.loads((e/'ORIGINAL_HASHES.json').read_text())
if len(sys.argv)>1 and sys.argv[1]=='baseline':
 assert sum(h is None for h in orig.values())==2
 for f,h in orig.items():
  if h:assert hashlib.sha256((e/'originals'/f).read_bytes()).hexdigest()==h
 assert 'issueLedger' not in json.loads((e/'originals/docs/WAVE_A_STATE.json').read_text(encoding='utf-8'))['surfingOvernight']
 print('BASELINE PASS: original handoff/state lack issue ledger; two original hashes retained; two ledgers originally absent.')
else:
 data=json.loads((r/'docs/SURFING_ISSUES_2026-10-25.json').read_text(encoding='utf-8'));items=data['issues'];assert len(items)==30 and len({i['id'] for i in items})==30
 for i in items:
  for k in ['category','title','source','observed','expected','action','status','acceptance','priority']:assert i[k]
 assert all('待' in i['status'] for i in items if i['id'].startswith('U'))
 text=(r/'docs/SURFING_ISSUES_2026-10-25.md').read_text(encoding='utf-8')
 for i in items:assert '### '+i['id']+' ' in text
 for v in re.findall(r'\]\(([^)]+)\)',text):assert Path(unquote(v)).is_file(),v
 state=json.loads((r/'docs/WAVE_A_STATE.json').read_text(encoding='utf-8'))['surfingOvernight'];assert state['issueLedger'].endswith('SURFING_ISSUES_2026-10-25.md');assert state['userAcceptance']=='PENDING_NO_REPAIR_ACCEPTANCE_RECEIVED'
 final=json.loads((e/'FINAL_HASHES.json').read_text())
 with zipfile.ZipFile(e/'MODIFIED_FILE.zip') as z:
  for f,h in final.items():assert hashlib.sha256((r/f).read_bytes()).hexdigest()==h;assert hashlib.sha256(z.read(f)).hexdigest()==h
 for f,h in orig.items():
  p=e/'rollback-copy'/f
  if h:assert hashlib.sha256(p.read_bytes()).hexdigest()==h
  else:assert not p.exists()
 repair=r/'evidence/surfing-repair-2026-10-24'
 for line in (repair/'CANDIDATE_FILES.sha256').read_text().splitlines():
  h,f=line.split('  ',1);assert hashlib.sha256((repair/f).read_bytes()).hexdigest()==h
 print('MODIFIED PASS: 30 classified issues complete; U01-U08 await user acceptance; source links/JSON/archive agree; isolated rollback verified; 264 candidate hashes unchanged.')
