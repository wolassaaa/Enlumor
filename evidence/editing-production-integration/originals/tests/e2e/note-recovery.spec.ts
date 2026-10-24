import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-note-fix-')),source=path.join(folder,'notes.pdf'),python=path.join(root,'.venv/Scripts/python.exe');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();p=d.new_page(width=480,height=640);p.insert_text((48,72),'Original note anchor',fontsize=16);d.new_page();d.save(${JSON.stringify(source)})`]);
async function launch(name:string){
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,name)],env:{...process.env,ENLUMOR_PYTHON:python}});
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();return{app,page};
}
async function select(page:any){await page.locator('.textLayer span').first().evaluate((item:HTMLElement)=>{const r=document.createRange();r.selectNodeContents(item);const s=getSelection()!;s.removeAllRanges();s.addRange(r);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});}
async function fault(app:any){await app.evaluate(({ipcMain}:any)=>{const original=ipcMain._invokeHandlers.get('annotation:change');let fail=true;ipcMain.removeHandler('annotation:change');ipcMain.handle('annotation:change',(e:any,c:any)=>{if(fail){fail=false;return{ok:false,error:{code:'TEST_WRITE',message:'injected failure'}};}return original(e,c);});});}
async function finish(app:any){await app.evaluate(({app}:any)=>app.exit(0)).catch(()=>{});}
test('note modal traps keyboard focus and restores its trigger after cancellation',async()=>{
 const{app,page}=await launch('focus');try{await select(page);const trigger=page.getByRole('button',{name:'添加便签',exact:true});await trigger.click();await page.getByLabel('便签内容').fill('retained draft');await page.keyboard.press('Shift+Tab');
 expect(await page.evaluate(()=>!!document.activeElement?.closest('.note-modal'))).toBe(true);
 await expect(page.getByRole('dialog',{name:'添加便签',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal','true');
 await page.keyboard.press('Tab');await expect(page.getByLabel('便签内容')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('.note-modal')).toHaveCount(0);await expect(trigger).toBeFocused();
 }finally{await finish(app);}
});
test('note saves its captured original anchor even if background selection is cleared',async()=>{
 const{app,page}=await launch('anchor');try{await select(page);await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByLabel('便签内容').fill('captured anchor');
 // Programmatic click bypasses native inert: the submit guard must not rely only on keyboard isolation.
 await page.locator('[aria-label="取消选区"]').evaluate((b:HTMLButtonElement)=>b.click());await page.getByRole('button',{name:'保存便签',exact:true}).click();
 await expect(page.locator('.note-content')).toHaveText('captured anchor');await expect(page.locator('.annotation-source')).toContainText('Original note anchor');await expect(page.getByRole('status')).toContainText('已保存');
 }finally{await finish(app);}
});
test('failed note save retains draft and exact retry after closing details or Escape',async()=>{
 const{app,page}=await launch('note-fail');try{await select(page);await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByLabel('便签内容').fill('recover me');await fault(app);await page.getByRole('button',{name:'保存便签',exact:true}).click();
 await expect(page.locator('.note-modal')).toBeVisible();await expect(page.getByLabel('便签内容')).toHaveValue('recover me');await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'关闭便签错误详情',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('.note-modal')).toBeVisible();await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect(page.locator('.note-modal')).toHaveCount(0);await expect(page.locator('.note-content')).toHaveText('recover me');await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/note-recovery')+'/saved-note.png'});
 }finally{await finish(app);}
});
test('closing save error details keeps pending recovery visible and commits original delete on retry',async()=>{
 const{app,page}=await launch('delete-fail');try{await select(page);await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);await fault(app);await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭错误提示',exact:true}).click();
 expect(await page.getByRole('button',{name:'重试保存',exact:true}).count()).toBe(1);await expect(page.getByRole('button',{name:'关闭文档并放弃未保存更改',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'导出批注 PDF',exact:true})).toBeDisabled();
 await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/note-recovery')+'/pending-recovery.png'});await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await expect(page.getByRole('status')).toContainText('已保存');
 }finally{await finish(app);}
});

test('explicitly discarding a failed note edit preserves the previously saved note',async()=>{
 const{app,page}=await launch('discard-edit');try{await select(page);await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByLabel('便签内容').fill('original saved');await page.getByRole('button',{name:'保存便签',exact:true}).click();await expect(page.locator('.note-content')).toHaveText('original saved');
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('便签内容').fill('failed edit');await fault(app);await page.getByRole('button',{name:'保存便签',exact:true}).click();await expect(page.locator('.note-modal')).toBeVisible();await page.getByRole('button',{name:'放弃未保存便签',exact:true}).click();
 await expect(page.locator('.note-modal')).toHaveCount(0);await expect(page.locator('.note-content')).toHaveText('original saved');await expect(page.getByRole('button',{name:'导出批注 PDF',exact:true})).toBeEnabled();
 }finally{await finish(app);}
});
