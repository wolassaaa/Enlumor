import {test,expect,_electron as electron} from '@playwright/test';
import {createServer,type ServerResponse} from 'node:http';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve('.'),evidence=path.join(root,'evidence/surfing-2026-10-24/T5c-large'),fixtures=path.join(evidence,'fixtures'),python=path.join(root,'.venv/Scripts/python.exe');
mkdirSync(fixtures,{recursive:true});
execFileSync(python,['-c',`import pymupdf as f,json,hashlib,pathlib
folder=pathlib.Path(${JSON.stringify(fixtures)});manifest=folder/'input-manifest.json'
if manifest.exists():
 data=json.loads(manifest.read_text());assert all(hashlib.sha256((folder/v['file']).read_bytes()).hexdigest()==v['sha256'] for v in data.values())
else:
 data={}
 for name,pages in [('large',42),('overlimit',86)]:
  d=f.open();lines=[]
  for i in range(pages):
   p=d.new_page(width=595,height=842);page=[]
   for j in range(22):
    line=(('PAGE_%03d_LINE_%02d / '%(i+1,j+1))+('Local synthetic evidence preserves context and exact source references. '*3))[:104].strip();p.insert_text((50,60+j*26),line,fontname='cour',fontsize=8);page.append(line)
   lines.append(page)
  target=folder/(name+'.pdf');d.save(target,deflate=True);d.close();data[name]={'file':target.name,'pageCount':pages,'lines':lines,'passages':pages*22,'characterCount':sum(len(s) for page in lines for s in page),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 manifest.write_text(json.dumps(data),encoding='utf-8')
`],{windowsHide:true});
type Fixture={file:string;pageCount:number;lines:string[][];passages:number;characterCount:number;sha256:string};
const inputs=JSON.parse(readFileSync(path.join(fixtures,'input-manifest.json'),'utf8')) as Record<'large'|'overlimit',Fixture>;
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
function done(res:ServerResponse,value:unknown){if(res.destroyed)return;res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(value)},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}
async function openFixture(endpoint:string,name:'large'|'overlimit'){
 const profile=mkdtempSync(path.join(tmpdir(),'enlumor-surfing-large-')),app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+profile],env:{...process.env,ENLUMOR_PYTHON:python}});const page=await app.firstWindow();
 await page.evaluate(async endpoint=>{const r=await window.enlumor.saveAiProfile({id:'large-local',name:'Local large fixture',protocol:'openai-chat',endpoint,model:'gpt-4o-mini',maxOutputTokens:1000,timeoutMs:15000,parameters:{}});if(!r.ok)throw Error(r.error.message);},endpoint);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(fixtures,inputs[name].file));await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();const docs=await page.evaluate(async()=>{const r=await window.enlumor.listDocuments();if(!r.ok)throw Error(r.error.message);return r.value;});expect(docs).toHaveLength(1);expect(docs[0]).toMatchObject({pageCount:inputs[name].pageCount,fingerprint:inputs[name].sha256});await page.getByRole('button',{name:'打开 Surfing',exact:true}).click();return{app,page,profile};
}

test('Surfing large synthetic full text preserves first middle last evidence, native focus and cancellation',async()=>{
 test.setTimeout(120000);const input=inputs.large;expect(input.characterCount).toBeGreaterThanOrEqual(80000);expect(input.characterCount).toBeLessThanOrEqual(120000);const requests:any[]=[];let release=()=>{};
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(JSON.parse(raw).messages[1].content);requests.push(data);const first=data.passages.find((p:any)=>p.pageNumber===1),middle=data.passages.find((p:any)=>p.pageNumber===22),last=data.passages.find((p:any)=>p.pageNumber===42);
  if(!data.selectedStop){done(res,{stops:[{title:'First synthetic evidence',reason:'Verify the beginning',passageIds:[first.id]},{title:'Middle synthetic evidence',reason:'Verify the middle',passageIds:[middle.id]},{title:'Last synthetic evidence',reason:'Verify the end',passageIds:[last.id]}]});return;}
  if(data.selectedStop.passageIds[0]===middle.id){release=()=>done(res,{text:'Late synthetic response after pause',passageIds:[middle.id]});return;}
  done(res,{text:'Synthetic explanation anchored to the actual final page.',passageIds:[last.id]});
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const {app,page}=await openFixture('http://127.0.0.1:'+(server.address() as any).port+'/v1','large');const metrics:any={synthetic:true,realModel:false,timingScope:'Playwright operation and waits; renderer observations only; not a performance gate',geometryScope:'Last-page first-line overlap only, not exact coverage',sourceHash:input.sha256,pageCount:input.pageCount,expectedCharacters:input.characterCount,completed:false};
 try{
  await page.evaluate(()=>{const p=(window as any).__surfingLarge={frames:[] as number[],tasks:[] as number[],last:performance.now(),active:true,frame:0,observer:null as PerformanceObserver|null};const frame=()=>{if(!p.active)return;const now=performance.now();p.frames.push(now-p.last);p.last=now;p.frame=requestAnimationFrame(frame);};p.frame=requestAnimationFrame(frame);p.observer=new PerformanceObserver(list=>p.tasks.push(...list.getEntries().map(e=>e.duration)));p.observer.observe({type:'longtask',buffered:false});});
  const prepareStart=Date.now();await page.getByRole('button',{name:'准备本地全文',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字');metrics.prepareMs=Date.now()-prepareStart;await expect(page.locator('.surfing-coverage')).toContainText(`${input.pageCount} 页 · ${input.passages} 段 · ${input.characterCount} 字符`);expect(requests).toHaveLength(0);
  await page.getByLabel('Surfing 模型上下文窗口（tokens）',{exact:true}).fill('128000');await page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true}).check();const routeStart=Date.now();await page.getByRole('button',{name:'生成探索切入点',exact:true}).click();await expect(page.getByRole('button',{name:'Last synthetic evidence',exact:true})).toBeVisible();metrics.routeMs=Date.now()-routeStart;expect(requests).toHaveLength(1);await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue('1');
  const locateStart=Date.now();await page.getByRole('button',{name:'Last synthetic evidence',exact:true}).click();await expect(page.getByLabel('Surfing 解释',{exact:true})).toContainText('actual final page');await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue('42');metrics.locateExplainMs=Date.now()-locateStart;const actual=page.locator('.page[data-page-number="42"] .textLayer span').filter({hasText:'PAGE_042_LINE_01'});await expect(actual).toBeVisible();const a=await actual.boundingBox(),b=await page.locator('.page[data-page-number="42"] .flash').boundingBox();expect(a).not.toBeNull();expect(b).not.toBeNull();expect(Math.min(a!.x+a!.width,b!.x+b!.width)-Math.max(a!.x,b!.x)).toBeGreaterThan(0);expect(Math.min(a!.y+a!.height,b!.y+b!.height)-Math.max(a!.y,b!.y)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'回看上一处',exact:true}).click();await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue('22');await page.getByRole('button',{name:'回看上一处',exact:true}).click();await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue('1');expect(requests).toHaveLength(2);
  await page.getByRole('button',{name:'继续探索',exact:true}).click();await expect.poll(()=>requests.length).toBe(3);await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('解释中');const pauseStart=Date.now();await page.getByRole('button',{name:'暂停 Surfing',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已暂停');metrics.pauseMs=Date.now()-pauseStart;release();await page.waitForTimeout(250);await expect(page.getByLabel('Surfing 解释',{exact:true})).not.toContainText('Late synthetic response');expect(requests).toHaveLength(3);
  for(const request of requests){expect(request.pageCount).toBe(42);expect(new Set(request.passages.map((p:any)=>p.pageNumber)).size).toBe(42);expect(request.passages.map((p:any)=>({pageNumber:p.pageNumber,text:p.text}))).toEqual(input.lines.flatMap((lines,pageIndex)=>lines.map(text=>({pageNumber:pageIndex+1,text}))));expect(request.passages.reduce((sum:number,p:any)=>sum+p.text.length,0)).toBe(input.characterCount);expect(request.emptyPageNumbers).toEqual([]);}metrics.requestCount=requests.length;metrics.promptDataCharacters=JSON.stringify(requests[0]).length;metrics.completed=true;
 }finally{
  metrics.ui=await page.evaluate(()=>{const p=(window as any).__surfingLarge;p.active=false;cancelAnimationFrame(p.frame);p.observer?.disconnect();p.frames.sort((a:number,b:number)=>a-b);return{samples:p.frames.length,frameP95Ms:p.frames[Math.floor(p.frames.length*.95)]||0,worstFrameMs:Math.max(0,...p.frames),longTasks:p.tasks.length,worstLongTaskMs:Math.max(0,...p.tasks)};}).catch(()=>({unavailable:true}));metrics.sourceHashAfter=hash(path.join(fixtures,input.file));writeFileSync(path.join(evidence,'LARGE-METRICS.json'),JSON.stringify(metrics,null,2));console.log('SURFING_LARGE '+JSON.stringify(metrics));await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));expect(metrics.sourceHashAfter).toBe(input.sha256);
 }
});

test('Surfing over-limit synthetic document fails explicitly before any model request or partial scope',async()=>{
 test.setTimeout(120000);const input=inputs.overlimit;expect(input.characterCount).toBeGreaterThan(160000);let calls=0;const server=createServer((_req,res)=>{calls++;done(res,{stops:[]});});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const {app,page}=await openFixture('http://127.0.0.1:'+(server.address() as any).port+'/v1','overlimit');const start=Date.now();
 try{await page.getByRole('button',{name:'准备本地全文',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('需要处理');await expect(page.locator('.surfing-error')).toContainText('SURFING_CONTEXT_TOO_LARGE');await expect(page.getByRole('button',{name:'生成探索切入点',exact:true})).toBeDisabled();await expect(page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true})).toBeDisabled();await expect(page.locator('.surfing-coverage')).toHaveCount(0);await expect(page.locator('.surfing-stops')).toHaveCount(0);await page.waitForTimeout(200);expect(calls).toBe(0);const metrics={synthetic:true,realModel:false,pageCount:input.pageCount,expectedCharacters:input.characterCount,prepareRejectMs:Date.now()-start,modelRequests:calls,sourceHash:input.sha256,sourceHashAfter:hash(path.join(fixtures,input.file)),error:'SURFING_CONTEXT_TOO_LARGE',completed:true};expect(metrics.sourceHashAfter).toBe(input.sha256);writeFileSync(path.join(evidence,'OVERLIMIT-METRICS.json'),JSON.stringify(metrics,null,2));console.log('SURFING_OVERLIMIT '+JSON.stringify(metrics));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
