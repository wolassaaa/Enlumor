import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-layout-tabs-')),python=path.join(root,'.venv/Scripts/python.exe');
const alpha=path.join(folder,'alpha.pdf'),beta=path.join(folder,'beta.pdf');
for(const [file,count] of [[alpha,80],[beta,3]] as const)execFileSync(python,['-c',`import pymupdf as f;d=f.open();\nfor i in range(${count}):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Reading page '+str(i+1),fontsize=16)\nd.save(${JSON.stringify(file)})`]);
async function launch(profile:string) {
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),`--user-data-dir=${profile}`],env:{...process.env,ENLUMOR_PYTHON:python}});
 return app;
}
async function open(app:Awaited<ReturnType<typeof launch>>,file=alpha){
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.document-name')).toContainText(path.basename(file));await expect(page.getByRole('status')).toContainText('已恢复');
}

test('adjustable sidebars support drag, keyboard, spacing, persistence and a usable narrow reading viewport',async()=>{
 const profile=path.join(folder,'layout');let app=await launch(profile);
 try{
 const page=await app.firstWindow();await open(app);
 const before=(await page.locator('.library').boundingBox())!.width;
 const handle=page.getByRole('separator',{name:'调整文档栏宽度'});const box=(await handle.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+80);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+80,{steps:12});await page.mouse.up();
 expect((await page.locator('.library').boundingBox())!.width).toBeGreaterThan(before+70);
 const right=page.getByRole('separator',{name:'调整批注栏宽度'});await right.focus();await page.keyboard.press('ArrowLeft');
 await page.getByRole('button',{name:'布局设置',exact:true}).click();await page.getByLabel('阅读间距').selectOption('24');
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ui-spacing').trim())).toBe('24px');
 await page.getByRole('button',{name:'关闭布局设置'}).click();await page.screenshot({path:'evidence/layout-tabs/layout.png'});
 const leftWidth=(await page.locator('.library').boundingBox())!.width;await app.close();app=await launch(profile);
 const reopened=await app.firstWindow();await expect(reopened.locator('.document-name')).toContainText('alpha.pdf');
 await expect.poll(async()=>(await reopened.locator('.library').boundingBox())!.width).toBeCloseTo(leftWidth,0);
 await reopened.setViewportSize({width:940,height:720});
 await reopened.getByRole('separator',{name:'调整文档栏宽度'}).focus();await reopened.keyboard.press('End');
 expect((await reopened.locator('.reading').boundingBox())!.width).toBeGreaterThanOrEqual(399);
 await reopened.getByRole('button',{name:'布局设置',exact:true}).click();await reopened.getByRole('button',{name:'恢复默认布局',exact:true}).click();
 await expect.poll(()=>reopened.evaluate(()=>getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ui-spacing').trim())).toBe('16px');
 }finally{await app.close();}
});

test('document tabs isolate progress and undo, deduplicate opens, restore session and close without deleting data',async()=>{
 const profile=path.join(folder,'tabs');let app=await launch(profile);
 try{
 let page=await app.firstWindow();await open(app);
 await page.getByLabel('跳转页码').fill('51');await page.getByLabel('跳转页码').press('Enter');await expect(page.getByLabel('跳转页码')).toHaveValue('51');
 await page.getByRole('button',{name:'放大',exact:true}).click();
 await page.locator('.textLayer span').filter({hasText:'Reading page 51'}).first().evaluate(item=>{const range=document.createRange();range.selectNodeContents(item);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await open(app,beta);const tabs=page.getByRole('tablist',{name:'已打开文档'});await expect(tabs.getByRole('tab')).toHaveCount(2);
 await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await tabs.getByRole('tab',{name:'alpha.pdf',exact:true}).click();await expect(page.getByLabel('跳转页码')).toHaveValue('51');
 await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await open(app);await expect(tabs.getByRole('tab')).toHaveCount(2);await page.screenshot({path:'evidence/layout-tabs/tabs.png'});
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.document-name')).toContainText('alpha.pdf');
 const restored=page.getByRole('tablist',{name:'已打开文档'});await expect(restored.getByRole('tab')).toHaveCount(2);await expect(page.getByLabel('跳转页码')).toHaveValue('51');
 await page.getByRole('button',{name:'关闭 beta.pdf',exact:true}).click();await expect(restored.getByRole('tab')).toHaveCount(1);
 await page.getByRole('button',{name:'关闭 alpha.pdf',exact:true}).click();await expect(page.locator('.empty')).toBeVisible();
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.empty')).toBeVisible();await expect(page.locator('.recent')).toHaveCount(2);
 }finally{await app.close();}
});

test('note drafts block tab navigation and close shortcuts until saved or cancelled',async()=>{
 const app=await launch(path.join(folder,'draft-guard'));
 try{
 const page=await app.firstWindow();await open(app);
 await page.locator('.textLayer span').first().evaluate(item=>{const range=document.createRange();range.selectNodeContents(item);const s=getSelection()!;s.removeAllRanges();s.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByLabel('便签内容').fill('original');await page.getByRole('button',{name:'保存便签',exact:true}).click();
 await open(app,beta);await page.getByRole('tab',{name:'alpha.pdf',exact:true}).click();
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('便签内容').fill('retained draft');
 await page.keyboard.press('Control+Tab');await expect(page.locator('.document-name')).toHaveText('alpha.pdf');
 await page.keyboard.press('Control+w');await expect(page.getByRole('tablist',{name:'已打开文档'}).getByRole('tab')).toHaveCount(2);
 await expect(page.getByLabel('便签内容')).toHaveValue('retained draft');await page.getByRole('button',{name:'保存便签',exact:true}).click();
 await expect(page.locator('.note-content')).toHaveText('retained draft');
 await page.getByRole('tab',{name:'beta.pdf',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 }finally{await app.close();}
});

test('failed PDF renderer opening restores prior document, undo history and persisted active session',async()=>{
 const profile=path.join(folder,'renderer-failure');let app=await launch(profile);
 try{
 let page=await app.firstWindow();await open(app);
 await page.locator('.textLayer span').first().evaluate(item=>{const r=document.createRange();r.selectNodeContents(item);const s=getSelection()!;s.removeAllRanges();s.addRange(r);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await open(app,beta);await page.getByRole('tab',{name:'alpha.pdf',exact:true}).click();
 await app.evaluate(({ipcMain})=>{
 const original=(ipcMain as any)._invokeHandlers.get('document:restore');ipcMain.removeHandler('document:restore');
 ipcMain.handle('document:restore',async(event,id)=>{const reply=await original(event,id);if(reply.ok&&reply.value.name==='beta.pdf')reply.value.data=new Uint8Array([37,80,68,70,45,10]);return reply;});
 });
 await page.getByRole('tab',{name:'beta.pdf',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.locator('.document-name')).toHaveText('alpha.pdf');await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.document-name')).toHaveText('alpha.pdf');
 }finally{await app.close();}
});
