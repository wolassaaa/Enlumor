import{test,expect,_electron as electron}from'@playwright/test';import{mkdtempSync,readFileSync,copyFileSync}from'node:fs';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';import path from'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-eraser-')),python=path.join(root,'.venv/Scripts/python.exe'),source=path.join(folder,'eraser.pdf'),output=path.join(folder,'export.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();p=d.new_page(width=480,height=640);p.insert_text((48,72),'Eraser evidence',fontsize=16);p.add_text_annot((48,100),'Original PDF note');p.add_ink_annot([[(60,120),(165,120)]]);d.new_page(width=480,height=640);d.save(${JSON.stringify(source)})`]);
async function launch(profile:string,scale=1){const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--legacy-editing','--user-data-dir='+path.join(folder,profile),'--force-device-scale-factor='+scale],env:{...process.env,ENLUMOR_PYTHON:python}});
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.source]});dialog.showSaveDialog=async()=>({canceled:false,filePath:files.output});},{source,output});return app;}
async function open(app:any){const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();return page;}
async function draw(page:any,points:number[][]){await page.getByRole('button',{name:'绘制画笔',exact:true}).click();const b=await page.locator('.page[data-page-number="1"]').boundingBox();await page.mouse.move(b.x+points[0][0],b.y+points[0][1]);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(b.x+p[0],b.y+p[1]);await page.mouse.up();}
async function erase(page:any,points:number[][]){await page.getByRole('button',{name:'整笔擦除',exact:true}).click({timeout:2500});const b=await page.locator('.page[data-page-number="1"]').boundingBox();await page.mouse.move(b.x+points[0][0],b.y+points[0][1]);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(b.x+p[0],b.y+p[1]);await page.mouse.up();}
async function quit(app:any){await app.evaluate(({app}:any)=>app.exit(0)).catch(()=>{});}
test('one eraser sweep deletes two entire strokes atomically and one undo restores both',async()=>{
 const app=await launch('atomic');try{const page=await open(app);await draw(page,[[80,160],[220,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await draw(page,[[80,220],[220,220]]);await expect(page.locator('.drawn-ink')).toHaveCount(2);await erase(page,[[150,140],[150,240]]);await expect(page.locator('.drawn-ink')).toHaveCount(0);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(2);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(0);
 }finally{await quit(app);}
});
test('empty interior does not erase a closed stroke and Escape cancels matching preview',async()=>{
 const app=await launch('cancel');try{const page=await open(app);await draw(page,[[80,160],[220,160],[220,300],[80,300],[80,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await erase(page,[[150,230]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await expect(page.getByRole('button',{name:'整笔擦除',exact:true})).toHaveAttribute('aria-pressed','true');
 const b=await page.locator('.page[data-page-number="1"]').boundingBox();await page.mouse.move(b.x+150,b.y+160);await page.mouse.down();await expect(page.locator('.erase-preview')).toHaveCount(1);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('.erase-preview')).toHaveCount(0);await expect(page.locator('.drawn-ink')).toHaveCount(1);
 }finally{await quit(app);}
});
test('eraser persistence and repeat exports remove only workspace ink and preserve source PDF annotation',async()=>{
 let app=await launch('export');const before=readFileSync(source);try{let page=await open(app);await draw(page,[[80,160],[220,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await erase(page,[[150,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(0);await app.close();app=await launch('export');page=await app.firstWindow();await expect(page.locator('.textLayer span').first()).toBeVisible();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'导出批注 PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('导出完成');expect(execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(output)});p=d[0];print([a.type[0] for a in p.annots()])`],{encoding:'utf8'}).trim()).toBe('[0, 15]');}
 expect(readFileSync(source).equals(before)).toBe(true);copyFileSync(output,path.join(process.env.ENLUMOR_EVIDENCE_DIR||'evidence/stroke-eraser','erased-export.pdf'));
 }finally{await quit(app);}
});

test('failed erase restores preview and retains original deletion for visible retry',async()=>{
 const app=await launch('failed');try{const page=await open(app);await draw(page,[[80,160],[220,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);
 await app.evaluate(({ipcMain}:any)=>{const handler=ipcMain._invokeHandlers.get('annotation:change');let fail=true;ipcMain.removeHandler('annotation:change');ipcMain.handle('annotation:change',(e:any,c:any)=>{if(fail){fail=false;return{ok:false,error:{code:'ERASE_TEST',message:'injected write failure'}};}return handler(e,c);});});
 await erase(page,[[150,160]]);await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();await expect(page.locator('.drawn-ink')).toHaveCount(1);await expect(page.locator('.erase-preview')).toHaveCount(0);await expect(page.getByRole('button',{name:'整笔擦除',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'关闭错误提示',exact:true}).click();await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(1);
 }finally{await quit(app);}
});
test('eraser ignores original PDF ink and workspace arrows highlights and notes',async()=>{
 const app=await launch('only-ink');try{const page=await open(app);await erase(page,[[150,160]]);await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'整笔擦除',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
 await page.locator('.textLayer span').first().evaluate((item:HTMLElement)=>{const r=document.createRange();r.selectNodeContents(item);const s=getSelection()!;s.removeAllRanges();s.addRange(r);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});await page.getByRole('button',{name:'高亮选区',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await page.getByRole('button',{name:'绘制箭头',exact:true}).click();let b=await page.locator('.page[data-page-number="1"]').boundingBox();await page.mouse.move(b.x+80,b.y+220);await page.mouse.down();await page.mouse.move(b.x+220,b.y+220);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(2);
 await page.locator('.textLayer span').first().evaluate((item:HTMLElement)=>{const r=document.createRange();r.selectNodeContents(item);const s=getSelection()!;s.removeAllRanges();s.addRange(r);document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});await page.getByRole('button',{name:'添加便签',exact:true}).click();await page.getByLabel('便签内容').fill('keep this note');await page.getByRole('button',{name:'保存便签',exact:true}).click();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(3);
 await erase(page,[[70,80],[150,240]]);await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(3);await expect(page.locator('.note-content')).toHaveText('keep this note');
 }finally{await quit(app);}
});
for(const [rotation,scale]of [[90,1.5],[270,2]]as const)test(`eraser hits rotated ink at ${rotation} degrees and display scale ${scale}`,async()=>{
 const app=await launch('rot-'+rotation,scale);try{const page=await open(app);for(let i=0;i<rotation/90;i++)await page.getByRole('button',{name:'旋转页面',exact:true}).click();await draw(page,[[80,160],[220,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await erase(page,[[150,140],[150,180]]);await expect(page.locator('.drawn-ink')).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(1);
 }finally{await quit(app);}
});
test('captured off-page pointer does not project a fictional eraser sweep onto the page edge',async()=>{
 const app=await launch('edge');try{const page=await open(app);await draw(page,[[3,200],[3,250]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await erase(page,[[30,180],[-30,190],[-30,270]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await expect(page.locator('.erase-preview')).toHaveCount(0);
 await page.keyboard.press('Escape');await erase(page,[[3,190],[3,260]]);await expect(page.locator('.drawn-ink')).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.drawn-ink')).toHaveCount(1);
 }finally{await quit(app);}
});
for(const action of ['rotate','layout','page']as const)test(`eraser preview cancels before same-turn ${action} and pointer release`,async()=>{
 const app=await launch('cancel-'+action);try{const page=await open(app);await draw(page,[[80,160],[220,160]]);await expect(page.locator('.drawn-ink')).toHaveCount(1);await page.getByRole('button',{name:'整笔擦除',exact:true}).click();const b=await page.locator('.page[data-page-number="1"]').boundingBox();await page.mouse.move(b.x+150,b.y+160);await page.mouse.down();await expect(page.locator('.erase-preview')).toHaveCount(1);
 await page.evaluate(({action,x,y}:{action:string;x:number;y:number})=>{const label=action==='rotate'?'旋转页面':action==='layout'?'收起文档栏':'下一页';(document.querySelector('[aria-label="'+label+'"]')as HTMLButtonElement).click();document.querySelector('#viewerContainer')!.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));},{action,x:b.x+150,y:b.y+160});
 await expect(page.locator('.erase-preview')).toHaveCount(0);await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 }finally{await (await app.firstWindow()).mouse.up();await quit(app);}
});
