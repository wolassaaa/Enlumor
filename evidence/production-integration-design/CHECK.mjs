import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync} from 'node:fs';
import path from 'node:path';
const here=import.meta.dirname, root=path.resolve(here,'../..');
const spec=path.join(root,'docs/superpowers/specs/2026-10-20-editing-production-integration-design.md');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const read=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const products=read(path.join(here,'PRODUCT_HASHES.json'));
function unchanged(){for(const p of products)if(sha(path.join(root,p.path))!==p.sha256)throw Error('Product changed: '+p.path);}
unchanged();
if(process.argv[2]==='rollback'){
 const base=path.join(root,'.cache/production-integration-design-rollback');mkdirSync(base,{recursive:true});
 const copy=mkdtempSync(path.join(base,'run-'));
 const candidate=path.join(copy,'design.md');copyFileSync(spec,candidate);
 if(sha(candidate)!==sha(spec))throw Error('Copy mismatch');
 unlinkSync(candidate); // Only this newly created isolated file is removed.
 for(const name of ['WAVE_A_STATE.json','WAVE_A_TASKS.md']){
  const original=path.join(here,'originals',name), target=path.join(copy,name);
  copyFileSync(path.join(root,'docs',name),target);copyFileSync(original,target);
  if(sha(original)!==sha(target))throw Error('Restore mismatch');
 }
 if(existsSync(candidate))throw Error('New design survived rollback');
 unchanged();
 console.log('ROLLBACK: ORIGINAL_DOCS=2/2; SPEC_ABSENT_IN_COPY=YES; LIVE_SPEC_RETAINED=YES; PRODUCT_HASHES='+products.length+'/'+products.length);
}else{
 const text=readFileSync(spec,'utf8');
 const headings=text.match(/^## [1-9]\. /gm)||[];
 const packages=text.match(/^### 工作包[12]：/gm)||[];
 if(headings.length!==9||packages.length!==2)throw Error('Design structure incomplete');
 for(const term of ['可见只读','anchorId','BEGIN IMMEDIATE','SOURCE_CHANGED','COMMIT','UNSUPPORTED','1500ms','34ms','20ms','schema5'])if(!text.includes(term))throw Error('Missing requirement: '+term);
 const state=read(path.join(root,'docs/WAVE_A_STATE.json'));
 if(state.productionIntegration.implemented!==false||state.productionIntegration.userReviewed!==false)throw Error('Unreviewed design treated as implemented/approved');
 console.log('MODIFIED: DESIGN_SECTIONS=9/9; WORK_PACKAGES=2; PRODUCT_HASHES='+products.length+'/'+products.length+'; IMPLEMENTED=false; WRITTEN_SPEC_REVIEW_PENDING=true');
}
