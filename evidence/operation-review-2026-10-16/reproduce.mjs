import { _electron as electron, expect } from '@playwright/test';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'evidence/operation-review-2026-10-16'),tmp=mkdtempSync(path.join(tmpdir(),'enlumor-operation-review-')),source=path.join(tmp,'Audit.pdf'),python=path.join(root,'.venv/Scripts/python.exe');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence for operation review',fontsize=16);d.new_page(width=480,height=640);d.save(${JSON.stringify(source)})`]);
const app=await electron.launch({executablePath:path.join(root,'release/Enlumor-0.1.8-win-x64/Enlumor.exe'),args:['--user-data-dir='+path.join(tmp,'profile')],env:{...process.env,ENLUMOR_PYTHON:''}});
const results={version:'0.1.8',profile:tmp,source,checks:[]};const record=(name,data)=>{results.checks.push({name,...data});console.log(name+': '+JSON.stringify(data));};
const page=await app.firstWindow();
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function select(){await page.locator('.textLayer span').first().evaluate(item=>{const r=document.createRange();r.selectNodeContents(item);const s=getSelection();s.removeAllRanges();s.addRange(r);document.querySelector('#viewerContainer').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});}
async function marks(){return page.evaluate(async()=>{const docs=await window.enlumor.listDocuments();const a=await window.enlumor.getAnnotations(docs.value[0].id);return a.value;});}
try{
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});dialog.showMessageBox=async()=>({response:0});},source);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await shot('01-open');
 await select();await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByRole('textbox',{name:'便签内容',exact:true}).fill('Do not lose this draft');
 await shot('02-note-draft');
 await page.keyboard.press('Shift+Tab');
 const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),text:document.activeElement?.textContent,inside:!!document.activeElement?.closest('.note-modal')}));
 record('NOTE_FOCUS_ESCAPE',focus);await shot('03-note-focus-outside');
 if(!focus.inside&&focus.label==='取消选区'){
  await page.keyboard.press('Enter');await expect(page.locator('.note-modal')).toBeVisible();await page.getByRole('button',{name:'保存便签',exact:true}).click();
  record('NOTE_SAVE_AFTER_BACKGROUND_CANCEL',{modalCount:await page.locator('.note-modal').count(),stored:(await marks()).length,status:await page.getByRole('status').innerText(),alerts:await page.getByRole('alert').count()});await shot('04-note-save-without-anchor');
 }else await page.keyboard.press('Escape');
 await select();await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('annotation:change');let fail=true;ipcMain.removeHandler('annotation:change');ipcMain.handle('annotation:change',(e,c)=>{if(fail){fail=false;return{ok:false,error:{code:'AUDIT_WRITE',message:'simulated write failure'}};}return original(e,c);});});
 await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();await shot('05-save-error-retry');
 await page.getByRole('button',{name:'关闭错误提示',exact:true}).click();
 record('DISMISS_SAVE_ERROR',{retryButtons:await page.getByRole('button',{name:'重试保存',exact:true}).count(),alerts:await page.getByRole('alert').count(),exportDisabled:await page.getByRole('button',{name:'导出批注 PDF',exact:true}).isDisabled(),drawDisabled:await page.getByRole('button',{name:'绘制箭头',exact:true}).isDisabled(),status:await page.getByRole('status').innerText(),stored:(await marks()).length});await shot('06-error-hidden-pending');
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().focus();await page.keyboard.press('Control+w');
 record('PENDING_CLOSE_SHORTCUT',{tabs:await page.getByRole('tab',{name:'Audit.pdf',exact:true}).count(),retryButtons:await page.getByRole('button',{name:'重试保存',exact:true}).count()});
 // Reading movement schedules a flush that re-exposes the otherwise hidden pending error.
 await page.getByRole('textbox',{name:'跳转页码',exact:true}).fill('2');await page.getByRole('textbox',{name:'跳转页码',exact:true}).press('Enter');await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 record('RECOVERY_AFTER_READING_FLUSH',{stored:(await marks()).length,status:await page.getByRole('status').innerText()});
 await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.getByRole('textbox',{name:'跳转页码',exact:true})).toHaveValue('1');await page.getByRole('button',{name:'上一页',exact:true}).click();record('PAGE_BOUNDARY',{page:await page.getByRole('textbox',{name:'跳转页码',exact:true}).inputValue(),previousEnabled:await page.getByRole('button',{name:'上一页',exact:true}).isEnabled()});
 await page.getByRole('button',{name:'绘制画笔',exact:true}).click();const b=await page.locator('.page[data-page-number="1"]').boundingBox();await page.mouse.move(b.x+80,b.y+160);await page.mouse.down();await page.mouse.move(b.x+180,b.y+200);await page.keyboard.press('Escape');await page.mouse.up();
 record('ESC_DRAW_CANCEL',{drafts:await page.locator('.line-draft').count(),stored:(await marks()).length,pressed:await page.getByRole('button',{name:'绘制画笔',exact:true}).getAttribute('aria-pressed')});await shot('07-recovered');
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
}finally{writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
