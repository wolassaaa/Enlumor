import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-editing-geometry-')),python=path.join(root,'.venv/Scripts/python.exe');
const source=path.join(folder,'reading tools.pdf'),output=path.join(folder,'drawing.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence page '+str(i+1),fontsize=16);p.insert_text((48,105),'Second line of original evidence.',fontsize=12)\nd.save(${JSON.stringify(source)})`]);
import { DatabaseSync } from 'node:sqlite';
// The editing library (the default path) keeps marks in edit_marks; this reads the one mark a test drew.
function storedMark(profile:string){const db=new DatabaseSync(path.join(profile,'workspace.sqlite'),{readOnly:true});try{const rows=db.prepare('SELECT payload FROM edit_marks').all();expect(rows).toHaveLength(1);return JSON.parse(String(rows[0].payload)) as {type:string;points?:number[]};}finally{db.close();}}
async function launch(profile:string,scale=1){
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+profile,'--force-device-scale-factor='+scale],env:{...process.env,ENLUMOR_PYTHON:python}});
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.source]});dialog.showSaveDialog=async()=>({canceled:false,filePath:files.output});},{source,output});return app;
}

for(const mode of ['arrow','ink'] as const)for(const [rotation,scale]of [[0,1],[90,1.5],[180,1],[270,2]]as const)test(`${mode} creation at ${rotation} degrees and display scale ${scale} matches native SVG and PDF coordinates on the editing library`,async()=>{
 const app=await launch(path.join(folder,mode+'-rot-'+rotation),scale);
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();for(let i=0;i<rotation/90;i++)await page.getByRole('button',{name:'旋转页面',exact:true}).click();
 const box=(await page.locator('.page[data-page-number="1"]').boundingBox())!;
 await page.getByRole('button',{name:mode==='arrow'?'绘制箭头':'绘制画笔',exact:true}).click();await page.mouse.move(box.x+80,box.y+160);await page.mouse.down();await page.mouse.move(box.x+170,box.y+200);await page.mouse.move(box.x+230,box.y+210);await page.mouse.up();await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
 await expect(page.getByRole('status')).toContainText('已保存');const stored=storedMark(path.join(folder,mode+'-rot-'+rotation));expect(stored.type).toBe(mode);
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

