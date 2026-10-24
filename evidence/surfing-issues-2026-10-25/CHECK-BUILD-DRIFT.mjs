import {extractFile} from '@electron/asar';import {readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const e='evidence/surfing-issues-2026-10-25',repair='evidence/surfing-repair-2026-10-24';const hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(readFileSync(repair+'/FINAL_HASHES.json','utf8'));for(const [f,h]of Object.entries(m))if(hash(readFileSync(f))!==h)throw Error('SOURCE_CHANGED '+f);
const packed=extractFile(path.resolve(repair+'/MODIFIED_FILE/win-unpacked/resources/app.asar'),path.join('dist','main','index.cjs'));
const d={recordedDate:'2026-10-25',source14HashesMatchRepair:true,packagedMainSha256:hash(packed),currentDistMainSha256:hash(readFileSync('dist/main/index.cjs')),interpretation:'Packaged repair unchanged, but current dist does not match that repair. No actor/cause inferred. Do not use old bundle equality assertion as fresh proof; no rebuild done in documentation task.'};
writeFileSync(e+'/BUILD-DRIFT.json',JSON.stringify(d,null,2));console.log(JSON.stringify(d));
