import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, cpSync, copyFileSync, readFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { copyAssets } from './assets.mjs';
const root=path.resolve('.');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const live=sha('src/renderer/main.tsx')+sha('src/renderer/pdf-reader.ts')+sha('src/renderer/style.css');
const base=path.join(root,'.cache/cruise-control-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-'));
if(!copy.startsWith(base+path.sep))throw Error('Unexpected rollback target');
cpSync('src',path.join(copy,'src'),{recursive:true});
cpSync('python',path.join(copy,'python'),{recursive:true});
for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
const originals=JSON.parse(readFileSync('evidence/cruise-control/originals.json','utf8'));
for(const {name,target,sha256} of originals){const file=path.join(root,'evidence/cruise-control/originals',name),destination=path.resolve(copy,target);if(!destination.startsWith(copy+path.sep))throw Error('Unexpected original target');if(sha(file)!==sha256)throw Error('Original hash mismatch');mkdirSync(path.dirname(destination),{recursive:true});copyFileSync(file,destination);}
for(const target of ['src/renderer/CruisePanel.tsx','src/main/cruise-requests.ts']){const file=path.resolve(copy,target);if(!file.startsWith(copy+path.sep))throw Error('Unexpected added file');unlinkSync(file);}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});
copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const app=await electron.launch({args:[copy,`--user-data-dir=${path.join(copy,'profile')}`],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 const page=await app.firstWindow(),source=path.join(root,'.cache/benchmark/200-pages-32MiB.pdf');
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'模型设置',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'读取本页阅读块',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'打开 Cruise',exact:true})).toHaveCount(0);
 const db=new DatabaseSync(path.join(copy,'profile/workspace.sqlite'),{readOnly:true});try{if(Number(db.prepare('PRAGMA user_version').get().user_version)!==3)throw Error('Original schema not restored');}finally{db.close();}
 if(sha('src/renderer/main.tsx')+sha('src/renderer/pdf-reader.ts')+sha('src/renderer/style.css')!==live)throw Error('Live source changed');
 console.log('ROLLBACK: CRUISE=0; READ_BLOCKS=1; SCHEMA=3; LIVE_SOURCE_UNCHANGED=YES');
}finally{await app.close();}
