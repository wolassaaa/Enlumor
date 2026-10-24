import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import {build} from 'esbuild';
import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';
import {_electron as electron,expect} from '@playwright/test';
import {copyAssets} from './assets.mjs';

const root=path.resolve(import.meta.dirname,'..'),baseline='6ca3fd9f1186f5dbb2d4dd194c4838f271c19845';
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const git=args=>execFileSync('git',args,{cwd:root,windowsHide:true,encoding:'utf8'});
const originals=JSON.parse(readFileSync(path.join(root,'evidence/editing-production-integration/ORIGINALS.json'),'utf8').replace(/^\uFEFF/,''));
const livePaths=git(['ls-files','--','src','tests','python','scripts','package.json','package-lock.json']).trim().split(/\r?\n/).filter(Boolean);
const live=livePaths.map(file=>({file,hash:sha(path.join(root,file))}));
const base=path.join(root,'.cache/editing-production-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-')),zip=path.join(copy,'baseline.zip');
git(['archive','--format=zip','--output='+zip,baseline,'--','src','tests','python','scripts','package.json','package-lock.json','index.html','tsconfig.json','vitest.config.mts','vite.config.ts','playwright.config.ts']);
const tar=process.platform==='win32'?path.join(process.env.SystemRoot||'C:/Windows','System32/tar.exe'):'tar';
execFileSync(tar,['-xf',zip,'-C',copy],{windowsHide:true});
for(const x of originals){const snapshot=path.join(root,x.snapshot),target=path.join(copy,x.path);if(sha(snapshot)!==x.sha256)throw Error('Bad snapshot '+x.path);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(snapshot,target);if(sha(target)!==x.sha256)throw Error('Bad restore '+x.path);}
if(existsSync(path.join(copy,'src/main/editing-workspace.ts'))||existsSync(path.join(copy,'src/main/editing-ipc.ts')))throw Error('New integration remained in rollback');
const unit=spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','--root',copy],{cwd:root,windowsHide:true,encoding:'utf8'});
process.stdout.write(unit.stdout||'');process.stderr.write(unit.stderr||'');if(unit.error||unit.status!==0)throw Error('Restored unit failed '+unit.status);
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});
copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const source=path.join(copy,'rollback-source.pdf'),python=path.join(root,'.venv/Scripts/python.exe');
execFileSync(python,['-c','import pymupdf as f;d=f.open()\nfor n in range(3):\n p=d.new_page();p.insert_text((60,100),"Baseline restored page "+str(n+1))\nd.save('+JSON.stringify(source)+')'],{windowsHide:true});
const pdfHash=sha(source);
const app=await electron.launch({args:[copy,'--user-data-dir='+path.join(copy,'profile')],env:{...process.env,ENLUMOR_PYTHON:python}});
try{
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 const input=page.getByLabel('跳转页码',{exact:true});await input.fill('3');await input.press('Enter');await expect(input).toHaveValue('3');
 await page.getByRole('button',{name:'读取本页阅读块',exact:true}).click();await expect(page.getByLabel('本页阅读块',{exact:true})).toContainText('Baseline restored page 3');
 if(sha(source)!==pdfHash||live.some(x=>sha(path.join(root,x.file))!==x.hash))throw Error('Live source or PDF changed');
 console.log('ROLLBACK: ORIGINAL_HASHES='+originals.length+'/'+originals.length+'; BASELINE_416_TESTS=PASS; V4_PDF_PAGE3=PASS; V4_READ_BLOCKS=PASS; PDF_UNCHANGED=YES; LIVE_MODIFIED_FILES_UNCHANGED=YES');
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
