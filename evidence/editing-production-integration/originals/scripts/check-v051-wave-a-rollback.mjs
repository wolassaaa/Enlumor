import {build} from 'esbuild';
import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';
import {_electron as electron,expect} from '@playwright/test';
import {mkdirSync,mkdtempSync,cpSync,copyFileSync,readFileSync,unlinkSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {copyAssets} from './assets.mjs';
const root=path.resolve('.'),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const originals=JSON.parse(readFileSync('evidence/v051-wave-a/originals.json','utf8'));
const changed=execFileSync('git',['diff','--name-status','7b87bdb','--','src'],{encoding:'utf8',windowsHide:true}).trim().split('\n').filter(Boolean).map(line=>line.split('\t'));
for(const [status,file]of changed){if(status==='M'&&!originals.some(o=>o.target===file))throw Error('Missing original: '+file);if(!['M','A'].includes(status))throw Error('Unsupported source change: '+status);}
const live=originals.map(o=>hash(o.target));const base=path.join(root,'.cache/v051-wave-a-rollback');mkdirSync(base,{recursive:true});const copy=mkdtempSync(path.join(base,'run-'));if(!copy.startsWith(base+path.sep))throw Error('Bad copy target');
cpSync('src',path.join(copy,'src'),{recursive:true});cpSync('python',path.join(copy,'python'),{recursive:true});for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
for(const o of originals){if(hash(o.source)!==o.sha256)throw Error('Original hash mismatch');const dest=path.resolve(copy,o.target);if(!dest.startsWith(copy+path.sep))throw Error('Bad original target');mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(o.source,dest);if(hash(dest)!==o.sha256)throw Error('Restored hash mismatch');}
for(const [status,file]of changed)if(status==='A'){const dest=path.resolve(copy,file);if(!dest.startsWith(path.join(copy,'src')+path.sep))throw Error('Bad added source');if(existsSync(dest))unlinkSync(dest);}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const pdf=path.join(copy,'rollback.pdf');execFileSync(path.join(root,'.venv/Scripts/python.exe'),['-c','import pymupdf as f;d=f.open();p=d.new_page();p.insert_text((60,100),"Original source before follow-up");d.save('+JSON.stringify(pdf)+')']);
const app=await electron.launch({args:[copy,'--user-data-dir='+path.join(copy,'profile')],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{await app.evaluate(({dialog},pdf)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[pdf]});},pdf);const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await page.getByRole('button',{name:'打开 Cruise',exact:true}).click();await page.getByRole('button',{name:'开始 Cruise',exact:true}).click();await expect(page.getByLabel('Cruise 原文',{exact:true})).toContainText('Original source');await expect(page.getByLabel('当前原文追问',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Cruise 推进模式',{exact:true})).toHaveCount(0);if(originals.some((o,i)=>hash(o.target)!==live[i]))throw Error('Live source changed');console.log('ROLLBACK: SOURCE_COVERAGE=PASS; ORIGINAL_HASHES=PASS; PDF_READ=PASS; FOLLOWUP_ABSENT=YES; MANUAL_RETAINED=YES; LIVE_SOURCE_UNCHANGED=YES');}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
