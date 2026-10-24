import {build} from 'esbuild';
import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';
import {_electron as electron,expect} from '@playwright/test';
import {cpSync,copyFileSync,mkdirSync,mkdtempSync,readFileSync,unlinkSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import {copyAssets} from './assets.mjs';

const root=path.resolve('.'),sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const read=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const originals=read('evidence/document-command-task2/ORIGINALS.json');
const tests=read('evidence/document-command-task2/BASELINE_TESTS.json');
const changed=execFileSync('git',['diff','--name-status','1e456c2','--','src'],{encoding:'utf8',windowsHide:true}).trim().split('\n').filter(Boolean).map(line=>line.split('\t'));
for(const [status,file] of changed){if(!['M','A'].includes(status))throw Error('Unsupported source delta '+status);if(status==='M'&&!originals.some(item=>item.target===file))throw Error('Missing original '+file);}
const live=Array.from(new Set([...originals.map(item=>item.target),...changed.filter(([s])=>s==='A').map(([,f])=>f)])).map(file=>({file,sha256:sha(file)}));
const base=path.join(root,'.cache/document-command-task2-rollback');mkdirSync(base,{recursive:true});
const copy=mkdtempSync(path.join(base,'run-'));
const target=file=>{const result=path.resolve(copy,file);if(!result.startsWith(copy+path.sep))throw Error('Invalid rollback path');return result;};
cpSync('src',target('src'),{recursive:true});cpSync('python',target('python'),{recursive:true});
for(const file of ['package.json','index.html','vitest.config.mts'])copyFileSync(file,target(file));
for(const item of [...originals,...tests]){if(sha(item.snapshot)!==item.sha256)throw Error('Bad snapshot '+item.target);const file=target(item.target);mkdirSync(path.dirname(file),{recursive:true});copyFileSync(item.snapshot,file);if(sha(file)!==item.sha256)throw Error('Restore mismatch');}
for(const [status,file] of changed)if(status==='A'){const added=target(file);if(!added.startsWith(target('src')+path.sep))throw Error('Invalid added source');if(existsSync(added))unlinkSync(added);}
const unit=spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','--root',copy,'tests/document-commands.test.ts','tests/reading-commands.test.ts'],{cwd:root,encoding:'utf8',windowsHide:true});
process.stdout.write(unit.stdout||'');process.stderr.write(unit.stderr||'');if(unit.error||unit.status!==0)throw Error('Restored baseline unit failed');
await build({entryPoints:[target('src/main/index.ts'),target('src/main/preload.ts')],outdir:target('dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:target('dist/renderer')}});copyAssets(target('dist/renderer/pdf-assets'));
const source=target('rollback.pdf');execFileSync(path.join(root,'.venv/Scripts/python.exe'),['-c','import pymupdf as f;d=f.open()\nfor n in range(3):\n p=d.new_page();p.insert_text((60,100),"Rollback baseline page "+str(n+1))\nd.save('+JSON.stringify(source)+')'],{windowsHide:true});
const sourceHash=sha(source);
const app=await electron.launch({args:[copy,'--user-data-dir='+target('profile')],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await page.getByLabel('跳转页码',{exact:true}).fill('3');await page.getByLabel('跳转页码',{exact:true}).press('Enter');await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue('3');
 await page.getByRole('button',{name:'读取本页阅读块',exact:true}).click();await expect(page.getByLabel('本页阅读块',{exact:true})).toContainText('Rollback baseline page 3');
 if(sha(source)!==sourceHash||live.some(item=>sha(item.file)!==item.sha256))throw Error('Source changed');
 console.log('ROLLBACK: ALL_ORIGINAL_HASHES=PASS; TASK1_EXECUTOR_TESTS=PASS; BASELINE_PDF_PAGE3=PASS; BASELINE_READ_BLOCKS=PASS; PDF_UNCHANGED=YES; LIVE_MODIFIED_SOURCES_UNCHANGED=YES');
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
