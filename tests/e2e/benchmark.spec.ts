import {test,expect,_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-benchmark-')),python=path.join(root,'.venv/Scripts/python.exe');
const paper=path.join(folder,'paper.pdf'),bench=path.join(folder,'Lumen benchmark.pdf'),plain=path.join(folder,'plain.pdf');
execFileSync(python,[path.join(root,'tests/acceptance/make-paper.py'),paper]);
// Detection reads the embedded manifest; the printed QR (benchmark.py add) is not needed for this.
execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(paper)});d.embfile_add('enlumor-benchmark.json',open(${JSON.stringify(path.join(root,'tests/acceptance/lumen-benchmark.json'))},'rb').read());d.save(${JSON.stringify(bench)})`]);
execFileSync(python,['-c',`import pymupdf as f;d=f.open(${JSON.stringify(paper)});d.save(${JSON.stringify(plain)})`]);
const send=(res:any,value:unknown)=>{res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(value)},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');};

test('a benchmark PDF is recognised on open and its checks run in test mode',async()=>{
 const asked:string[]=[];
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),sys=body.messages[0].content,data=JSON.parse(body.messages[1].content),P=data.passages,find=(t:string)=>(P.find((p:any)=>p.text.includes(t))||P[0]).id;
  if(sys.startsWith('Help a reader explore'))return send(res,{stops:[{title:'问题',reason:'r',passageIds:[find('Abstract')]},{title:'方法',reason:'r',passageIds:[find('two stages')]}]});
  if(sys.startsWith('Explain the selected'))return send(res,{text:'讲解：'+data.selectedStop.title,passageIds:data.selectedStop.passageIds});
  if(body.messages.length===2)asked.push(data.question);expect(data.conversation).toEqual([]);
  if(data.question.includes('Figure 1')){if(body.messages.length===2)return send(res,{actions:[{type:'view_page',pageNumber:2}]});return send(res,{text:'Retrieval 的准确率最高。',passageIds:[find('Figure 1:')]});}
  return send(res,{text:'方法叫 Lumen Routing：先路由，再解释。',passageIds:[find('Lumen Routing')]});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+(server.address() as any).port+'/v1';
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,'profile')],env:{...process.env,ENLUMOR_PYTHON:python}});
 try{const page=await app.firstWindow();
  await page.evaluate(async endpoint=>{await window.enlumor.saveAiProfile({id:'vision',name:'Vision mock',protocol:'openai-chat',endpoint,model:'gpt-4o',maxOutputTokens:1000,timeoutMs:10000,parameters:{}});},endpoint);
  const open=async(file:string)=>{await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]});},file);await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.document-name')).toHaveText(path.basename(file));};
  await open(plain);await page.waitForTimeout(800);await expect(page.getByLabel('测试基准',{exact:true})).toHaveCount(0);
  await open(bench);await expect(page.getByLabel('测试基准',{exact:true})).toContainText('Lumen Routing fixture');
  await page.getByRole('button',{name:'进入测试模式',exact:true}).click();await expect(page.getByLabel('测试模式',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'开始测试',exact:true})).toBeDisabled();expect(asked).toEqual([]);
  await page.getByLabel('确认发送全文进行测试',{exact:true}).check();await page.getByRole('button',{name:'开始测试',exact:true}).click();
  await expect(page.getByLabel('测试得分',{exact:true})).toHaveText('得分 4 / 4',{timeout:30000});
  const results=page.getByLabel('测试结果',{exact:true});await expect(results).toContainText('过程：查看第 2 页');await expect(results).toContainText('依次讲解了前两处切入点');
  expect(asked).toHaveLength(2);
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
