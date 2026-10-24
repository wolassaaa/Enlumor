// Visual review only (not a gate): screenshots of key states in an isolated temp profile.
// Usage: node scripts/ui-shots.mjs <outDir> <pdf>
import {_electron as electron} from '@playwright/test';
import {mkdtempSync,mkdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const [out,pdfIn]=process.argv.slice(2);if(!out||!pdfIn)throw Error('usage: ui-shots.mjs <outDir> <pdf>');
mkdirSync(out,{recursive:true});
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-shots-')),pdf=path.join(folder,path.basename(pdfIn));copyFileSync(pdfIn,pdf);
const app=await electron.launch({args:[root,'--user-data-dir='+path.join(folder,'profile')],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
const size=(w,h)=>app.evaluate(({BrowserWindow},[w,h])=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(w,h);win.center();},[w,h]);
try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 for(const [w,h,tag] of [[1440,900,'1440'],[1100,760,'1100']]){
  await size(w,h);await page.waitForTimeout(400);
  if(tag==='1440'){await page.screenshot({path:path.join(out,`01-empty-${tag}.png`)});
   await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},pdf);
   await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await page.locator('.textLayer span').first().waitFor();
   await page.evaluate(async()=>{const d=(await window.enlumor.listDocuments()).value[0];const q=[[72,700,520,700,72,688,520,688]];await window.enlumor.applyAnnotationChange({documentId:d.id,upserts:[
    {id:'shot-1',documentId:d.id,fingerprint:d.fingerprint,pageIndex:0,type:'highlight',author:'user',color:'#f3ca8d',quote:'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.',note:'核心对比对象：RNN / CNN',quads:q},
    {id:'shot-2',documentId:d.id,fingerprint:d.fingerprint,pageIndex:0,type:'underline',author:'user',color:'#3969da',quote:'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',note:'',quads:[[72,660,520,660,72,648,520,648]]},
    {id:'shot-3',documentId:d.id,fingerprint:d.fingerprint,pageIndex:1,type:'note',author:'user',color:'#f3ca8d',quote:'',note:'回头对照 Figure 1 的编码器/解码器结构。',quads:[[400,600,420,600,400,580,420,580]]}],deletes:[]});});
   await page.locator('.recent>button').first().click();await page.waitForTimeout(800);}
  await page.screenshot({path:path.join(out,`02-reader-${tag}.png`)});
  const surf=page.getByRole('button',{name:'打开 Surfing'}).first();
  if(await surf.count()){await surf.click();await page.waitForTimeout(600);await page.screenshot({path:path.join(out,`03-surfing-${tag}.png`)});await surf.click().catch(()=>{});await page.waitForTimeout(300);}
  if(tag==='1440'){const cruise=page.getByRole('button',{name:'打开 Cruise'}).first();if(await cruise.count()){await cruise.click();await page.waitForTimeout(500);await page.screenshot({path:path.join(out,`04-cruise-${tag}.png`)});await page.getByRole('button',{name:'退出',exact:true}).first().click().catch(()=>{});await page.waitForTimeout(300);}
   const settings=page.getByRole('button',{name:'模型设置'}).first();if(await settings.count()){await settings.click();await page.waitForTimeout(500);await page.screenshot({path:path.join(out,`05-settings-${tag}.png`)});await page.keyboard.press('Escape');await page.waitForTimeout(300);}}
 }
 console.log('SHOTS '+out);
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
