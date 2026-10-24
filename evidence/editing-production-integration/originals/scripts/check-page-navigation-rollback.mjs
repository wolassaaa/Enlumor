import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, cpSync, copyFileSync, readFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { copyAssets } from './assets.mjs';
const root=path.resolve('.');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const live=sha('src/renderer/main.tsx')+sha('src/renderer/eraser-tool.ts');
const base=path.join(root,'.cache/page-navigation-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-'));
if(!copy.startsWith(base+path.sep))throw Error('Unexpected rollback target');
cpSync('src',path.join(copy,'src'),{recursive:true});
cpSync('python',path.join(copy,'python'),{recursive:true});
for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
const originals=JSON.parse(readFileSync('evidence/page-navigation/originals.json','utf8'));
for(const {name,target,sha256} of originals){const file=path.join(root,'evidence/page-navigation/originals',name);if(sha(file)!==sha256)throw Error('Original hash mismatch');copyFileSync(file,path.join(copy,target));}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});
copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const app=await electron.launch({args:[copy,`--user-data-dir=${path.join(copy,'profile')}`],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 const page=await app.firstWindow(),source=path.join(root,'.cache/benchmark/200-pages-32MiB.pdf');
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'上一页',exact:true})).toBeEnabled();
 await expect(page.getByLabel('跳转页码',{exact:true})).not.toHaveAttribute('aria-invalid','false');
 if(sha('src/renderer/main.tsx')+sha('src/renderer/eraser-tool.ts')!==live)throw Error('Live source changed');
 console.log('ROLLBACK: FIRST_PAGE_PREVIOUS_ENABLED=YES; VALIDATION_ATTRIBUTE=ABSENT; LIVE_SOURCE_UNCHANGED=YES');
}finally{await app.close();}
