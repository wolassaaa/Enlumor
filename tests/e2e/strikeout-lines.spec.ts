import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-strikeout-lines-')),python=path.join(root,'.venv/Scripts/python.exe');
const source=path.join(folder,'reading tools.pdf'),output=path.join(folder,'drawing.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence page '+str(i+1),fontsize=16);p.insert_text((48,105),'Second line of original evidence.',fontsize=12)\nd.save(${JSON.stringify(source)})`]);
async function launch(profile:string,scale=1){
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--legacy-editing','--user-data-dir='+profile,'--force-device-scale-factor='+scale],env:{...process.env,ENLUMOR_PYTHON:python}});
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.source]});dialog.showSaveDialog=async()=>({canceled:false,filePath:files.output});},{source,output});return app;
}
async function select(app:Awaited<ReturnType<typeof launch>>){const page=await app.firstWindow();await page.locator('.page[data-page-number="1"] .textLayer span').first().evaluate(item=>{const range=document.createRange();range.selectNodeContents(item);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});}

test('strikeout persists rotates and exports a native StrikeOut annotation',async()=>{
 const profile=path.join(folder,'strikeout');let app=await launch(profile);const before=readFileSync(source);
 try{
 let page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await select(app);
 await page.getByRole('button',{name:'删除线选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);await expect(page.locator('.annotation-source')).toContainText('删除线');
 await expect(page.locator('.strikeout-line')).toHaveCount(1);
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'旋转页面',exact:true}).click();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.annotation-source')).toContainText('删除线');
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 expect(execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(output)});print([a.type[0] for a in d[0].annots()])`],{encoding:'utf8'}).trim()).toBe('[11]');expect(readFileSync(source).equals(before)).toBe(true);copyFileSync(output,path.join(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/strikeout-lines','strikeout-export.pdf'));await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/strikeout-lines')+'/strikeout.png'});
 }finally{await app.close();}
});

test('line drag and Escape cancellation preserve native endpoints through rotation restart and standard export',async()=>{
 const profile=path.join(folder,'line');let app=await launch(profile);
 try{
 let page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;
 await page.getByRole('button',{name:'绘制直线',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+230,box.y+210);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await page.getByRole('button',{name:'绘制直线',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+230,box.y+210,{steps:8});await page.mouse.up();
 await expect(page.locator('.annotation-source')).toContainText('直线');await expect(page.locator('.drawn-line')).toHaveCount(1);
 const stored=await page.evaluate(async()=>{const docs=await window.enlumor.listDocuments();if(!docs.ok)throw Error('docs');const marks=await window.enlumor.getAnnotations(docs.value[0].id);if(!marks.ok)throw Error('marks');return marks.value[0];});
 expect(stored.type).toBe('line');expect(stored.points).toHaveLength(4);
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'旋转页面',exact:true}).click();await expect(page.locator('.drawn-line')).toHaveCount(1);}
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.drawn-line')).toHaveCount(1);
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 expect(execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(output)});print([a.type[0] for a in d[0].annots()])`],{encoding:'utf8'}).trim()).toBe('[3]');
 copyFileSync(output,path.join(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/strikeout-lines','line-export.pdf'));await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/strikeout-lines')+'/line.png'});
 }finally{await app.close();}
});

test('short line click stays armed and the next drag draws without extra toggles',async()=>{
 const app=await launch(path.join(folder,'short-click'));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;const tool=page.getByRole('button',{name:'绘制直线',exact:true});await tool.click();await page.mouse.click(box.x+80,box.y+160);
 await expect(tool).toHaveAttribute('aria-pressed','true');await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+220,box.y+220);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 }finally{await app.close();}
});

test('armed line tool cancels and cannot draw while an export is pending',async()=>{
 const app=await launch(path.join(folder,'busy-export'));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await app.evaluate(({ipcMain})=>{const original=(ipcMain as any)._invokeHandlers.get('document:export');ipcMain.removeHandler('document:export');ipcMain.handle('document:export',async(e,id)=>{await new Promise<void>(resolve=>(globalThis as any).releaseTestExport=resolve);return original(e,id);});});
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;await page.getByRole('button',{name:'绘制直线',exact:true}).click();await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('正在导出');
 await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+220,box.y+220);await expect(page.locator('.line-draft')).toHaveCount(0);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await app.evaluate(()=>(globalThis as any).releaseTestExport?.());await expect(page.getByRole('status')).toContainText('导出完成');
 }finally{await (await app.firstWindow()).mouse.up();await app.evaluate(()=>(globalThis as any).releaseTestExport?.());await app.close();}
});

test('failed annotation remains retryable and cannot be replaced by an armed line gesture',async()=>{
 const app=await launch(path.join(folder,'pending-line'));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await select(app);await page.getByRole('button',{name:'高亮选区',exact:true}).click();
 await app.evaluate(({ipcMain})=>{const original=(ipcMain as any)._invokeHandlers.get('annotation:change');let fail=true;ipcMain.removeHandler('annotation:change');ipcMain.handle('annotation:change',(e,change)=>{if(fail){fail=false;return{ok:false,error:{code:'WRITE_TEST',message:'write failed'}};}return original(e,change);});});
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;await page.getByRole('button',{name:'绘制直线',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+220,box.y+220);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 }finally{await app.close();}
});

test('viewport rotation during a drag cancels it before a same-turn pointer release can persist wrong coordinates',async()=>{
 const app=await launch(path.join(folder,'rotation-draft'));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;await page.getByRole('button',{name:'绘制直线',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+220,box.y+220);
 await page.evaluate(({x,y})=>{(document.querySelector('[aria-label="旋转页面"]') as HTMLButtonElement).click();document.querySelector('#viewerContainer')!.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));},{x:box.x+220,y:box.y+220});
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().waitFor({state:'visible'});await expect(page.getByRole('button',{name:'打开 PDF',exact:true}).first()).toBeEnabled();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 }finally{await (await app.firstWindow()).mouse.up();await app.close();}
});

for(const [rotation,scale]of [[90,1.5],[270,2]]as const)test(`line creation at rotation ${rotation} and display scale ${scale} retains native and exported endpoints`,async()=>{
 const app=await launch(path.join(folder,'create-'+rotation),scale);
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();for(let i=0;i<rotation/90;i++)await page.getByRole('button',{name:'旋转页面',exact:true}).click();
 await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;const ratio=96/72; // PDF.js zoom=1 uses CSS pixels per PDF point, independent of rounded DOM width.
 await page.getByRole('button',{name:'绘制直线',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+230,box.y+210);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 const stored=await page.evaluate(async()=>{const docs=await window.enlumor.listDocuments();if(!docs.ok)throw Error('docs');const a=await window.enlumor.getAnnotations(docs.value[0].id);if(!a.ok)throw Error('marks');return a.value[0].points!;});
 const expected=rotation===90?[160/ratio,80/ratio,210/ratio,230/ratio]:[480-160/ratio,640-80/ratio,480-210/ratio,640-230/ratio];stored.forEach((value,i)=>expect(Math.abs(value-expected[i])).toBeLessThan(.75));
 const coords=await page.locator('.drawn-line line').evaluate(l=>['x1','y1','x2','y2'].map(key=>Number(l.getAttribute(key))));coords.forEach((value,i)=>expect(Math.abs(value-[80,160,230,210][i])).toBeLessThan(1));
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 const vertices=JSON.parse(execFileSync(python,['-c',`import pymupdf as f,json;d=f.open(${JSON.stringify(output)});p=d[0];print(json.dumps(next(p.annots()).vertices))`],{encoding:'utf8'}));
 const exported=[vertices[0][0],640-vertices[0][1],vertices[1][0],640-vertices[1][1]];exported.forEach((value,i)=>expect(value).toBeCloseTo(stored[i],1));
 }finally{await app.close();}
});
