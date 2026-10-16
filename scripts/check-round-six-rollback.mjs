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
const live=sha('src/renderer/main.tsx')+sha('src/renderer/pdf-reader.ts')+sha('src/renderer/style.css');
const base=path.join(root,'.cache/round-six-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-'));
if(!copy.startsWith(base+path.sep))throw Error('Unexpected rollback target');
cpSync('src',path.join(copy,'src'),{recursive:true});
cpSync('python',path.join(copy,'python'),{recursive:true});
for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
const originals=JSON.parse(readFileSync('evidence/round-six/originals.json','utf8'));
for(const {name,target,sha256} of originals){const file=path.join(root,'evidence/round-six/originals',name),destination=path.resolve(copy,target);if(!destination.startsWith(copy+path.sep))throw Error('Unexpected original target');if(sha(file)!==sha256)throw Error('Original hash mismatch');mkdirSync(path.dirname(destination),{recursive:true});copyFileSync(file,destination);}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});
copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const app=await electron.launch({args:[copy,`--user-data-dir=${path.join(copy,'profile')}`],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 const page=await app.firstWindow(),source=path.join(root,'.cache/benchmark/200-pages-32MiB.pdf');
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 const box=await page.locator('.page[data-page-number="1"]').boundingBox();
 for(const y of [160,220]){await page.getByRole('button',{name:'绘制画笔',exact:true}).click();await page.mouse.move(box.x+80,box.y+y);await page.mouse.down();await page.mouse.move(box.x+220,box.y+y);await page.mouse.up();await expect(page.locator('.statusbar [role="status"]')).toContainText('已保存');}
 const retained=await page.locator('.drawn-ink').first().elementHandle();
 await page.locator('.annotation-card').last().getByRole('button',{name:'应用颜色',exact:true}).click();await expect.poll(()=>retained.evaluate(n=>n.isConnected)).toBe(false);
 const visibility=await page.locator('.annotation-card').first().evaluate(n=>getComputedStyle(n).contentVisibility);if(visibility!=='visible')throw Error('Original card visibility not restored');
 if(sha('src/renderer/main.tsx')+sha('src/renderer/pdf-reader.ts')+sha('src/renderer/style.css')!==live)throw Error('Live source changed');
 console.log('ROLLBACK: UNCHANGED_SVG_RECREATED=YES; CARD_CONTENT_VISIBILITY=visible; LIVE_SOURCE_UNCHANGED=YES');
}finally{await app.close();}
