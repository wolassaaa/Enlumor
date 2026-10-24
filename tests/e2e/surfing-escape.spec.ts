import {test,expect,_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-surfing-escape-')),python=path.join(root,'.venv/Scripts/python.exe'),source=path.join(folder,'Escape source.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open()
for i in range(2):
 p=d.new_page();p.insert_text((60,100),'Escape source page '+str(i+1))
d.save(${JSON.stringify(source)})`]);
// T10: Escape is the keyboard takeover; it must pause Surfing like any other user takeover, with no late answer.
test('Escape pauses an in-flight Surfing question and suppresses the late answer',async()=>{
 let requests=0;
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;requests++;const data=JSON.parse(JSON.parse(raw).messages[1].content);
  await new Promise(r=>setTimeout(r,2500));
  res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({text:'Late answer that must not appear.',passageIds:[data.passages[0].id]})},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+(server.address() as any).port+'/v1';
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,'profile')],env:{...process.env,ENLUMOR_PYTHON:python}});
 try{const page=await app.firstWindow();await page.evaluate(async endpoint=>{await window.enlumor.saveAiProfile({id:'esc-local',name:'Local mock only',protocol:'openai-chat',endpoint,model:'gpt-4o-mini',maxOutputTokens:1000,timeoutMs:10000,parameters:{}});},endpoint);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.getByRole('button',{name:'打开 Surfing',exact:true}).click();await page.getByRole('button',{name:'准备本地全文',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字');
  await page.getByLabel('Surfing 模型上下文窗口（tokens）',{exact:true}).fill('128000');await page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true}).check();
  await page.getByLabel('Surfing 随时提问',{exact:true}).fill('这篇讲什么');await page.getByRole('button',{name:'发送问题',exact:true}).click();
  await expect.poll(()=>requests).toBe(1);await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('解释中');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已暂停');
  await page.waitForTimeout(3200);
  await expect(page.locator('.surfing-conversation article')).toHaveCount(0);await expect(page.getByText('Late answer that must not appear.')).toHaveCount(0);
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.close();}
});
// Review follow-up: a takeover only interrupts work in flight. Idle Escape/scroll keeps the prepared state; IME Escape is not a takeover.
test('idle Escape and scroll keep prepared Surfing; Escape during IME composition does not interrupt',async()=>{
 let requests=0,release=()=>{};
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;requests++;const data=JSON.parse(JSON.parse(raw).messages[1].content);
  release=()=>{res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({text:'Answer after IME escape.',passageIds:[data.passages[0].id]})},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');};});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+(server.address() as any).port+'/v1';
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,'profile-idle')],env:{...process.env,ENLUMOR_PYTHON:python}});
 try{const page=await app.firstWindow();await page.evaluate(async endpoint=>{await window.enlumor.saveAiProfile({id:'idle-local',name:'Local mock only',protocol:'openai-chat',endpoint,model:'gpt-4o-mini',maxOutputTokens:1000,timeoutMs:10000,parameters:{}});},endpoint);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.getByRole('button',{name:'打开 Surfing',exact:true}).click();await page.getByRole('button',{name:'准备本地全文',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字');
  await page.keyboard.press('Escape');await page.waitForTimeout(200);await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字');
  const viewer=page.locator('#viewerContainer'),box=(await viewer.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,120);await page.waitForTimeout(200);await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字');
  await page.getByLabel('Surfing 模型上下文窗口（tokens）',{exact:true}).fill('128000');await page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true}).check();
  await page.getByLabel('Surfing 随时提问',{exact:true}).fill('输入法测试');await page.getByRole('button',{name:'发送问题',exact:true}).click();await expect.poll(()=>requests).toBe(1);await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('解释中');
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true})));await page.waitForTimeout(200);
  await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('解释中');release();await expect(page.getByText('Answer after IME escape.')).toBeVisible();
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.close();}
});
