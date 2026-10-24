import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-complex-')),python=path.join(root,'.venv/Scripts/python.exe'),source=path.join(folder,'中文 双栏 裁剪.pdf'),output=path.join(folder,'export.pdf');
execFileSync(python,['-c',`import pymupdf as f,random;d=f.open()
for rotation in (0,90,180,270):
 p=d.new_page(width=640,height=840)
 for x in (65,345):
  p.insert_text((x,120),'Repeated evidence',fontsize=14)
  p.insert_text((x,150),'Second line of evidence',fontsize=12)
  p.insert_text((x,185),'\\u4e2d\\u6587\\u9605\\u8bfb\\u6d4b\\u8bd5',fontname='china-s',fontsize=14)
 p.add_text_annot((70,210),'Original note');p.set_cropbox(f.Rect(25,35,615,805));p.set_rotation(rotation)
p=d.new_page(width=480,height=640);shape=p.new_shape()
for i in range(2500):
 x=(i%50)*9;y=(i//50)*10;shape.draw_line((x,y),(x+6,y+7))
shape.finish(color=(.2,.4,.3),width=.4);shape.commit();p.insert_text((48,600),'Vector complexity evidence')
p=d.new_page(width=480,height=640);pix=f.Pixmap(f.csGRAY,400,400,random.Random(42).randbytes(160000),False);p.insert_image(p.rect,stream=pix.tobytes('png'));d.save(${JSON.stringify(source)})`]);
const scanOnly=path.join(folder,'scan-only.pdf');execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(source)});d.select([5]);d.save(${JSON.stringify(scanOnly)})`]);
async function launch(name:string,scale=1,selectedSource=source){const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,name),'--force-device-scale-factor='+scale],env:{...process.env,ENLUMOR_PYTHON:python}});await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.source]});dialog.showSaveDialog=async()=>({canceled:false,filePath:files.output});},{source:selectedSource,output});if(name==='scan-first')await app.evaluate(({ipcMain}:any)=>{const handler=ipcMain._invokeHandlers.get('tabs:save');ipcMain.removeHandler('tabs:save');ipcMain.handle('tabs:save',async(e:any,c:any)=>{await new Promise(r=>setTimeout(r,200));return handler(e,c);});});const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('#viewer canvas').first()).toBeVisible();await expect(page.locator('.statusbar [role="status"]')).toContainText('已恢复');return{app,page};}
async function go(page:any,n:number){const input=page.getByLabel('跳转页码',{exact:true});await input.fill(String(n));await input.press('Enter');await expect(page.locator(`.page[data-page-number="${n}"] canvas`).first()).toBeVisible();}
async function select(page:any,n:number,text:string,index=0){const item=page.locator(`.page[data-page-number="${n}"] .textLayer span`).filter({hasText:text}).nth(index);await expect(item).toBeVisible();await item.evaluate((item:HTMLElement)=>{const range=document.createRange();range.selectNodeContents(item);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});}
test('double columns and repeated Chinese text retain the selected occurrence through crop rotation restart and repeat export',async()=>{
 test.setTimeout(120000);const before=createHash('sha256').update(readFileSync(source)).digest('hex');let{app,page}=await launch('anchors',1.5);
 try{await page.getByLabel('阅读模式',{exact:true}).selectOption('single');
 for(let n=1;n<=4;n++){await go(page,n);await select(page,n,'Repeated evidence',1);await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(n);}
 await go(page,1);await select(page,1,'中文阅读测试',1);await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(5);
 const search=page.getByLabel('全文搜索',{exact:true});await search.fill('Repeated evidence');await page.getByRole('button',{name:'搜索',exact:true}).click();await expect(page.locator('.notice')).toContainText('/ 8');await search.fill('中文阅读测试');await page.getByRole('button',{name:'搜索',exact:true}).click();await expect(page.locator('.textLayer .highlight.selected').first()).toHaveText('中文阅读测试');await expect(page.locator('.notice')).toContainText('/ 8');
 await go(page,1);await page.locator('.page[data-page-number="1"] .textLayer').evaluate(layer=>{const spans=[...layer.querySelectorAll(':scope > span')];const start=spans.filter(s=>s.textContent==='Repeated evidence')[1],end=spans.filter(s=>s.textContent==='Second line of evidence')[1];const range=document.createRange();range.setStart(start,0);range.setEnd(end,end.childNodes.length);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(6);
 const marks=await page.evaluate(async()=>{const docs=await window.enlumor.listDocuments();if(!docs.ok)throw Error('docs');const r=await window.enlumor.getAnnotations(docs.value[0].id);if(!r.ok)throw Error('marks');return r.value;});expect(marks).toHaveLength(6);expect(marks[5].quads).toHaveLength(2);
 const overlay=page.locator('.page[data-page-number="1"] .enlumor-marks'),order=await overlay.locator('[data-annotation-id]').evaluateAll(nodes=>nodes.map(n=>(n as HTMLElement).dataset.annotationId));
 const retained=await overlay.locator('[data-annotation-id]').first().elementHandle();await page.getByLabel('批注颜色',{exact:true}).fill('#326352');await page.locator('[data-testid="annotation-item"]').last().getByRole('button',{name:'应用颜色',exact:true}).click();
 await expect(overlay.locator(`[data-annotation-id="${marks[5].id}"]`).first()).toHaveCSS('background-color','rgb(50, 99, 82)');await expect(overlay.locator(`[data-annotation-id="${marks[5].id}"]`)).toHaveCount(2);expect(await retained!.evaluate(node=>node.isConnected)).toBe(true);expect(await overlay.locator('[data-annotation-id]').evaluateAll(nodes=>nodes.map(n=>(n as HTMLElement).dataset.annotationId))).toEqual(order);
 await app.close();({app,page}=await launch('anchors',2));await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(6);
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');
 const checked=JSON.parse(execFileSync(python,['-c',`import pymupdf as f,json;d=f.open(${JSON.stringify(output)});counts=[];centres=[]
for i in range(4):
 p=d[i];p.set_rotation(0);ann=list(p.annots());counts.append(len(ann));hits=p.search_for('Repeated evidence');a=[a for a in ann if a.type[0]==8 and a.info['content']=='Repeated evidence'][0];pts=a.vertices;cx=sum(v[0] for v in pts)/len(pts);cy=sum(v[1] for v in pts)/len(pts);right=hits[1];centres.append({'right':right.x0<=cx<=right.x1 and right.y0-3<=cy<=right.y1+3,'rotation':${JSON.stringify([0,90,180,270])}[i]})
print(json.dumps({'counts':counts,'centres':centres,'total':sum(len(list(p.annots() or [])) for p in d)}))`],{encoding:'utf8'}));expect(checked.counts).toEqual([4,2,2,2]);expect(checked.total).toBe(10);expect(checked.centres.every((c:any)=>c.right)).toBe(true);}
 expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(before);const evidence=process.env.ENLUMOR_EVIDENCE_DIR||'evidence/round-six';mkdirSync(evidence,{recursive:true});copyFileSync(output,path.join(evidence,'complex-export.pdf'));writeFileSync(path.join(evidence,'complex-anchors.json'),JSON.stringify(marks,null,2));await go(page,2);await page.screenshot({path:path.join(evidence,'complex-rotation.png')});
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
});
test('search Next preserves match counts across cached and newly visited pages',async()=>{
 const{app,page}=await launch('search-next');try{await page.getByLabel('阅读模式',{exact:true}).selectOption('single');await go(page,2);await go(page,1);await page.getByLabel('全文搜索',{exact:true}).fill('Repeated evidence');await page.getByRole('button',{name:'搜索',exact:true}).click();await expect(page.locator('.notice')).toContainText('搜索 1 / 8');
 for(let i=2;i<=5;i++){await page.getByRole('button',{name:'下一个搜索结果',exact:true}).click();await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue(String(Math.ceil(i/2)));await expect(page.locator('.notice')).toContainText(`搜索 ${i} / 8`);}
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
});
test('vector page renders and cached scan page restores no-text feedback after leaving and returning',async()=>{
 const{app,page}=await launch('scan');try{await page.getByLabel('阅读模式',{exact:true}).selectOption('single');await go(page,5);await expect(page.locator('.page[data-page-number="5"] .textLayer')).toContainText('Vector complexity evidence');await go(page,6);await expect(page.locator('.notice')).toContainText('当前页没有文字层');await expect(page.locator('.page[data-page-number="6"] .textLayer span')).toHaveCount(0);await expect(page.getByRole('button',{name:'高亮选区',exact:true})).toBeDisabled();await go(page,5);await expect(page.locator('.notice').filter({hasText:'当前页没有文字层'})).toHaveCount(0);await go(page,6);await expect(page.locator('.notice')).toContainText('当前页没有文字层');
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
});

test('scan-only document shows capability feedback on initial open',async()=>{const{app,page}=await launch('scan-first',1,scanOnly);try{await expect(page.locator('.notice')).toContainText('当前页没有文字层');await expect(page.locator('.textLayer span')).toHaveCount(0);}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}});
