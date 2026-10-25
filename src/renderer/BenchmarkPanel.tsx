import {useEffect,useRef,useState} from 'react';
import type {OpenedDocument} from '../shared/model';
import {unwrap} from '../shared/model';
import type {AiProfileView} from '../shared/ai';
import type {SurfingContext} from '../shared/surfing-context';
import type {SurfingRuntimeEvent} from '../main/surfing-runtime';
import {canSeeImages} from '../shared/ai-models';
import {suggestedSurfingContextWindow} from '../main/surfing-tokenizer-models';
import {gradeBenchmarkAnswer,gradeBenchmarkRoute,type BenchmarkCheck,type BenchmarkManifest,type BenchmarkStatus} from '../shared/benchmark';

type Result={id:string;title:string;status:BenchmarkStatus|'running'|'waiting';detail:string;answer?:string;seconds?:number};
type Run={at:string;model:string;passed:number;total:number};
const label:Record<Result['status'],string>={pass:'通过',fail:'失败',review:'需人工确认',skip:'跳过',running:'进行中',waiting:'等待'};
const historyKey=(name:string)=>'enlumor.benchmark.'+name;
function readHistory(name:string):Run[]{try{const v=JSON.parse(localStorage.getItem(historyKey(name))||'[]');return Array.isArray(v)?v.slice(0,10):[];}catch{return[];}}
function writeHistory(name:string,runs:Run[]){try{localStorage.setItem(historyKey(name),JSON.stringify(runs.slice(0,10)));}catch{/* per-viewer convenience only */}}

/** Test mode for a benchmark PDF: runs the manifest's checks through the same Surfing services readers use. */
export function BenchmarkPanel({document:doc,manifest,onExit,onSettings}:{document:OpenedDocument;manifest:BenchmarkManifest;onExit:()=>void;onSettings:()=>void}){
 const [profiles,setProfiles]=useState<AiProfileView[]>([]),[profileId,setProfileId]=useState(''),[consent,setConsent]=useState(false),[running,setRunning]=useState(false);
 const [results,setResults]=useState<Result[]>(()=>manifest.checks.map(c=>({id:c.id,title:c.title,status:'waiting',detail:''}))),[copied,setCopied]=useState(''),[history,setHistory]=useState(()=>readHistory(manifest.name));
 const pending=useRef(new Map<string,{resolve:(e:SurfingRuntimeEvent)=>void;steps:string[]}>()),context=useRef<SurfingContext['context']|null>(null),stopped=useRef(false),halted=useRef<'stopped'|'background'|null>(null),mounted=useRef(true);
 const profile=profiles.find(p=>p.id===profileId);
 useEffect(()=>{mounted.current=true;
  void window.enlumor.listAiProfiles().then(r=>{const list=unwrap(r);if(!mounted.current)return;setProfiles(list);setProfileId(id=>id||list[0]?.id||'');}).catch(()=>{});
  const off=window.enlumor.onSurfingText(event=>{const p=pending.current.get(event.requestId);if(!p||event.type==='thinking')return;if(event.type==='step'){p.steps.push(event.note);return;}pending.current.delete(event.requestId);p.resolve(event);});
  // The app cancels model requests when its window goes to the background; the run stops instead of waiting forever.
  const offBackground=window.enlumor.onAppBackground(()=>{if(pending.current.size)halt('background');});
  return()=>{mounted.current=false;off();offBackground();stopped.current=true;const c=context.current;if(c){void window.enlumor.cancelSurfing(c);void window.enlumor.deactivateSurfing(c);}};
 },[]);
 /** A cancelled request sends no final event, so whatever is still waiting is answered here and the run stops. */
 function halt(why:'stopped'|'background'){
  stopped.current=true;halted.current=why;
  for(const [id,p] of pending.current){pending.current.delete(id);p.resolve({requestId:id,type:'error',code:'AI_CANCELLED'});}
 }
 const update=(id:string,patch:Partial<Result>)=>{if(mounted.current)setResults(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));};
 /** Sends one request and waits for its own final event (answer, route, explanation or error). */
 function request(send:(requestId:string)=>Promise<unknown>){
  const id=crypto.randomUUID();
  return new Promise<{event:SurfingRuntimeEvent;steps:string[]}>((resolve,reject)=>{const steps:string[]=[];pending.current.set(id,{resolve:event=>resolve({event,steps}),steps});send(id).then(r=>unwrap(r as any)).catch(e=>{pending.current.delete(id);reject(e);});});
 }
 async function runCheck(c:BenchmarkCheck,base:{profileId:string;context:SurfingContext['context'];contextWindowTokens:number},vision:boolean,route:{stops:number}):Promise<Omit<Result,'id'|'title'>>{
  const req=(requestId:string)=>({requestId,profileId:base.profileId,context:base.context,consent:true as const});
  if(c.kind==='ask'){
   const {event,steps}=await request(id=>window.enlumor.askSurfing({request:{...req(id),question:c.question!,pageIndex:0},contextWindowTokens:base.contextWindowTokens}));
   if(event.type==='error')return{status:'fail',detail:'没有得到回答：'+event.code};
   if(event.type!=='answer')return{status:'fail',detail:'意外的结果'};
   return{...gradeBenchmarkAnswer(c,vision,event.explanation.text,event.explanation.passageIds.length,steps),answer:event.explanation.text};
  }
  if(c.kind==='route'){
   const {event}=await request(id=>window.enlumor.generateSurfingRoute({request:req(id),contextWindowTokens:base.contextWindowTokens}));
   if(event.type!=='route')return{status:'fail',detail:'没有生成切入点'+(event.type==='error'?'：'+event.code:'')};
   route.stops=event.route.stops.length;
   return{...gradeBenchmarkRoute(c,event.route.stops),answer:event.route.stops.map((s,i)=>`${i+1}. ${s.title}`).join('\n')};
  }
  // Guided reading in test mode: explain the first two stops in turn, at the manifest's depth.
  if(route.stops<1)return{status:'skip',detail:'没有切入点，无法带读'};
  const texts:string[]=[];
  for(let i=0;i<Math.min(2,route.stops);i++){
   const {event}=await request(id=>window.enlumor.explainSurfingStop({request:{...req(id),stopIndex:i,...(c.depth?{depth:c.depth}:{})},contextWindowTokens:base.contextWindowTokens}));
   if(event.type!=='explanation')return{status:'fail',detail:`第 ${i+1} 处没有讲解`+(event.type==='error'?'：'+event.code:''),answer:texts.join('\n\n')};
   texts.push(`${i+1}. ${event.explanation.text}`);
  }
  return{status:texts.length>=2?'pass':'review',detail:texts.length>=2?'依次讲解了前两处切入点':'只有一个切入点',answer:texts.join('\n\n')};
 }
 async function run(){
  if(!profile||!consent||running)return;stopped.current=false;halted.current=null;setRunning(true);setCopied('');
  setResults(manifest.checks.map(c=>({id:c.id,title:c.title,status:'waiting',detail:''})));
  const vision=canSeeImages(profile),contextWindowTokens=suggestedSurfingContextWindow(profile),route={stops:0};let passed=0;
  try{
   let snapshot=unwrap(await window.enlumor.prepareSurfing(doc.id));context.current=snapshot.context;
   for(const c of manifest.checks){
    if(stopped.current){update(c.id,{status:'skip',detail:stopNote()});continue;}
    update(c.id,{status:'running',detail:''});const started=Date.now();
    // Each question starts without earlier answers in the dialogue, so checks do not lean on one another.
    if(c.kind==='ask'){snapshot=unwrap(await window.enlumor.prepareSurfing(doc.id));context.current=snapshot.context;}
    let r:Omit<Result,'id'|'title'>;try{r=await runCheck(c,{profileId:profile.id,context:snapshot.context,contextWindowTokens},vision,route);}catch(e){r={status:'fail',detail:e instanceof Error?e.message:String(e)};}
    if(halted.current&&r.status!=='pass')r={status:'skip',detail:stopNote()};
    if(r.status==='pass')passed++;update(c.id,{...r,seconds:Math.round((Date.now()-started)/1000)});
   }
   // A stopped run is not a score.
   if(!halted.current){const runs=[{at:new Date().toLocaleString(),model:profile.model,passed,total:manifest.checks.length},...readHistory(manifest.name)];writeHistory(manifest.name,runs);if(mounted.current)setHistory(runs.slice(0,10));}
  }catch(e){if(mounted.current)setResults(rs=>rs.map(r=>r.status==='waiting'||r.status==='running'?{...r,status:'fail',detail:'准备全文失败：'+(e instanceof Error?e.message:String(e))}:r));}
  finally{if(mounted.current)setRunning(false);}
 }
 const stopNote=()=>halted.current==='background'?'窗口切到了后台，测试已停止；回到窗口后可以重新测试':'已停止';
 function stop(){const c=context.current;if(c)void window.enlumor.cancelSurfing(c);halt('stopped');}
 async function copy(){
  const lines=[`Enlumor 测试：${manifest.name}`,`模型：${profile?.model||''} · ${profile?.endpoint?new URL(profile.endpoint).origin:''} · ${profile&&canSeeImages(profile)?'能看图':'只读文字'}`,`得分：${results.filter(r=>r.status==='pass').length} / ${results.length}`,'',...results.map(r=>`[${label[r.status]}] ${r.title}${r.seconds!==undefined?`（${r.seconds} 秒）`:''}\n  ${r.detail}${r.answer?`\n  模型原话：${r.answer.replace(/\n/g,'\n  ')}`:''}`)];
  try{await navigator.clipboard.writeText(lines.join('\n'));setCopied('已复制，可直接粘贴发送');}catch{setCopied('复制失败，请手动选择文字');}
 }
 const done=!running&&results.some(r=>r.status!=='waiting'),passed=results.filter(r=>r.status==='pass').length;
 return <section className="surfing-panel benchmark-panel" aria-label="测试模式">
  <header><div><strong>测试模式</strong><span>{manifest.name} · {manifest.checks.length} 项检查</span></div><button onClick={()=>{stop();onExit();}} aria-label="退出测试模式">退出</button></header>
  <p className="surfing-scope">这份 PDF 自带测试题（末页二维码与内嵌清单）。测试会用所选服务回答这些题目，并逐项核对答案。</p>
  <div className="surfing-controls">
   <label>服务<select aria-label="测试服务" value={profileId} disabled={running} onChange={e=>setProfileId(e.target.value)}>{profiles.length===0&&<option value="">尚未配置</option>}{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label>
   <button onClick={onSettings} disabled={running}>配置模型</button>
  </div>
  {profile&&<p className="surfing-help">{canSeeImages(profile)?'能看图：看图题要求模型先查看页面。':'只读文字：看图题检查它是否如实说明看不到图。'}</p>}
  <label className="surfing-consent"><input type="checkbox" aria-label="确认发送全文进行测试" checked={consent} disabled={running} onChange={e=>setConsent(e.target.checked)}/>我确认将《{doc.name}》的全部已提取文字发送给所选服务进行测试。</label>
  <div className="surfing-actions">{running?<button onClick={stop}>停止测试</button>:<button className="benchmark-start" disabled={!profile||!consent} onClick={()=>void run()}>{done?'重新测试':'开始测试'}</button>}{done&&<button onClick={()=>void copy()}>复制结果</button>}{done&&<span role="status" aria-label="测试得分">得分 {passed} / {results.length}</span>}{copied&&<span className="surfing-help">{copied}</span>}</div>
  <ol className="benchmark-results" aria-label="测试结果">{results.map(r=><li key={r.id} className={'is-'+r.status}><div><span className="benchmark-badge">{label[r.status]}</span><strong>{r.title}</strong>{r.seconds!==undefined&&<small>{r.seconds} 秒</small>}</div>{r.detail&&<p>{r.detail}</p>}{r.answer&&<blockquote>{r.answer}</blockquote>}</li>)}</ol>
  {history.length>0&&<details className="surfing-route-details"><summary>最近几次（{history.length}）</summary><ul className="benchmark-history">{history.map((h,i)=><li key={i}>{h.at} · {h.model} · {h.passed} / {h.total}</li>)}</ul></details>}
 </section>;
}
