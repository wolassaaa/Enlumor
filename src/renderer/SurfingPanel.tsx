import type {SurfingSaveInput} from '../main/surfing-runtime';
import {useEffect,useRef,useState} from 'react';
import type {OpenedDocument} from '../shared/model';
import {unwrap} from '../shared/model';
import type {AiProfileView} from '../shared/ai';
import type {SurfingContext} from '../shared/surfing-context';
import type {SurfingRoute} from '../shared/surfing-route';
import type {SurfingExplanation} from '../main/surfing-requests';
import {suggestedSurfingContextWindow} from '../main/surfing-tokenizer-models';
// A window the reader typed for one service and model; the model settings hold the discovered value.
const windowKey=(profile:{id:string;model:string})=>'enlumor.surfing.window.'+profile.id+'|'+profile.model;
function rememberedWindow(profile:{id:string;model:string}){try{const v=Number(localStorage.getItem(windowKey(profile)));return Number.isSafeInteger(v)&&v>0?v:null;}catch{return null;}}
function rememberWindow(profile:{id:string;model:string}|undefined,value:string){try{if(profile&&Number.isSafeInteger(Number(value))&&Number(value)>0)localStorage.setItem(windowKey(profile),value);}catch{/* per-viewer convenience only */}}
import type {SurfingDepth} from '../main/surfing-requests';
// Guided reading preferences are the reader's own; 30 seconds per stop unless they choose otherwise.
const DEFAULT_DWELL=30,PLAY_REQUEST_LIMIT=20;
function readPreference<T>(key:string,valid:(v:unknown)=>v is T,fallback:T):T{try{const v=JSON.parse(localStorage.getItem('enlumor.surfing.'+key)||'null');return valid(v)?v:fallback;}catch{return fallback;}}
function writePreference(key:string,value:unknown){try{localStorage.setItem('enlumor.surfing.'+key,JSON.stringify(value));}catch{/* per-viewer convenience only */}}
const validDwell=(v:unknown):v is number=>Number.isInteger(v)&&(v as number)>=5&&(v as number)<=600,validDepth=(v:unknown):v is SurfingDepth=>v==='concise'||v==='standard'||v==='detailed';
import {createSurfingCommandHost} from './surfing-command-host';
import type {PdfReader} from './pdf-reader';
const labels:Record<string,string>={idle:'尚未准备',preparing:'准备本地文字中',prepared:'已准备文字',loading:'生成探索路线中',explaining:'解释中',ready:'等待你的选择',paused:'已暂停',error:'需要处理'};
export function SurfingPanel({document:doc,reader,takeover,takeoverRef,flushRef,settingsOpen,onSettings,onExit,pageIndex}:{document:OpenedDocument;reader:PdfReader;takeover:number;takeoverRef:{current:(()=>void)|null};flushRef:{current:(()=>Promise<void>)|null};settingsOpen:boolean;pageIndex:number;onSettings:()=>void;onExit:()=>void}){
 const [status,setStatus]=useState('idle'),[error,setError]=useState(''),[snapshot,setSnapshot]=useState<SurfingContext|null>(null),[route,setRoute]=useState<SurfingRoute|null>(null),[profiles,setProfiles]=useState<AiProfileView[]>([]),[profileId,setProfileId]=useState(''),[capacity,setCapacity]=useState(''),[consent,setConsent]=useState(false),[selected,setSelected]=useState<number|null>(null),[answers,setAnswers]=useState<Record<number,SurfingExplanation>>({});
 const [question,setQuestion]=useState(''),[conversation,setConversation]=useState<{question:string;explanation:SurfingExplanation}[]>([]);
 const [stepNote,setStepNote]=useState(''),[playing,setPlaying]=useState(false),[playNote,setPlayNote]=useState(''),[remaining,setRemaining]=useState<number|null>(null),[dwell,setDwell]=useState(()=>readPreference('dwell',validDwell,DEFAULT_DWELL)),[depth,setDepth]=useState<SurfingDepth>(()=>readPreference('depth',validDepth,'standard'));
 const [saveStatus,setSaveStatus]=useState('尚未保存'),[saveError,setSaveError]=useState('');
 const routeRevision=useRef(0),pendingSave=useRef<SurfingSaveInput|null>(null),saveRunning=useRef(false),saveFlight=useRef<Promise<void>>(Promise.resolve());
 const panel=useRef<HTMLElement>(null),playingRef=useRef(false),playRequests=useRef(0),dwellTimer=useRef<ReturnType<typeof setInterval>|null>(null),waitingAdvance=useRef(false),selectedRef=useRef(selected),profilesRef=useRef(profiles),capacityRef=useRef(capacity),mounted=useRef(true),epoch=useRef(0),preparing=useRef(0),source=useRef(snapshot),profileRef=useRef(profileId),routeRef=useRef(route),answersRef=useRef(answers),lastTakeover=useRef(takeover);source.current=snapshot;profileRef.current=profileId;profilesRef.current=profiles;capacityRef.current=capacity;routeRef.current=route;answersRef.current=answers;selectedRef.current=selected;
 const job=useRef<{id:string;profileId:string;source:SurfingContext;index?:number;question?:string}|null>(null),host=useRef<ReturnType<typeof createSurfingCommandHost>|null>(null);
 host.current??=createSurfingCommandHost(()=>reader,()=>doc,()=>source.current);
 const selectedProfile=profiles.find(p=>p.id===profileId),supported=!!selectedProfile,busy=status==='preparing'||status==='loading'||status==='explaining';
 function persist():Promise<void>{
  if(saveRunning.current)return saveFlight.current.then(()=>pendingSave.current?persist():undefined);if(!pendingSave.current)return Promise.resolve();saveRunning.current=true;
  const task=(async()=>{while(pendingSave.current){const request=pendingSave.current;if(mounted.current)setSaveStatus('保存中');try{unwrap(await window.enlumor.saveSurfingProgress(request));}catch(e){if(pendingSave.current!==request)continue;if(mounted.current){setSaveStatus('保存失败');setSaveError(e instanceof Error?e.message:String(e));}throw e;}if(pendingSave.current===request)pendingSave.current=null;if(mounted.current&&routeRef.current&&routeRevision.current===request.routeRevision){setSaveStatus('已保存');setSaveError('');}}})();
  saveFlight.current=task.finally(()=>{saveRunning.current=false;});return saveFlight.current;
 }
 function queueSave(index:number|null){const current=source.current;if(!current||!routeRef.current||routeRevision.current<1)return;pendingSave.current={context:{...current.context},routeRevision:routeRevision.current,selected:index};setSaveStatus('保存中');void persist().catch(()=>{});}
 async function close(){pause();try{await persist();onExit();}catch{/* saved error and visible progress remain */}}
 async function openSettings(){pause();try{await persist();onSettings();}catch{/* keep progress visible */}}
 async function changeProfile(id:string){pause();const version=++epoch.current;try{await persist();}catch{return;}if(!mounted.current||version!==epoch.current)return;setProfileId(id);profileRef.current=id;setConversation([]);setConsent(false);setRoute(null);routeRef.current=null;setAnswers({});answersRef.current={};setSelected(null);routeRevision.current=0;setSaveStatus('尚未保存');}
 function stopPlaying(){playingRef.current=false;waitingAdvance.current=false;if(dwellTimer.current)clearInterval(dwellTimer.current);dwellTimer.current=null;if(mounted.current){setPlaying(false);setRemaining(null);}}
 function pause(){stopPlaying();setStepNote('');epoch.current++;const active=job.current;job.current=null;host.current?.invalidate();const s=source.current;if(s&&active)void window.enlumor.cancelSurfing(s.context);if(mounted.current)setStatus('paused');}
 /** Scrolling, takeover and backgrounding pause model work only; local text preparation is allowed to finish. */
 function interrupt(){if(preparing.current&&!job.current)return;pause();}
 /** The service says the prompt does not fit: adopt the window it states (or a smaller guess), remember it, and let the reader retry. */
 function lowerWindow(code:string){
  // Called from the long-lived text listener, so read current state through refs.
  const profile=profilesRef.current.find(p=>p.id===profileRef.current),current=Number(capacityRef.current)||0,stated=Number(code.split('_').pop());
  // A stated window below ours is the real limit; otherwise our estimate was low, so tighten the budget.
  const next=Number.isSafeInteger(stated)&&stated>=1024&&(!current||stated<current)?stated:Math.max(1024,Math.floor((current||128000)*0.8));
  setCapacity(String(next));rememberWindow(profile,String(next));
  if(profile){const {hasCredential:_h,credentialStorage:_c,verification:_v,...metadata}=profile;void window.enlumor.saveAiProfile({...metadata,contextWindowTokens:next}).then(()=>window.enlumor.listAiProfiles()).then(reply=>{if(mounted.current)setProfiles(unwrap(reply));}).catch(()=>{});}
  fail(Error(`这篇论文超出了该模型的实际上下文窗口，已将窗口调整为 ${next} tokens，请重试。`));
 }
 function fail(value:unknown){stopPlaying();if(mounted.current){setError(value instanceof Error?value.message:String(value));setStatus('error');}}
 async function prepare(){setConversation([]);pause();const version=++epoch.current;try{await persist();}catch{return;}if(!mounted.current||epoch.current!==version)return;setSnapshot(null);source.current=null;setRoute(null);routeRef.current=null;setAnswers({});answersRef.current={};setSelected(null);setError('');setSaveError('');setSaveStatus('尚未保存');routeRevision.current=0;setConsent(false);setStatus('preparing');preparing.current=version;
  try{const next=unwrap(await window.enlumor.prepareSurfing(doc.id).finally(()=>{if(preparing.current===version)preparing.current=0;}));if(!mounted.current||epoch.current!==version)return;source.current=next;setSnapshot(next);setStatus('prepared');
   try{const restored=unwrap(await window.enlumor.getSavedSurfingProgress(next.context));if(!mounted.current||epoch.current!==version)return;if(restored){const saved=restored.session;routeRef.current=saved.route;setRoute(saved.route);routeRevision.current=restored.routeRevision;setSelected(saved.selected);answersRef.current=saved.answers;setAnswers(saved.answers);profileRef.current=saved.source.profileId;setProfileId(saved.source.profileId);setCapacity(String(saved.contextWindowTokens));setConsent(false);setSaveStatus('已保存');setStatus('paused');}}
   catch(e){if(mounted.current&&epoch.current===version){setSaveStatus('未恢复');setSaveError('保存的进度未恢复：'+(e instanceof Error?e.message:String(e)));}}
  }catch(e){if(mounted.current&&epoch.current===version)fail(e);}
 }
 async function submit(index?:number){const s=source.current;if(!s||job.current)return;if(!consent||!selectedProfile||!supported||!Number.isSafeInteger(Number(capacity))||Number(capacity)<1){fail(Error('请确认服务、模型上下文窗口和全文发送范围。'));return;}
  if(index===undefined){const version=epoch.current;try{await persist();}catch{return;}if(!mounted.current||source.current!==s||job.current||epoch.current!==version)return;setSaveStatus('等待新路线');setRoute(null);routeRef.current=null;setSelected(null);setAnswers({});answersRef.current={};}
  if(playingRef.current&&index!==undefined&&++playRequests.current>PLAY_REQUEST_LIMIT){stopPlaying();setError(`本次带读已解释 ${PLAY_REQUEST_LIMIT} 处，已暂停；点「继续带读」接着读。`);return;}
  const id=crypto.randomUUID();job.current={id,profileId,source:s,index};setError('');setStatus(index===undefined?'loading':'explaining');
  const request={requestId:id,profileId,context:s.context,consent:true as const},input={request,contextWindowTokens:Number(capacity)};
  try{unwrap(index===undefined?await window.enlumor.generateSurfingRoute(input):await window.enlumor.explainSurfingStop({...input,request:{...request,stopIndex:index,depth}}));}catch(e){if(mounted.current&&job.current?.id===id){job.current=null;fail(e);}}
 }
 async function ask(text=question){
  const s=source.current;if(!s||!text.trim())return;
  if(!consent||!selectedProfile||!supported||!Number.isSafeInteger(Number(capacity))||Number(capacity)<1){fail(Error('请在阅读范围与服务设置中确认模型窗口和全文发送。'));return;}
  pause();const id=crypto.randomUUID();job.current={id,profileId,source:s,question:text.trim()};setError('');setStatus('explaining');
  try{unwrap(await window.enlumor.askSurfing({request:{requestId:id,profileId,context:s.context,consent:true,question:text.trim(),pageIndex},contextWindowTokens:Number(capacity)}));}catch(e){if(mounted.current&&job.current?.id===id){job.current=null;fail(e);}}
 }
 async function choose(index:number,explain=true,auto=false){const r=routeRef.current,s=source.current;if(!r?.stops[index]||!s)return;const keep=auto&&playingRef.current;pause();if(keep){playingRef.current=true;setPlaying(true);}const version=++epoch.current;setSelected(index);queueSave(index);setError('');const block=s.passages.find(p=>p.id===r.stops[index].passageIds[0]);if(!block){fail(Error('SURFING_SOURCE_INVALID'));return;}
  const result=await host.current!.run({type:'show_evidence',pageIndex:block.pageIndex,passageId:block.id});if(!mounted.current||version!==epoch.current)return;if(!result.ok){fail(Error(result.error.message));return;}
  if(explain&&!answersRef.current[index])await submit(index);else setStatus('ready');
 }
 useEffect(()=>{mounted.current=true;takeoverRef.current=interrupt;const flush=async()=>{await persist();if(pendingSave.current)throw Error('SURFING_UNSAVED_PROGRESS');};flushRef.current=flush;
  const off=window.enlumor.onSurfingText(event=>{const j=job.current;if(!mounted.current||!j||event.requestId!==j.id||source.current!==j.source||profileRef.current!==j.profileId)return;if(event.type==='step'){setStepNote(event.note);return;}job.current=null;setStepNote('');if(event.type==='error'){if(event.code?.startsWith('AI_CONTEXT_OVERFLOW')){lowerWindow(event.code);return;}fail(Error(event.code));return;}if(event.type==='answer'){setConversation(previous=>[...previous,{question:event.question,explanation:event.explanation}].slice(-6));setQuestion(previous=>previous.trim()===event.question?'':previous);}else if(event.type==='route'){routeRevision.current=event.routeRevision;routeRef.current=event.route;setRoute(event.route);setAnswers({});answersRef.current={};setSelected(null);queueSave(null);}else if(event.type==='explanation'){const next={...answersRef.current,[event.stopIndex]:event.explanation};answersRef.current=next;setAnswers(next);queueSave(selectedRef.current??event.stopIndex);}setStatus('ready');});
  const background=()=>{if(window.document.hidden)interrupt();};window.document.addEventListener('visibilitychange',background);const offBackground=window.enlumor.onAppBackground(interrupt);
  return()=>{if(flushRef.current===flush)flushRef.current=null;if(takeoverRef.current===interrupt)takeoverRef.current=null;mounted.current=false;epoch.current++;job.current=null;off();offBackground();window.document.removeEventListener('visibilitychange',background);host.current?.invalidate();const s=source.current;if(s)void window.enlumor.deactivateSurfing(s.context);};
 },[doc.id,reader]);
 useEffect(()=>{if(takeover!==lastTakeover.current){lastTakeover.current=takeover;interrupt();}},[takeover]);
 useEffect(()=>{let active=true;if(settingsOpen){pause();setConversation([]);setConsent(false);setRoute(null);routeRef.current=null;setAnswers({});setSelected(null);}else void window.enlumor.listAiProfiles().then(reply=>{if(!mounted.current||!active)return;const p=unwrap(reply);setProfiles(p);setProfileId(p.some(x=>x.id===profileRef.current)?profileRef.current:p[0]?.id||'');}).catch(fail);return()=>{active=false;};},[settingsOpen]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>reader.fit('page-width'));return()=>cancelAnimationFrame(frame);},[doc.id,reader]);
 // A recognised model starts with the reader's last value or a conservative suggestion, never overwriting a typed or restored one.
 useEffect(()=>{if(!selectedProfile)return;const value=rememberedWindow(selectedProfile)??suggestedSurfingContextWindow(selectedProfile);if(value)setCapacity(c=>c||String(value));},[selectedProfile?.id,selectedProfile?.model]);
 // Preparing the text is local and sends nothing, so it starts as soon as the panel opens.
 useEffect(()=>{void prepare();},[doc.id]);
 /** Guided reading: explain the current stop, dwell, prepare the next one meanwhile, then move on. Any takeover pauses it. */
 function startDwell(){
  if(dwellTimer.current)clearInterval(dwellTimer.current);const end=Date.now()+dwell*1000;setRemaining(dwell);
  dwellTimer.current=setInterval(()=>{const left=Math.max(0,Math.ceil((end-Date.now())/1000));setRemaining(left);if(left>0)return;clearInterval(dwellTimer.current!);dwellTimer.current=null;advance();},250);
 }
 function advance(){
  const r=routeRef.current,current=selectedRef.current;if(!playingRef.current||!r||current===null)return;
  const next=current+1;if(next>=r.stops.length){stopPlaying();setStatus('ready');setPlayNote('已带读完所有切入点');return;}
  if(answersRef.current[next]){waitingAdvance.current=false;void choose(next,false,true);}else{waitingAdvance.current=true;setRemaining(0);if(!job.current)void submit(next);}
 }
 function play(){
  const r=routeRef.current;if(!r||!consent)return;setPlayNote('');playRequests.current=0;playingRef.current=true;setPlaying(true);setError('');
  const at=selectedRef.current??0;if(selectedRef.current===null)void choose(at,true,true);else if(answersRef.current[at])startDwell();else void submit(at);
 }
 // When the shown stop has its explanation, dwell on it and prepare the next stop in the background.
 useEffect(()=>{
  if(!playing||selected===null||!answers[selected]||status!=='ready')return;
  if(waitingAdvance.current&&answers[selected+1]){waitingAdvance.current=false;void choose(selected+1,false,true);return;}
  if(!dwellTimer.current&&!waitingAdvance.current&&remaining===null){startDwell();const next=selected+1;if(routeRef.current?.stops[next]&&!answersRef.current[next]&&!job.current)void submit(next);}
 },[playing,selected,answers,status,remaining]);
 useEffect(()=>()=>{if(dwellTimer.current)clearInterval(dwellTimer.current);},[]);
 // Keep the stop the reader is on, and its explanation, in view instead of below the conversation.
 useEffect(()=>{if(selected===null)return;panel.current?.querySelector('.surfing-stops li.is-current')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});},[selected,answers]);
 const answer=selected===null?null:answers[selected];
 return <section ref={panel} className="surfing-panel" aria-label="Surfing 共读"><header><div><strong>Surfing</strong><span>读整篇，随时问，回到原文。</span></div><button onClick={()=>void close()} aria-label="关闭 Surfing">关闭</button></header>
 <p className="surfing-scope">{doc.name} · 只提取文字，不代表图表或公式视觉理解。准备文档不会发送网络请求。</p>
 <details className="surfing-setup" open={!route&&!consent}><summary>阅读范围与服务设置</summary><div className="surfing-controls"><button disabled={busy} onClick={()=>void prepare()}>准备本地全文</button><label>服务<select aria-label="Surfing 服务" value={profileId} disabled={busy} onChange={e=>void changeProfile(e.target.value)}>{profiles.length===0&&<option value="">尚未配置</option>}{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label><label>模型窗口<input aria-label="Surfing 模型上下文窗口（tokens）" type="number" min="1" max="10000000" placeholder="按服务文档填写" value={capacity} disabled={busy} onChange={e=>{setCapacity(e.target.value);rememberWindow(selectedProfile,e.target.value);}}/></label><button onClick={()=>void openSettings()}>配置模型</button></div>
 <p className="surfing-help">任何模型都可以使用：OpenAI 模型精确计数，其他模型按保守估算。窗口取自模型设置（服务商提供或内置资料）；若服务商提示超出上下文，会自动调低并记住。</p>
 {snapshot&&<p className="surfing-coverage">已读取 {snapshot.pageCount} 页 · {snapshot.passages.length} 段 · {snapshot.characterCount} 字符。{snapshot.emptyPages.length?`${snapshot.emptyPages.length} 页没有可提取文字；仅发送其余文字，非完整视觉内容。`:'每页均有文字，仍需核验提取顺序与原文。'}</p>}
 <label className="surfing-consent"><input type="checkbox" aria-label="确认将当前论文提取文字发送给所选服务" checked={consent} disabled={!snapshot||busy} onChange={e=>setConsent(e.target.checked)}/>我确认将《{doc.name}》的全部已提取文字发送给 {selectedProfile?.name||'所选服务'}（{selectedProfile?.endpoint||'尚未选择'}），不包含图像理解。</label></details>
 {error&&<p role="alert" className="surfing-error">{error} · 可调整配置后重新尝试；不会自动重试。</p>}
 {route&&<div className="surfing-player" aria-label="带着读">
  {playing?<button className="is-playing" onClick={pause}>暂停带读</button>:<button disabled={!consent||busy} onClick={play}>{selected===null?'开始带读':'继续带读'}</button>}
  <label>每处停留<input aria-label="每处停留秒数" type="number" min={5} max={600} value={dwell} onChange={e=>{const v=Math.round(Number(e.target.value));if(validDwell(v)){setDwell(v);writePreference('dwell',v);}}}/>秒</label>
  <label>解释<select aria-label="解释深度" value={depth} onChange={e=>{const v=e.target.value as SurfingDepth;setDepth(v);writePreference('depth',v);}}><option value="concise">简洁</option><option value="standard">标准</option><option value="detailed">详细</option></select></label>
  {!playing&&playNote&&<span className="surfing-countdown">{playNote}</span>}
  {playing&&<span className="surfing-countdown" role="timer">{waitingAdvance.current||remaining===0?'下一处准备中…':remaining!==null?`${remaining} 秒后到下一处`:'正在讲解…'}</span>}
 </div>}
 {route&&<><details className="surfing-route-details" open><summary>可选阅读切入点</summary><ol className="surfing-stops">{route.stops.map((stop,index)=><li key={stop.title} className={selected===index?'is-current':''} aria-current={selected===index?'step':undefined}><button onClick={()=>void choose(index)} aria-label={stop.title}>{index+1}. {stop.title}</button><p>{stop.reason}</p><small>{stop.passageIds.length} 处原文证据</small>{selected===index&&<div className="surfing-answer" aria-label="Surfing 解释">{answer?<><p>{answer.text}</p><div>{answer.passageIds.map(id=>{const b=snapshot?.passages.find(p=>p.id===id);return b&&<button key={id} onClick={()=>void host.current!.run({type:'show_evidence',pageIndex:b.pageIndex,passageId:id})}>核对第 {b.pageIndex+1} 页原文</button>;})}</div></>:<p>这一处还没有解释。你可以只看原文，也可以主动请求解释。</p>}</div>}</li>)}</ol></details><div className="surfing-actions"><button disabled={selected===null||selected===0} onClick={()=>void choose(selected!-1,false)}>回看上一处</button><button disabled={selected===null||selected>=route.stops.length-1} onClick={()=>void choose(selected!+1,false)}>跳过到下一处</button><button disabled={selected===null||selected>=route.stops.length-1} onClick={()=>void choose(selected!+1,true)}>继续探索</button>{selected!==null&&<button disabled={busy||!consent} onClick={()=>void submit(selected)}>解释这个切入点</button>}</div></>}
 <div className="surfing-conversation" aria-label="Surfing 对话">{conversation.length===0?<div className="surfing-welcome"><strong>我们从哪里开始？</strong><p>你可以直接问“摘要讲了什么”，也可以让我带你读懂整篇。每次回答都会结合已提取全文和最近对话，不局限于当前一小块。</p><button disabled={!snapshot||!consent||!supported||!capacity} onClick={()=>void ask('带我读懂这篇论文：先用中文讲清它研究什么、核心想法，以及建议从哪一段开始读。')}>带我读懂这篇</button></div>:conversation.map((turn,i)=><article key={i}><p className="surfing-question">{turn.question}</p><p className="surfing-response">{turn.explanation.text}</p><div className="surfing-evidence">{turn.explanation.passageIds.map(id=>{const b=snapshot?.passages.find(p=>p.id===id);return b&&<button key={id} title={b.quote} onClick={()=>{pause();void host.current!.run({type:'show_evidence',pageIndex:b.pageIndex,passageId:id});}}>对话原文 · 第 {b.pageIndex+1} 页</button>;})}</div></article>)}</div>
 <form className="surfing-composer" onSubmit={e=>{e.preventDefault();void ask();}}><label htmlFor="surfing-question">随时插话 · 当前第 {pageIndex+1} 页</label><textarea id="surfing-question" aria-label="Surfing 随时提问" maxLength={2000} rows={3} value={question} placeholder="给我讲讲这个 abstract…" onChange={e=>setQuestion(e.target.value)}/><button type="submit" disabled={!snapshot||!consent||!supported||!capacity||!question.trim()}>{busy?'打断并发送':'发送问题'}</button><small>结合全文及最近对话；对话仅保留本次打开，不写入探索进度。</small></form>
 <div className="surfing-actions"><button disabled={!snapshot||!consent||!supported||!capacity||busy} onClick={()=>void submit()}>生成探索切入点</button><button disabled={!snapshot} onClick={pause}>暂停 Surfing</button><span role="status" aria-label="Surfing 状态">{labels[status]}</span>{stepNote&&(status==='explaining'||status==='loading')&&<span className="surfing-step">{stepNote}…</span>}</div>
 <footer><span aria-label="Surfing 保存状态">{route||saveStatus!=='尚未保存'?saveStatus:'对话仅本次打开'}</span><small className="surfing-help">{route?' · 本地保存探索进度；恢复时保持暂停，不自动发送请求或跳页。':' · 未生成探索路线；问答不标记为已保存。'}</small>{saveError&&<div role="alert">{saveError}{pendingSave.current&&<><button onClick={()=>void persist().catch(()=>{})}>重试保存 Surfing 进度</button><button onClick={()=>{pendingSave.current=null;onExit();}}>放弃未保存进度并关闭</button></>}</div>}</footer></section>;
}
