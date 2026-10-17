import {build} from 'esbuild';
import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';
import {_electron as electron,expect} from '@playwright/test';
import {mkdirSync,mkdtempSync,cpSync,copyFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {copyAssets} from './assets.mjs';
const root=path.resolve('.'),sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const targets=['src/renderer/model-settings.tsx','src/renderer/style.css'],live=targets.map(sha);
const base=path.join(root,'.cache/settings-rollback');mkdirSync(base,{recursive:true});const copy=mkdtempSync(path.join(base,'run-'));
if(!copy.startsWith(base+path.sep))throw Error('Unexpected rollback path');
cpSync('src',path.join(copy,'src'),{recursive:true});for(const file of ['package.json','index.html'])copyFileSync(file,path.join(copy,file));
const originals=JSON.parse(readFileSync('evidence/settings-simplify/originals.json','utf8'));
for(const original of originals){if(sha(original.source)!==original.sha256)throw Error('Original hash mismatch');const target=path.resolve(copy,original.target);if(!target.startsWith(copy+path.sep))throw Error('Unexpected target');copyFileSync(original.source,target);if(sha(target)!==original.sha256)throw Error('Restoration mismatch');}
await build({entryPoints:[path.join(copy,'src/main/index.ts'),path.join(copy,'src/main/preload.ts')],outdir:path.join(copy,'dist/main'),bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['electron']});
await viteBuild({configFile:false,root:copy,plugins:[react()],base:'./',build:{outDir:path.join(copy,'dist/renderer')}});copyAssets(path.join(copy,'dist/renderer/pdf-assets'));
const app=await electron.launch({args:[copy,'--user-data-dir='+path.join(copy,'profile')]});
try{const page=await app.firstWindow();await page.getByRole('button',{name:'模型设置',exact:true}).click();await expect(page.getByLabel('协议',{exact:true})).toBeVisible();await page.getByLabel('厂商预设',{exact:true}).selectOption({label:'DeepSeek'});await expect(page.getByLabel('模型 ID',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.locator('.ai-settings [role="alert"]')).toContainText('AI_INVALID_CONFIG');if(targets.some((f,i)=>sha(f)!==live[i]))throw Error('Live source changed');console.log('ROLLBACK: ORIGINAL_HASHES=PASS; DEEPSEEK_MODEL=EMPTY; ADVANCED_VISIBLE=YES; SAVE=AI_INVALID_CONFIG; LIVE_SOURCE_UNCHANGED=YES');}finally{await app.close();}
