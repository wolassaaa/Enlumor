import {test,expect,_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-tour-')),python=path.join(root,'.venv/Scripts/python.exe'),paper=path.join(folder,'Lumen.pdf');
execFileSync(python,[path.join(root,'tests/acceptance/make-paper.py'),paper]);
const send=(res:any,value:unknown)=>{res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(value)},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');};

test('an answer walks the reader through its steps: smooth glides, by itself or by hand, and pauses when the reader takes over',async()=>{
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const data=JSON.parse(JSON.parse(raw).messages[1].content),P=data.passages;
  const find=(t:string)=>P.find((p:any)=>p.text.includes(t)).id;
  send(res,{text:'Retrieval 准确率最高；Lumen 的代价居中。',passageIds:[find('Figure 1:')],steps:[{text:'先看摘要里的核心主张。',passageId:find('Abstract')},{text:'再看 Table 1 的成本：Lumen 介于两者之间。',passageId:find('Tokens per answer'),zoom:'in'}]});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+(server.address() as any).port+'/v1';
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,'profile')],env:{...process.env,ENLUMOR_PYTHON:python}});
 try{const page=await app.firstWindow();await page.setViewportSize({width:1280,height:800});
  await page.evaluate(async endpoint=>{await window.enlumor.saveAiProfile({id:'local',name:'Local test',protocol:'openai-chat',endpoint,model:'gpt-4o',maxOutputTokens:1000,timeoutMs:10000,parameters:{}});},endpoint);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},paper);await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.getByRole('button',{name:'打开 Surfing',exact:true}).click();await page.getByRole('button',{name:'准备本地全文',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字');
  await page.getByLabel('Surfing 模型上下文窗口（tokens）',{exact:true}).fill('128000');await page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true}).check();
  // A model without verified thinking controls shows the choice greyed out.
  await expect(page.getByLabel('思考程度',{exact:true})).toBeDisabled();
  await page.getByLabel('Surfing 随时提问',{exact:true}).fill('Lumen 的代价和准确率怎么样？');await page.getByRole('button',{name:'发送问题',exact:true}).click();
  const steps=page.getByLabel('带路步骤',{exact:true});await expect(steps.locator('li')).toHaveCount(2);
  await expect(steps.locator('li').first()).toHaveClass(/is-current/);await expect(page.getByRole('button',{name:'暂停带路',exact:true})).toBeVisible();
  // Step 2 by hand: the reading area glides there (several distinct positions on the way), then looks closer.
  const scale=await page.evaluate(()=>(document.querySelector('.pdfViewer') as HTMLElement).style.getPropertyValue('--scale-factor'));
  const positions=page.evaluate(async()=>{const el=document.getElementById('viewerContainer')!,seen:number[]=[];const end=performance.now()+900;while(performance.now()<end){seen.push(Math.round(el.scrollTop));await new Promise(requestAnimationFrame);}return seen;});
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  const seen=await positions,distinct=new Set(seen);expect(distinct.size).toBeGreaterThan(4);expect(seen.at(-1)!).toBeGreaterThan(seen[0]);
  await expect(steps.locator('li').nth(1)).toHaveClass(/is-current/);await expect(page.getByLabel('跳转页码',{exact:true})).toHaveValue('3');
  await expect.poll(()=>page.evaluate(()=>(document.querySelector('.pdfViewer') as HTMLElement).style.getPropertyValue('--scale-factor'))).not.toBe(scale);
  await expect(page.getByLabel('带路进度',{exact:true})).toHaveText('第 2 / 2 步');
  // The keyboard steps back without pausing the walk as a takeover would.
  await page.locator('#viewerContainer').focus();await page.keyboard.press('ArrowLeft');await expect(steps.locator('li').first()).toHaveClass(/is-current/);
  await page.getByRole('button',{name:'继续带路',exact:true}).click();await expect(page.getByRole('button',{name:'暂停带路',exact:true})).toBeVisible();
  // The reader scrolling the page pauses it where it is.
  const viewer=page.locator('#viewerContainer'),box=(await viewer.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,200);
  await expect(page.getByRole('button',{name:'继续带路',exact:true})).toBeVisible();
  // Opening model settings clears the conversation, and the walk (with its keys) goes with it.
  await page.getByRole('button',{name:'模型设置',exact:true}).click();await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await expect(page.getByLabel('带路步骤',{exact:true})).toHaveCount(0);await expect(page.getByLabel('带路控制',{exact:true})).toHaveCount(0);
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
