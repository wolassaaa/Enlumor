/* Real-model benchmark: drives the built app against the reader's own service with a benchmark PDF that carries its
 * own checks (a QR code on its last page and the same manifest as an embedded file), then writes an HTML report and
 * appends the score to a history. The key comes from ENLUMOR_ACCEPTANCE_KEY and is never written anywhere.
 *
 *   ENLUMOR_ACCEPTANCE_PDF       a benchmark PDF, or any paper together with ENLUMOR_ACCEPTANCE_MANIFEST
 *   ENLUMOR_ACCEPTANCE_MANIFEST  a manifest to attach to that paper (see tests/acceptance/*-benchmark.json)
 *   default                      the generated Lumen Routing fixture with its manifest
 */
import {test,expect,_electron as electron,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {canSeeImages,pickDefaultModel,resolveContextWindow} from '../../src/shared/ai-models';
import type {AiProtocol} from '../../src/shared/ai';
import {gradeBenchmarkAnswer,gradeBenchmarkRoute,validateBenchmarkManifest,type BenchmarkCheck,type BenchmarkManifest} from '../../src/shared/benchmark';

const root=path.resolve('.'),base=path.join(root,'.cache','acceptance'),stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19),out=path.join(base,stamp);
const python=process.env.ENLUMOR_PYTHON||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const endpoint=(process.env.ENLUMOR_ACCEPTANCE_ENDPOINT||'').trim(),key=(process.env.ENLUMOR_ACCEPTANCE_KEY||'').trim(),wanted=(process.env.ENLUMOR_ACCEPTANCE_MODEL||'').trim();
const protocol=(process.env.ENLUMOR_ACCEPTANCE_PROTOCOL||(/anthropic\.com/.test(endpoint)?'anthropic-messages':/googleapis\.com/.test(endpoint)?'gemini':'openai-chat')) as AiProtocol;
const tool=path.join(root,'tests/acceptance/benchmark.py');

type Check=BenchmarkCheck;type Manifest=BenchmarkManifest;
type Result={id:string;name:string;status:'pass'|'fail'|'review'|'skip';detail:string;answer?:string;error?:string;ms:number;shot?:string};
const results:Result[]=[],facts:Record<string,string>={};
const CJK=/[一-鿿]/;

/** The benchmark PDF to open: given as-is, built from a paper plus manifest, or the generated fixture. */
function benchmarkPdf():string{
 const given=process.env.ENLUMOR_ACCEPTANCE_PDF?.trim(),manifest=process.env.ENLUMOR_ACCEPTANCE_MANIFEST?.trim(),target=path.join(out,'benchmark.pdf');
 if(given&&!manifest)return given;
 const paper=given||path.join(out,'paper.pdf');
 if(!given)execFileSync(python,[path.join(root,'tests/acceptance/make-paper.py'),paper]);
 execFileSync(python,[tool,'add',paper,manifest||path.join(root,'tests/acceptance/lumen-benchmark.json'),target]);
 return target;
}
async function record(page:Page,check:{id:string;title:string},run:()=>Promise<Omit<Result,'id'|'name'|'ms'|'shot'>>){
 const started=Date.now();let r:Omit<Result,'id'|'name'|'ms'|'shot'>;
 try{r=await run();}catch(e){r={status:'fail',detail:'检查未完成',error:(e instanceof Error?e.message:String(e)).split('\n')[0].slice(0,300)};}
 const alert=await page.locator('.surfing-panel [role=alert]').allInnerTexts().catch(()=>[] as string[]);if(alert.length&&!r.error&&r.status!=='pass')r.error=alert.join(' ').slice(0,300);
 const shot=`${results.length+1}-${check.id}.png`;await page.screenshot({path:path.join(out,shot)}).catch(()=>{});
 results.push({id:check.id,name:check.title,ms:Date.now()-started,shot,...r});
}
/** Waits until a new reply appears or the panel shows an error; returns the reply and what the agent did meanwhile.
 * The panel keeps only the latest few answers, so a new one may replace the oldest instead of adding to the count. */
async function awaitReply(page:Page,selector:string,before:number,timeout:number){
 const steps=new Set<string>(),deadline=Date.now()+timeout,items=page.locator(selector);
 const last=async()=>(await items.last().innerText().catch(()=>'')).trim(),previous=before?await last():'';
 while(Date.now()<deadline){
  for(const t of await page.locator('.surfing-step').allInnerTexts())steps.add(t.replace(/…$/,''));
  const count=await items.count();
  if(count>before||(before&&count===before&&await last()!==previous))return{text:await last(),steps:[...steps]};
  if(await page.locator('.surfing-panel [role=alert]').count())return{text:'',steps:[...steps],error:(await page.locator('.surfing-panel [role=alert]').innerText()).trim()};
  await page.waitForTimeout(400);
 }
 return{text:'',steps:[...steps],error:'超时：'+Math.round(timeout/1000)+' 秒内没有回答'};
}

async function askCheck(page:Page,c:Check,vision:boolean):Promise<Omit<Result,'id'|'name'|'ms'|'shot'>>{
 const before=await page.locator('.surfing-response').count();
 await page.getByLabel('Surfing 随时提问',{exact:true}).fill(c.question!);await page.getByRole('button',{name:'发送问题',exact:true}).click();
 const r=await awaitReply(page,'.surfing-response',before,180_000);if(r.error)return{status:'fail',detail:'没有得到回答',error:r.error};
 const chips=await page.locator('.surfing-conversation article').last().locator('.surfing-evidence button').count();
 // Same grading as the in-app test mode.
 return{...gradeBenchmarkAnswer(c,vision,r.text,chips,r.steps),answer:r.text};
}
async function routeCheck(page:Page,c:Check):Promise<Omit<Result,'id'|'name'|'ms'|'shot'>>{
 const before=await page.locator('.surfing-stops li').count();await page.getByRole('button',{name:'生成探索切入点',exact:true}).click();
 const r=await awaitReply(page,'.surfing-stops li',before,180_000);if(r.error)return{status:'fail',detail:'没有生成切入点',error:r.error};
 await page.waitForTimeout(500);const stops=await page.locator('.surfing-stops li button').allInnerTexts();
 return{...gradeBenchmarkRoute(c,stops.map(title=>({title}))),answer:stops.join('\n')};
}
async function guidedCheck(page:Page,c:Check):Promise<Omit<Result,'id'|'name'|'ms'|'shot'>>{
 const stops=await page.locator('.surfing-stops li').count();if(!stops)return{status:'skip',detail:'没有切入点，无法带读'};
 await page.getByLabel('每处停留秒数',{exact:true}).fill(String(c.dwell||5));if(c.depth)await page.getByLabel('解释深度',{exact:true}).selectOption(c.depth);
 await page.getByRole('button',{name:/开始带读|继续带读/}).click();
 // A real explanation carries its source buttons; the placeholder for an unexplained stop has none.
 const first=await awaitReply(page,'.surfing-stops li.is-current .surfing-answer:has(button) p',0,180_000);if(first.error)return{status:'fail',detail:'第一处没有讲解',error:first.error};
 if(stops<2)return{status:'review',detail:'只有一个切入点，无法验证自动前进',answer:first.text};
 const title=await page.locator('.surfing-stops li.is-current button').first().innerText();
 const moved=await expect.poll(async()=>(await page.locator('.surfing-stops li.is-current button').first().innerText())!==title,{timeout:200_000}).toBe(true).then(()=>true,()=>false);
 const viewer=page.locator('#viewerContainer'),box=(await viewer.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,150);
 const stopped=await page.getByRole('button',{name:'继续带读',exact:true}).isVisible({timeout:5000}).catch(()=>false);
 return{status:moved&&stopped?'pass':'fail',detail:`第一处已讲解 · ${moved?'自动前进到下一处':'没有自动前进'} · ${stopped?'滚动后已暂停':'滚动后没有暂停'}`,answer:first.text};
}

function report(manifest:Manifest|null){
 const passed=results.filter(r=>r.status==='pass').length,history=path.join(base,'history.jsonl');
 if(manifest&&results.length>1)appendFileSync(history,JSON.stringify({stamp,benchmark:manifest.name,model:facts['模型'],service:facts['接口'],passed,total:results.length,checks:Object.fromEntries(results.map(r=>[r.id,r.status]))})+'\n');
 const past=existsSync(history)?readFileSync(history,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(h=>h.benchmark===manifest?.name).slice(-10).reverse():[];
 const badge={pass:['通过','#3f6b3a','#e5ebdc'],fail:['失败','#984330','#f8e9e0'],review:['需人工确认','#8a5a1c','#f4ead9'],skip:['跳过','#6f766b','#efebe2']} as const;
 const esc=(s='')=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
 const rows=results.map(r=>`<tr><td>${esc(r.name)}</td><td><span class="b" style="color:${badge[r.status][1]};background:${badge[r.status][2]}">${badge[r.status][0]}</span></td><td>${esc(r.detail)}${r.answer?`<blockquote>${esc(r.answer)}</blockquote>`:''}${r.error?`<p class="err">${esc(r.error)}</p>`:''}</td><td>${(r.ms/1000).toFixed(1)} s</td><td>${r.shot?`<a href="${r.shot}"><img src="${r.shot}"></a>`:''}</td></tr>`).join('');
 const runs=past.map(h=>`<tr><td>${esc(h.stamp)}</td><td>${esc(h.model)}</td><td>${esc(h.service)}</td><td>${h.passed} / ${h.total}</td></tr>`).join('');
 writeFileSync(path.join(out,'report.html'),`<!doctype html><meta charset="utf-8"><title>Enlumor 真实模型验收</title><style>body{font:14px/1.6 system-ui,'Microsoft YaHei UI',sans-serif;margin:32px;color:#22282a;background:#fbf9f5}table{border-collapse:collapse;width:100%;margin-bottom:28px}td,th{border-bottom:1px solid #e4dfd5;padding:10px;vertical-align:top;text-align:left}img{width:260px;border:1px solid #e4dfd5}blockquote{margin:6px 0;padding:6px 10px;background:#f4f1ea;border-left:3px solid #9c6a2f;white-space:pre-wrap}.err{color:#984330}.b{padding:2px 8px;border-radius:10px;white-space:nowrap}</style>
<h1>Enlumor 真实模型验收</h1><p><b>基准</b> ${esc(manifest?.name||'未读取')} · ${Object.entries(facts).map(([k,v])=>`<b>${esc(k)}</b> ${esc(v)}`).join(' · ')}</p><p><b>得分 ${passed} / ${results.length}</b>；报告不含 API 密钥。</p>
<table><tr><th>检查</th><th>结果</th><th>说明与模型原话</th><th>耗时</th><th>截图</th></tr>${rows}</table>${runs?`<h2>同一基准的最近几次</h2><table><tr><th>时间</th><th>模型</th><th>服务</th><th>得分</th></tr>${runs}</table>`:''}`);
 writeFileSync(path.join(out,'report.json'),JSON.stringify({benchmark:manifest?.name,facts,results},null,2));
}

test('real model benchmark',async()=>{
 test.setTimeout(30*60_000);
 if(!endpoint)throw Error('请设置 ENLUMOR_ACCEPTANCE_ENDPOINT（接口地址）');
 mkdirSync(out,{recursive:true});
 const pdf=benchmarkPdf(),manifest=validateBenchmarkManifest(JSON.parse(execFileSync(python,[tool,'read',pdf],{encoding:'utf8'})));
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+mkdtempSync(path.join(tmpdir(),'enlumor-acceptance-'))],env:{...process.env,ENLUMOR_PYTHON:python,ENLUMOR_ACCEPTANCE_KEY:''}});
 const page=await app.firstWindow();await page.setViewportSize({width:1440,height:900});
 // Unattended runs: another window taking focus must not count as the reader leaving (the app pauses Surfing on blur).
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].removeAllListeners('blur'));
 let vision=false;
 try{
  facts['接口']=new URL(endpoint).origin;facts['协议']=protocol;
  await record(page,{id:'connect',title:'连接与模型发现'},async()=>{
   const draft={id:'acceptance',name:'验收',protocol,endpoint,model:wanted||'',maxOutputTokens:Number(process.env.ENLUMOR_ACCEPTANCE_MAX_OUTPUT||2048),timeoutMs:120000,parameters:{},...(key?{credential:{kind:'api-key' as const,apiKey:key}}:{})};
   let models:{id:string;contextWindow?:number}[]=[],discovery='';
   try{const r:any=await page.evaluate(d=>window.enlumor.discoverAiModels({draft:d}),draft);if(r.ok)models=r.value;else discovery=r.error?.code||'';}catch(e){discovery=String(e);}
   const model=wanted||pickDefaultModel(models.map(m=>m.id))||'';if(!model)return{status:'fail',detail:'没有读到模型列表，也没有指定模型 ID',error:discovery};
   const win=resolveContextWindow(model,models.find(m=>m.id===model)?.contextWindow);vision=canSeeImages({model});
   Object.assign(facts,{'模型':model,'窗口':`${win.tokens}（${win.source}）`,'看图':vision?'能':'不能'});
   const saved:any=await page.evaluate(d=>window.enlumor.saveAiProfile(d),{...draft,model,contextWindowTokens:win.tokens});if(!saved.ok)return{status:'fail',detail:'保存配置失败',error:saved.error?.code};
   const tested:any=await page.evaluate(()=>window.enlumor.testAiProfile('acceptance'));
   return tested.ok?{status:'pass',detail:`读到 ${models.length} 个模型${discovery?`（模型列表未读取：${discovery}）`:''}；连接测试成功`}:{status:'fail',detail:'连接测试失败',error:tested.error?.code||tested.error?.message};
  });
  if(results[0].status==='fail')return;
  await record(page,{id:'prepare',title:'打开论文并准备全文'},async()=>{
   await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]});},pdf);
   await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible({timeout:60_000});
   await page.getByRole('button',{name:'打开 Surfing',exact:true}).click();await expect(page.getByLabel('Surfing 状态',{exact:true})).toHaveText('已准备文字',{timeout:90_000});
   await page.getByLabel('确认将当前论文提取文字发送给所选服务',{exact:true}).check();
   return{status:'pass',detail:(await page.locator('.surfing-coverage').innerText().catch(()=>'')).trim()||'已准备'};
  });
  if(results[1].status==='fail')return;
  for(const c of manifest.checks)await record(page,c,()=>c.kind==='ask'?askCheck(page,c,vision):c.kind==='route'?routeCheck(page,c):guidedCheck(page,c));
 }finally{report(manifest);await app.evaluate(({app})=>app.exit(0)).catch(()=>{});console.log('ACCEPTANCE REPORT '+path.join(out,'report.html'));}
});
