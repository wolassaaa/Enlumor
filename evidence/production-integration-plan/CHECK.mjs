import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
const here=import.meta.dirname,root=path.resolve(here,'../..');
const plan=path.join(root,'docs/superpowers/plans/2026-10-20-editing-production-integration.md');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const hashes=json(path.join(here,'PRODUCT_HASHES.json'));
function unchanged(){for(const x of hashes)if(sha(path.join(root,x.path))!==x.sha256)throw Error('Product changed: '+x.path);}
unchanged();
if(process.argv[2]==='rollback'){
 const base=path.join(root,'.cache/production-integration-plan-rollback');mkdirSync(base,{recursive:true});
 const copy=mkdtempSync(path.join(base,'run-')),target=path.join(copy,'plan.md');
 copyFileSync(plan,target);if(sha(plan)!==sha(target))throw Error('Plan copy mismatch');
 unlinkSync(target);
 for(const [name,live] of [['WAVE_A_STATE.json','docs/WAVE_A_STATE.json'],['WAVE_A_TASKS.md','docs/WAVE_A_TASKS.md'],['2026-10-20-editing-production-integration-design.md','docs/superpowers/specs/2026-10-20-editing-production-integration-design.md']]){
  const destination=path.join(copy,name),original=path.join(here,'originals',name);
  copyFileSync(path.join(root,live),destination);copyFileSync(original,destination);
  if(sha(destination)!==sha(original))throw Error('Original not restored: '+name);
 }
 if(existsSync(target))throw Error('Plan survived rollback');unchanged();
 console.log('ROLLBACK: ORIGINAL_DOCS=3/3; PLAN_ABSENT_IN_COPY=YES; LIVE_PLAN_RETAINED=YES; PRODUCT_HASHES='+hashes.length+'/'+hashes.length);
}else{
 const text=readFileSync(plan,'utf8'),tasks=text.match(/^### Task [12]:/gm)||[];
 const focus=text.split('## Review Focus')[1]?.split('## 文件与职责')[0]||'';
 if(tasks.length!==2||(focus.match(/^[1-5]\. /gm)||[]).length!==5)throw Error('Task/review focus structure');
 for(const term of ['openEditingWorkspace','prepareEditingPage','getEditingCapabilities','EditingController(','BACKUP_STALE','VACUUM INTO','readingSave.p95','--editing-preview','receipt','Task1','Task2'])if(!text.includes(term))throw Error('Missing plan contract: '+term);
 const state=json(path.join(root,'docs/WAVE_A_STATE.json')).productionIntegration;
 if(state.implemented!==false||state.userReviewed!==true||state.planReviewed!==false)throw Error('Wrong stage approval');
 console.log('MODIFIED: TASKS=2/2; REVIEW_FOCUS=5/5; PRODUCT_HASHES='+hashes.length+'/'+hashes.length+'; SPEC_APPROVED=true; PLAN_REVIEW_PENDING=true; IMPLEMENTED=false');
}
