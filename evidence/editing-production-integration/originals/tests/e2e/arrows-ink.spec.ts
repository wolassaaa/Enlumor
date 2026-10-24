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


test('ink keeps an ordered closed stroke through cancel undo restart and native export',async()=>{
 const profile=path.join(folder,'ink');let app=await launch(profile);const original=readFileSync(source);
 try{
 let page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 let box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;const tool=page.getByRole('button',{name:'绘制画笔',exact:true});
 await tool.click({timeout:3000});await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+180,box.y+200);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 await tool.click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+180,box.y+200,{steps:5});await page.mouse.move(box.x+100,box.y+250,{steps:5});await page.mouse.move(box.x+80,box.y+160,{steps:5});await page.mouse.up();
 await expect(page.locator('.drawn-ink polyline')).toHaveCount(1);await expect(page.locator('.annotation-source')).toContainText('画笔');await expect(tool).toHaveAttribute('aria-pressed','false');
 const stored=await page.evaluate(async()=>{const d=await window.enlumor.listDocuments();if(!d.ok)throw Error('docs');const a=await window.enlumor.getAnnotations(d.value[0].id);if(!a.ok)throw Error('marks');return a.value[0];});
 expect(stored.type).toBe('ink');expect(stored.points!.length).toBeGreaterThan(6);expect(stored.points!.slice(-2)).toEqual(stored.points!.slice(0,2));
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(1);
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'旋转页面',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(1);}
 await app.close();app=await launch(profile);page=await app.firstWindow();await expect(page.locator('.drawn-ink polyline')).toHaveCount(1);
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 const vertices=JSON.parse(execFileSync(python,['-c',`import pymupdf as f,json;d=f.open(${JSON.stringify(output)});p=d[0];a=next(p.annots());print(json.dumps({'type':a.type[0],'points':a.vertices[0]}))`],{encoding:'utf8'}));
 expect(vertices.type).toBe(15);vertices.points.flatMap((p:number[])=>[p[0],640-p[1]]).forEach((n:number,i:number)=>expect(n).toBeCloseTo(stored.points![i],1));
 expect(readFileSync(source).equals(original)).toBe(true);copyFileSync(output,path.join(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/arrows-ink','ink-export.pdf'));await page.screenshot({path:(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/arrows-ink')+'/ink.png'});
 }finally{await app.close();}
});

for(const mode of ['arrow','ink'] as const)for(const [rotation,scale]of [[0,1],[90,1.5],[180,1],[270,2]]as const)test(`${mode} creation at ${rotation} degrees and display scale ${scale} matches native SVG and PDF coordinates`,async()=>{
 const app=await launch(path.join(folder,mode+'-rot-'+rotation),scale);
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();for(let i=0;i<rotation/90;i++)await page.getByRole('button',{name:'旋转页面',exact:true}).click();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;
 await page.getByRole('button',{name:mode==='arrow'?'绘制箭头':'绘制画笔',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+170,box.y+200);await page.mouse.move(box.x+230,box.y+210);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 const stored=await page.evaluate(async()=>{const d=await window.enlumor.listDocuments();if(!d.ok)throw Error('docs');const a=await window.enlumor.getAnnotations(d.value[0].id);if(!a.ok)throw Error('marks');return a.value[0];});
 const expectedScreen=mode==='arrow'?[80,160,230,210]:[80,160,170,200,230,210],r=96/72;
 const native=(x:number,y:number)=>rotation===0?[x/r,640-y/r]:rotation===90?[y/r,x/r]:rotation===180?[480-x/r,y/r]:[480-y/r,640-x/r];
 const expected=expectedScreen.flatMap((n,i,p)=>i%2===0?native(n,p[i+1]):[]);expect(stored.points).toHaveLength(expected.length);stored.points!.forEach((n,i)=>expect(Math.abs(n-expected[i])).toBeLessThan(.75));
 const svg=page.locator('.drawn-'+mode);const displayed=mode==='arrow'?await svg.locator('line').evaluate(l=>['x1','y1','x2','y2'].map(k=>Number(l.getAttribute(k)))):await svg.locator('polyline').evaluate(l=>(l.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number));
 displayed.forEach((n,i)=>expect(Math.abs(n-expectedScreen[i])).toBeLessThan(1));
 if(mode==='arrow'){const head=await svg.locator('polygon').getAttribute('points');expect(head).toBeTruthy();const tip=head!.split(' ')[0].split(',').map(Number);expect(tip[0]).toBeCloseTo(displayed[2]);expect(tip[1]).toBeCloseTo(displayed[3]);}
 await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 const exported=JSON.parse(execFileSync(python,['-c',`import pymupdf as f,json;d=f.open(${JSON.stringify(output)});p=d[0];a=next(p.annots());print(json.dumps(a.vertices if a.type[0]==3 else a.vertices[0]))`],{encoding:'utf8'}));
 exported.flatMap((p:number[])=>[p[0],640-p[1]]).forEach((n:number,i:number)=>expect(n).toBeCloseTo(stored.points![i],1));
 }finally{await app.close();}
});

test('long ink gesture bounds stored samples and preserves first and terminal coordinates',async()=>{
 const app=await launch(path.join(folder,'ink-cap'));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;
 await page.getByRole('button',{name:'绘制画笔',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();
 await page.evaluate(({x,y})=>{const c=document.querySelector('#viewerContainer')!;for(let i=0;i<9000;i++)c.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,isPrimary:true,clientX:x+80+(i%2)*100,clientY:y+160+(i%2)*40,bubbles:true}));},{x:box.x,y:box.y});
 await page.mouse.move(box.x+230,box.y+250);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 const p=await page.evaluate(async()=>{const d=await window.enlumor.listDocuments();if(!d.ok)throw Error('docs');const a=await window.enlumor.getAnnotations(d.value[0].id);if(!a.ok)throw Error('marks');return a.value[0].points!;});
 expect(p.length).toBeLessThanOrEqual(8192);expect(p[0]).toBeCloseTo(60,0);expect(p[1]).toBeCloseTo(520,0);expect(p.at(-2)).toBeCloseTo(172.5,0);expect(p.at(-1)).toBeCloseTo(452.5,0);
 }finally{await app.close();}
});

for(const mode of ['arrow','ink'] as const)test(`${mode} draft uses selected color and cancels on rotation without saving`,async()=>{
 const app=await launch(path.join(folder,mode+'-draft'));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await page.getByLabel('批注颜色',{exact:true}).fill('#335588');const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;
 await page.getByRole('button',{name:mode==='arrow'?'绘制箭头':'绘制画笔',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+200,box.y+210);await expect(page.locator('.line-draft '+(mode==='ink'?'polyline':'line'))).toHaveAttribute('stroke','#335588');
 if(mode==='arrow')await expect(page.locator('.line-draft polygon')).toHaveCount(1);
 await page.evaluate(({x,y})=>{(document.querySelector('[aria-label="旋转页面"]') as HTMLButtonElement).click();document.querySelector('#viewerContainer')!.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));},{x:box.x+200,y:box.y+210});
 await expect(page.locator('.line-draft')).toHaveCount(0);await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 }finally{await (await app.firstWindow()).mouse.up();await app.close();}
});

for(const mode of ['arrow','ink'] as const)for(const timing of ['same-turn','after-render'] as const)for(const action of ['hide-library','hide-notes','spacing','right-divider'] as const)test(`${mode} gesture cancels before ${action} changes the page layout (${timing})`,async()=>{
 const app=await launch(path.join(folder,'layout-'+mode+'-'+action+'-'+timing));
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
 if(action==='spacing')await page.getByRole('button',{name:'布局设置',exact:true}).click();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;await page.getByRole('button',{name:mode==='arrow'?'绘制箭头':'绘制画笔',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+200,box.y+210);await expect(page.locator('.line-draft')).toHaveCount(1);
 await page.evaluate(({action,timing,x,y})=>{
  if(action==='hide-library')(document.querySelector('[aria-label="收起文档栏"]') as HTMLButtonElement).click();
  else if(action==='hide-notes')(document.querySelector('[aria-label="收起批注栏"]') as HTMLButtonElement).click();
  else if(action==='spacing'){const select=document.querySelector('[aria-label="阅读间距"]') as HTMLSelectElement;select.value='24';select.dispatchEvent(new Event('change',{bubbles:true}));}
  else document.querySelector('[aria-label="调整批注栏宽度"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  if(timing==='same-turn')document.querySelector('#viewerContainer')!.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
 },{action,timing,x:box.x+200,y:box.y+210});
 await expect(page.locator('.line-draft')).toHaveCount(0);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await expect(page.getByRole('button',{name:mode==='arrow'?'绘制箭头':'绘制画笔',exact:true,includeHidden:true})).toHaveAttribute('aria-pressed','false');
 }finally{await (await app.firstWindow()).mouse.up();await app.close();}
});
