import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-reading-tools-')),python=path.join(root,'.venv/Scripts/python.exe');
const source=path.join(folder,'reading tools.pdf'),output=path.join(folder,'underline.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence page '+str(i+1),fontsize=16);p.insert_text((48,105),'Second line of original evidence.',fontsize=12)\nd.save(${JSON.stringify(source)})`]);
async function launch(profile:string){
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+profile],env:{...process.env,ENLUMOR_PYTHON:python}});
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.source]});dialog.showSaveDialog=async()=>({canceled:false,filePath:files.output});},{source,output});return app;
}
async function select(app:Awaited<ReturnType<typeof launch>>){const page=await app.firstWindow();await page.locator('.page[data-page-number="1"] .textLayer span').first().evaluate(item=>{const range=document.createRange();range.selectNodeContents(item);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});}

test('single-page mode navigates searches and restores without mounting all pages',async()=>{
 const profile=path.join(folder,'single');let app=await launch(profile);
 try{
 let page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 await page.getByLabel('阅读模式').selectOption('single');await page.getByLabel('跳转页码').fill('120');await page.getByLabel('跳转页码').press('Enter');
 await expect(page.locator('#viewer .page')).toHaveCount(1);await expect(page.locator('#viewer .page')).toHaveAttribute('data-page-number','120');
 await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByLabel('跳转页码')).toHaveValue('121');
 await page.getByLabel('全文搜索').fill('Evidence page 151');await page.getByLabel('全文搜索').press('Enter');await expect(page.getByLabel('跳转页码')).toHaveValue('151');await expect(page.locator('.textLayer .highlight').first()).toBeVisible();
 await page.getByLabel('阅读模式').selectOption('continuous');await expect(page.locator('#viewer .page')).toHaveCount(200);await expect(page.getByLabel('跳转页码')).toHaveValue('151');
 await page.getByLabel('阅读模式').selectOption('single');await app.close();app=await launch(profile);page=await app.firstWindow();
 await expect(page.getByLabel('阅读模式')).toHaveValue('single');await expect(page.getByLabel('跳转页码')).toHaveValue('151');await expect(page.locator('#viewer .page')).toHaveCount(1);await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/reading-tools')+'/single.png'});
 }finally{await app.close();}
});

test('underline persists rotates supports undo and exports a standard annotation without changing source',async()=>{
 const profile=path.join(folder,'underline');let app=await launch(profile);const bytes=readFileSync(source);
 try{
 let page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await select(app);
 await page.getByRole('button',{name:'下划线选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);await expect(page.locator('.annotation-source')).toContainText('下划线');
 for(let i=0;i<4;i++){
 await expect(page.locator('.enlumor-marks .underline-line').first()).toBeVisible();const line=page.locator('.enlumor-marks .underline-line line').first();await expect(line).toBeAttached();
 const direction=await line.evaluate(l=>({dx:Math.abs(Number(l.getAttribute('x2'))-Number(l.getAttribute('x1'))),dy:Math.abs(Number(l.getAttribute('y2'))-Number(l.getAttribute('y1')))}));
 if(i%2===0){expect(direction.dx).toBeGreaterThan(50);expect(direction.dy).toBeLessThan(.1);}else{expect(direction.dy).toBeGreaterThan(50);expect(direction.dx).toBeLessThan(.1);}
 await page.getByRole('button',{name:'旋转页面',exact:true}).click();}
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.annotation-source')).toContainText('下划线');
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 const types=execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(output)});print([a.type[0] for a in d[0].annots()])`],{encoding:'utf8'}).trim();expect(types).toBe('[9]');expect(readFileSync(source).equals(bytes)).toBe(true);
 await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/reading-tools')+'/underline.png'});
 }finally{await app.close();}
});

test('single-page cached overlays reflect offscreen deletion and undo when pages remount',async()=>{
 const app=await launch(path.join(folder,'cached-overlays'));
 try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await select(app);await page.getByRole('button',{name:'下划线选区',exact:true}).click();
 await page.getByLabel('阅读模式').selectOption('single');await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByLabel('跳转页码')).toHaveValue('2');
 await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.getByLabel('跳转页码')).toHaveValue('1');await expect(page.locator('.enlumor-marks .underline-line')).toHaveCount(0);
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.locator('.enlumor-marks .underline-line')).toHaveCount(1);
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await page.getByLabel('阅读模式').selectOption('continuous');await expect(page.locator('.page[data-page-number="1"] .underline-line')).toHaveCount(0);
 }finally{await app.close();}
});
