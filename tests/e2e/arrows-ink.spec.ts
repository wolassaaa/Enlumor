import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-arrows-ink-')),python=path.join(root,'.venv/Scripts/python.exe');
const source=path.join(folder,'reading tools.pdf'),output=path.join(folder,'drawing.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence page '+str(i+1),fontsize=16);p.insert_text((48,105),'Second line of original evidence.',fontsize=12)\nd.save(${JSON.stringify(source)})`]);
async function launch(profile:string,scale=1){
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+profile,'--force-device-scale-factor='+scale],env:{...process.env,ENLUMOR_PYTHON:python}});
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.source]});dialog.showSaveDialog=async()=>({canceled:false,filePath:files.output});},{source,output});return app;
}
async function select(app:Awaited<ReturnType<typeof launch>>){const page=await app.firstWindow();await page.locator('.page[data-page-number="1"] .textLayer span').first().evaluate(item=>{const range=document.createRange();range.selectNodeContents(item);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});}

test('arrow direction and Escape cancellation preserve native endpoints through rotation restart and standard export',async()=>{
 const profile=path.join(folder,'arrow');let app=await launch(profile);
 try{
 let page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;
 await page.getByRole('button',{name:'绘制箭头',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+230,box.y+210);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await page.getByRole('button',{name:'绘制箭头',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+230,box.y+210,{steps:8});await page.mouse.up();
 await expect(page.locator('.annotation-source')).toContainText('箭头');await expect(page.locator('.drawn-arrow')).toHaveCount(1);
 const stored=await page.evaluate(async()=>{const docs=await window.enlumor.listDocuments();if(!docs.ok)throw Error('docs');const marks=await window.enlumor.getAnnotations(docs.value[0].id);if(!marks.ok)throw Error('marks');return marks.value[0];});
 expect(stored.type).toBe('arrow');expect(stored.points).toHaveLength(4);
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'旋转页面',exact:true}).click();await expect(page.locator('.drawn-arrow')).toHaveCount(1);}
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.drawn-arrow')).toHaveCount(1);
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 expect(execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(output)});print([(a.type[0],a.line_ends) for a in d[0].annots()])`],{encoding:'utf8'}).trim()).toBe('[(3, (0, 5))]');
 copyFileSync(output,path.join(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/arrows-ink','arrow-export.pdf'));await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/arrows-ink')+'/arrow.png'});
 }finally{await app.close();}
});

