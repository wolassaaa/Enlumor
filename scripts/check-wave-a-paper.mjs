import {_electron as electron,expect} from '@playwright/test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),source=path.resolve(process.argv[2]||'');if(!process.argv[2]||path.extname(source).toLowerCase()!=='.pdf')throw Error('Pass explicit PDF path');
const sha=()=>createHash('sha256').update(readFileSync(source)).digest('hex'),before=sha(),profile=mkdtempSync(path.join(tmpdir(),'enlumor-real-paper-'));
mkdirSync('evidence/v04-wave-a',{recursive:true});
const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+profile],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
try{
 await app.evaluate(({session,dialog},source)=>{globalThis.__wavePaperRequests=[];session.defaultSession.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(details,callback)=>{globalThis.__wavePaperRequests.push(details.url);callback({cancel:true});});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await page.getByRole('button',{name:'打开 Cruise',exact:true}).click();await page.getByRole('button',{name:'开始 Cruise',exact:true}).click();await expect(page.getByLabel('Cruise 原文',{exact:true})).toBeVisible();await expect(page.getByLabel('Cruise 保存状态',{exact:true})).toHaveText('已保存');
 await page.getByRole('button',{name:'返回当前原文',exact:true}).click();await expect(page.locator('.flash')).toHaveCount(1);
 const state=await page.evaluate(async()=>{const docs=await window.enlumor.listDocuments();if(!docs.ok||docs.value.length!==1)throw Error('Document missing');const doc=docs.value[0],session=await window.enlumor.getCruiseSession(doc.id);if(!session.ok||!session.value?.block)throw Error('Block missing');return{doc,session:session.value};});
 const verified=JSON.parse(execFileSync(path.join(root,'.venv/Scripts/python.exe'),['python/export_pdf.py'],{input:JSON.stringify({operation:'verify-block',source,fingerprint:before,block:state.session.block}),encoding:'utf8',windowsHide:true}));if(!verified.ok||!verified.value.verified)throw Error('Real anchor not verified');
 if(state.session.mode!=='manual')throw Error('Unexpected automatic mode');
 const requests=await app.evaluate(()=>globalThis.__wavePaperRequests);if(requests.length)throw Error('Unexpected remote request');if(sha()!==before)throw Error('Source modified');
 await page.screenshot({path:'evidence/v04-wave-a/real-paper-reader.png'});
 writeFileSync('evidence/v04-wave-a/REAL_PAPER_READER.json',JSON.stringify({source,sha256:before,pages:state.doc.pageCount,firstBlock:state.session.block,verification:verified.value,remoteRequests:0,remoteApi:'NOT_EXECUTED',sourceUnchanged:true},null,2));
 console.log('REAL_PAPER_LOCAL: PDF_READ=PASS; ANCHOR_VERIFIED=PASS; MANUAL=PASS; REMOTE_REQUESTS=0; SOURCE_UNCHANGED=YES; LIVE_API=NOT_EXECUTED');
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
