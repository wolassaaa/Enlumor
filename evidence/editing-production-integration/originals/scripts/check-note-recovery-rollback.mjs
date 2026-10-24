import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, cpSync, copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { copyAssets } from './assets.mjs';
const root=path.resolve('.');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const live=sha('src/renderer/main.tsx');
const base=path.join(root,'.cache/note-recovery-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-'));
if(!copy.startsWith(base+path.sep))throw Error('Unexpected rollback target');
cpSync('src',path.join(copy,'src'),{recursive:true});
cpSync('python',path.join(copy,'python'),{recursive:true});
for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
const originals=JSON.parse(readFileSync('evidence/note-recovery/originals.json','utf8'));
for(const {name,target,sha256} of originals){const file=path.join(root,'evidence/note-recovery/originals',name);if(sha(file)!==sha256)throw Error('Original hash mismatch');copyFileSync(file,path.join(copy,target));}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});
copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const app=await electron.launch({args:[copy,`--user-data-dir=${path.join(copy,'profile')}`],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 const page=await app.firstWindow(),source=path.join(root,'.cache/benchmark/200-pages-32MiB.pdf');
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await page.locator('.textLayer span').first().evaluate(item=>{const r=document.createRange();r.selectNodeContents(item);const s=getSelection();s.removeAllRanges();s.addRange(r);document.querySelector('#viewerContainer').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByLabel('便签内容').fill('rollback fixture');await page.keyboard.press('Shift+Tab');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 if(await page.evaluate(()=>!!document.activeElement.closest('.note-modal')))throw Error('Expected prior focus behavior');
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'绘制箭头',exact:true})).toHaveCount(1);
 if(sha('src/renderer/main.tsx')!==live)throw Error('Live source changed');
 console.log('ROLLBACK: NATIVE_DIALOG=0; NOTE_FOCUS_ESCAPES=YES; DRAW_ARROW=1; LIVE_SOURCE_UNCHANGED=YES');
}finally{await app.close();}
