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
const base=path.join(root,'.cache/thumbnail-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-'));
if(!copy.startsWith(base+path.sep))throw Error('Unexpected rollback target');
cpSync('src',path.join(copy,'src'),{recursive:true});
cpSync('python',path.join(copy,'python'),{recursive:true});
for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
const originals=[['original-main.tsx','main.tsx','b5262bd3876821477a2a95e1df54f765a78630089f953f8695a10d8f3c60f2c6'],['original-pdf-reader.ts','pdf-reader.ts','3403a3306517bd7fa507bea470485210068c002ab2e091361d2d7c248e05ace2'],['original-style.css','style.css','db36b9bded8bbbb68305e82b0fc78e23cceedc4aa201dc43aafdcf2b468f6af9']];
for(const [original,target,expected] of originals){const file=path.join(root,'evidence/thumbnails',original);if(sha(file)!==expected)throw Error('Original hash mismatch');copyFileSync(file,path.join(copy,'src/renderer',target));}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});
copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const app=await electron.launch({args:[copy,`--user-data-dir=${path.join(copy,'profile')}`],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 const page=await app.firstWindow();
 const source=path.join(root,'.cache/benchmark/200-pages-32MiB.pdf');
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();
 await expect(page.locator('.textLayer span').first()).toBeVisible();
 await expect(page.getByRole('tab',{name:'缩略图',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'目录',exact:true}).click();
 await page.getByRole('button',{name:'Part Two',exact:true}).click();
 await expect(page.getByLabel('跳转页码')).toHaveValue('101');
 if(sha('src/renderer/main.tsx')!==live)throw Error('Live source changed');
 console.log('ROLLBACK: THUMBNAIL_TAB=0; OUTLINE_PAGE=101; LIVE_SOURCE_UNCHANGED=YES');
}finally{await app.close();}
