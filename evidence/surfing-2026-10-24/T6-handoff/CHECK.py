from pathlib import Path
import hashlib,json,re
r=Path.cwd(); e=r/'evidence/surfing-2026-10-24/T6-handoff'; b=r/'evidence/surfing-2026-10-24/T5b-negatives'; p=r/'docs/SURFING_HANDOFF_2026-10-24.md'
links=re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf-8'))
for v in links: assert Path(v).is_file(),v
assert p.read_bytes()==(e/'MODIFIED_FILE.md').read_bytes()
runtime=json.loads((r/'evidence/surfing-2026-10-24/T5c-large/BASELINE-RUNTIME-HASHES.json').read_text(encoding='utf-8-sig'))
for x in runtime: assert hashlib.sha256(Path(x['Path']).read_bytes()).hexdigest().upper()==x['Hash']
lines=(b/'CANDIDATE_FILES.sha256').read_text(encoding='utf-8-sig').splitlines()
for line in lines:
 h,v=line.split('  ',1); assert hashlib.sha256((b/v).read_bytes()).hexdigest()==h.lower(),v
checks=[('ALL-UNIT.txt','608 passed (608)','T5c-large'),('RELATED-E2E.txt','20 passed','T5c-large'),('FINAL-LARGE-E2E.txt','2 passed','T5c-large'),('FULL-PACKAGED-E2E.txt','164 passed','T5b-negatives'),('FULL-PACKAGED-E2E.txt','1 failed','T5b-negatives'),('PYTHON.txt','Ran 21 tests','T5b-negatives')]
for f,s,d in checks: assert s in (r/'evidence/surfing-2026-10-24'/d/f).read_text(encoding='utf-8-sig')
assert not (e/'rollback-copy/docs/SURFING_HANDOFF_2026-10-24.md').exists()
print(f'MODIFIED PASS: {len(links)} absolute evidence links exist; handoff copy hash matches; {len(runtime)} runtime and {len(lines)} candidate hashes unchanged; six historical log assertions verified.')
