// Offline acceptance aid (not a release gate, no real model): drives Surfing on a real paper against a
// local mock OpenAI-compatible server and records exactly what the app would send. Isolated temp profile.
// Usage: node scripts/surfing-real-paper-check.mjs <outDir> <pdf>
import {_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
const [out,pdfIn]=process.argv.slice(2);if(!out||!pdfIn)throw Error('usage: surfing-real-paper-check.mjs <outDir> <pdf>');
mkdirSync(out,{recursive:true});
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-realpaper-')),pdf=path.join(folder,path.basename(pdfIn));copyFileSync(pdfIn,pdf);
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex'),pdfBefore=sha(pdfIn);
const requests=[],results={};let delayMs=0;
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=parse(raw)||{};requests.push({at:Date.now(),body});
 const msgs=body.messages||[],data=msgs.map(m=>parse(typeof m.content==='string'?m.content:'')).find(x=>x&&Array.isArray(x.passages))||{};
 const passages=data.passages||[],hit=passages.find(p=>/dominant sequence transduction/i.test(p.text||p.quote||''))||passages[0];
 const p3=passages.find(p=>(p.pageNumber??(p.pageIndex+1))===3)||hit;
 const q=String(data.question||'');const target=/这里/.test(q)?p3:hit;
 const answer={text:`(mock) 回答：${q.slice(0,40)} [passage:${target?.id}] [block:b92c331b-0e71-4a38-a745-dd39bd13eded-d87d482d5ae7-0-0]`,passageIds:target?[target.id]:[]};
 if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
 res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(answer)},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+server.address().port+'/v1';
const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,'profile')],env:{...process.env,ENLUMOR_PYTHON:path.join(root,'.venv/Scripts/python.exe')}});
const lastData=()=>{const b=requests.at(-1)?.body||{};return (b.messages||[]).map(m=>parse(typeof m.content==='string'?m.content:'')).find(x=>x&&Array.isArray(x.passages))||null;};
try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
 await page.evaluate(async e=>{await window.enlumor.saveAiProfile({id:'mock-local',name:'Local mock (no network)',protocol:'openai-chat',endpoint:e,model:'gpt-4o-mini',maxOutputTokens:1000,timeoutMs:15000,parameters:{}});},endpoint);
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},pdf);
 await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await page.locator('.textLayer span').first().waitFor();
 await page.getByRole('button',{name:'打开 Surfing'}).click();
 await page.getByRole('button',{name:'准备本地全文',exact:true}).click();await page.getByLabel('Surfing 状态',{exact:true}).filter({hasText:'已准备文字'}).waitFor({timeout:30000});
 results.coverage=await page.locator('.surfing-coverage').textContent();
 await page.getByLabel('Surfing 模型上下文窗口（tokens）',{exact:true}).fill('128000');
 await page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true}).check();
 await page.screenshot({path:path.join(out,'01-ready.png')});
 // U02: on page 1 (title), ask about the abstract.
 const ask=async q=>{const n=requests.length;await page.getByLabel('Surfing 随时提问',{exact:true}).fill(q);await page.getByRole('button',{name:/发送问题|打断并发送/}).click();for(let i=0;i<150&&requests.length===n;i++)await page.waitForTimeout(100);await page.getByLabel('Surfing 状态',{exact:true}).filter({hasText:'等待你的选择'}).waitFor({timeout:20000}).catch(()=>{});await page.waitForTimeout(300);};
 await ask('给我讲讲这个abstract讲了什么');
 const d1=lastData();const allText=(d1?.passages||[]).map(p=>p.text||p.quote||'').join('\n');
 results.U02={requestCount:requests.length,passages:d1?.passages?.length,pagesCovered:[...new Set((d1?.passages||[]).map(p=>p.pageNumber??(p.pageIndex+1)))].sort((a,b)=>a-b),
  includesAbstractSentence:/dominant sequence transduction models are based on complex recurrent/i.test(allText.replace(/\s+/g,' ')),
  includesConclusion:/conclusion/i.test(allText),currentPageField:Object.fromEntries(Object.entries(d1||{}).filter(([k])=>/page/i.test(k)&&k!=='passages')),
  dataKeys:Object.keys(d1||{}),firstPassages:(d1?.passages||[]).slice(0,4).map(p=>({id:p.id,page:p.pageNumber??p.pageIndex,text:String(p.text||p.quote||'').slice(0,160)}))};
 const response=await page.locator('.surfing-response').last().textContent();
 results.U06={renderedAnswer:response,containsBlockId:/\[block:/.test(response||''),containsPassageId:/\[passage:/.test(response||''),evidenceButtons:await page.locator('.surfing-evidence button').allTextContents()};
 await page.screenshot({path:path.join(out,'02-first-answer.png')});
 const ev=page.locator('.surfing-evidence button').first();if(await ev.count()){await ev.click();await page.waitForTimeout(500);results.U06.afterEvidencePage=await page.locator('.page-input').inputValue();await page.screenshot({path:path.join(out,'03-evidence-jump.png')});}
 // U07: follow-up carries the previous turn; page change is reflected.
 await ask('它与RNN有什么不同');const d2=lastData();
 results.U07={historyTurns:Array.isArray(d2?.history)?d2.history.length:(Array.isArray(d2?.conversation)?d2.conversation.length:'(no history/conversation field: keys '+Object.keys(d2||{}).join(',')+')'),secondQuestion:d2?.question};
 await page.locator('.page-input').fill('3');await page.locator('.page-input').press('Enter');await page.waitForTimeout(800);
 await ask('这里讲的是什么');const d3=lastData();results.U07.pageField=Object.fromEntries(Object.entries(d3||{}).filter(([k])=>/page/i.test(k)&&k!=='passages'));results.U07.answerPassagePage=await page.locator('.surfing-evidence button').last().textContent();
 // Interrupt: slow reply then pause; the late reply must not be appended.
 delayMs=2500;const before=await page.locator('.surfing-conversation article').count();await page.getByLabel('Surfing 随时提问',{exact:true}).fill('慢一点的问题');await page.getByRole('button',{name:/发送问题|打断并发送/}).click();await page.waitForTimeout(400);await page.getByRole('button',{name:'暂停 Surfing',exact:true}).click();await page.waitForTimeout(3200);
 results.interrupt={articlesBefore:before,articlesAfter:await page.locator('.surfing-conversation article').count(),status:await page.getByLabel('Surfing 状态',{exact:true}).textContent()};delayMs=0;
 await page.screenshot({path:path.join(out,'04-final.png')});
 results.requestSizesBytes=requests.map(r=>JSON.stringify(r.body).length);results.sourcePdfUnchanged=sha(pdfIn)===pdfBefore;
 writeFileSync(path.join(out,'REQUESTS.json'),JSON.stringify(requests.map(r=>r.body),null,1));
 writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify(results,null,2));console.log('RESULTS '+JSON.stringify(results,null,2));
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.close();}
