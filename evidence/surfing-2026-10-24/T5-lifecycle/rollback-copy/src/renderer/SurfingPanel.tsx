import type {SurfingSaveInput} from '../main/surfing-runtime';
import {useEffect,useRef,useState} from 'react';
import type {OpenedDocument} from '../shared/model';
import {unwrap} from '../shared/model';
import type {AiProfileView} from '../shared/ai';
import type {SurfingContext} from '../shared/surfing-context';
import type {SurfingRoute} from '../shared/surfing-route';
import type {SurfingExplanation} from '../main/surfing-requests';
import {supportedSurfingTokenizer} from '../main/surfing-tokenizer-models';
import {createSurfingCommandHost} from './surfing-command-host';
import type {PdfReader} from './pdf-reader';
const labels:Record<string,string>={idle:'尚未准备',preparing:'准备本地文字中',prepared:'已准备文字',loading:'生成探索路线中',explaining:'解释中',ready:'等待你的选择',paused:'已暂停',error:'需要处理'};
export function SurfingPanel({document:doc,reader,takeover,takeoverRef,flushRef,settingsOpen,onSettings,onExit}:{document:OpenedDocument;reader:PdfReader;takeover:number;takeoverRef:{current:(()=>void)|null};flushRef:{current:(()=>Promise<void>)|null};settingsOpen:boolean;onSettings:()=>void;onExit:()=>void}){
 const [status,setStatus]=useState('idle'),[error,setError]=useState(''),[snapshot,setSnapshot]=useState<SurfingContext|null>(null),[route,setRoute]=useState<SurfingRoute|null>(null),[profiles,setProfiles]=useState<AiProfileView[]>([]),[profileId,setProfileId]=useState(''),[capacity,setCapacity]=useState(''),[consent,setConsent]=useState(false),[selected,setSelected]=useState<number|null>(null),[answers,setAnswers]=useState<Record<number,SurfingExplanation>>({});
 const [saveStatus,setSaveStatus]=useState('尚未保存'),[saveError,setSaveError]=useState('');
 const routeRevision=useRef(0),pendingSave=useRef<SurfingSaveInput|null>(null),saveRunning=useRef(false),saveFlight=useRef<Promise<void>>(Promise.resolve());
 const mounted=useRef(true),epoch=useRef(0),source=useRef(snapshot),profileRef=useRef(profileId),routeRef=useRef(route),answersRef=useRef(answers),lastTakeover=useRef(takeover);source.current=snapshot;profileRef.current=profileId;routeRef.current=route;answersRef.current=answers;
 const job=useRef<{id:string;profileId:string;source:SurfingContext;index?:number}|null>(null),host=useRef<ReturnType<typeof createSurfingCommandHost>|null>(null);
 host.current??=createSurfingCommandHost(()=>reader,()=>doc,()=>source.current);
 const selectedProfile=profiles.find(p=>p.id===profileId),supported=!!selectedProfile&&supportedSurfingTokenizer(selectedProfile),busy=status==='preparing'||status==='loading'||status==='explaining';
 function persist():Promise<void>{
  if(saveRunning.current)return saveFlight.current.then(()=>pendingSave.current?persist():undefined);if(!pendingSave.current)return Promise.resolve();saveRunning.current=true;
  const task=(async()=>{while(pendingSave.current){const request=pendingSave.current;if(mounted.current)setSaveStatus('保存中');try{unwrap(await window.enlumor.saveSurfingProgress(request));}catch(e){if(pendingSave.current!==request)continue;if(mounted.current){setSaveStatus('保存失败');setSaveError(e instanceof Error?e.message:String(e));}throw e;}if(pendingSave.current===request)pendingSave.current=null;if(mounted.current&&routeRef.current&&routeRevision.current===request.routeRevision){setSaveStatus('已保存');setSaveError('');}}})();
  saveFlight.current=task.finally(()=>{saveRunning.current=false;});return saveFlight.current;
 }
 function queueSave(index:number|null){const current=source.current;if(!current||!routeRef.current||routeRevision.current<1)return;pendingSave.current={context:{...current.context},routeRevision:routeRevision.current,selected:index};setSaveStatus('保存中');void persist().catch(()=>{});}
 async function close(){pause();try{await persist();onExit();}catch{/* saved error and visible progress remain */}}
 async function openSettings(){pause();try{await persist();onSettings();}catch{/* keep progress visible */}}
 async function changeProfile(id:string){pause();const version=++epoch.current;try{await persist();}catch{return;}if(!mounted.current||version!==epoch.current)return;setProfileId(id);profileRef.current=id;setConsent(false);setRoute(null);routeRef.current=null;setAnswers({});answersRef.current={};setSelected(null);routeRevision.current=0;setSaveStatus('尚未保存');}
 function pause(){epoch.current++;const active=job.current;job.current=null;host.current?.invalidate();const s=source.current;if(s&&active)void window.enlumor.cancelSurfing(s.context);if(mounted.current)setStatus('paused');}
 function fail(value:unknown){if(mounted.current){setError(value instanceof Error?value.message:String(value));setStatus('error');}}
 async function prepare(){pause();const version=++epoch.current;try{await persist();}catch{return;}if(!mounted.current||epoch.current!==version)return;setSnapshot(null);source.current=null;setRoute(null);routeRef.current=null;setAnswers({});answersRef.current={};setSelected(null);setError('');setSaveError('');setSaveStatus('尚未保存');routeRevision.current=0;setConsent(false);setStatus('preparing');
  try{const next=unwrap(await window.enlumor.prepareSurfing(doc.id));if(!mounted.current||epoch.current!==version)return;source.current=next;setSnapshot(next);setStatus('prepared');
   try{const restored=unwrap(await window.enlumor.getSavedSurfingProgress(next.context));if(!mounted.current||epoch.current!==version)return;if(restored){const saved=restored.session;routeRef.current=saved.route;setRoute(saved.route);routeRevision.current=restored.routeRevision;setSelected(saved.selected);answersRef.current=saved.answers;setAnswers(saved.answers);profileRef.current=saved.source.profileId;setProfileId(saved.source.profileId);setCapacity(String(saved.contextWindowTokens));setConsent(false);setSaveStatus('已保存');setStatus('paused');}}
   catch(e){if(mounted.current&&epoch.current===version){setSaveStatus('未恢复');setSaveError('保存的进度未恢复：'+(e instanceof Error?e.message:String(e)));}}
  }catch(e){if(mounted.current&&epoch.current===version)fail(e);}
 }
 async function submit(index?:number){const s=source.current;if(!s||job.current)return;if(!consent||!selectedProfile||!supported||!Number.isSafeInteger(Number(capacity))||Number(capacity)<1){fail(Error('请确认服务、模型上下文窗口和全文发送范围。'));return;}
  if(index===undefined){const version=epoch.current;try{await persist();}catch{return;}if(!mounted.current||source.current!==s||job.current||epoch.current!==version)return;setSaveStatus('等待新路线');setRoute(null);routeRef.current=null;setSelected(null);setAnswers({});answersRef.current={};}
  const id=crypto.randomUUID();job.current={id,profileId,source:s,index};setError('');setStatus(index===undefined?'loading':'explaining');
  const request={requestId:id,profileId,context:s.context,consent:true as const},input={request,contextWindowTokens:Number(capacity)};
  try{unwrap(index===undefined?await window.enlumor.generateSurfingRoute(input):await window.enlumor.explainSurfingStop({...input,request:{...request,stopIndex:index}}));}catch(e){if(mounted.current&&job.current?.id===id){job.current=null;fail(e);}}
 }
 async function choose(index:number,explain=true){const r=routeRef.current,s=source.current;if(!r?.stops[index]||!s)return;pause();const version=++epoch.current;setSelected(index);queueSave(index);setError('');const block=s.passages.find(p=>p.id===r.stops[index].passageIds[0]);if(!block){fail(Error('SURFING_SOURCE_INVALID'));return;}
  const result=await host.current!.run({type:'show_evidence',pageIndex:block.pageIndex,passageId:block.id});if(!mounted.current||version!==epoch.current)return;if(!result.ok){fail(Error(result.error.message));return;}
  if(explain&&!answersRef.current[index])await submit(index);else setStatus('ready');
 }
 useEffect(()=>{mounted.current=true;takeoverRef.current=pause;const flush=async()=>{await persist();if(pendingSave.current)throw Error('SURFING_UNSAVED_PROGRESS');};flushRef.current=flush;
  const off=window.enlumor.onSurfingText(event=>{const j=job.current;if(!mounted.current||!j||event.requestId!==j.id||source.current!==j.source||profileRef.current!==j.profileId)return;job.current=null;if(event.type==='error'){fail(Error(event.code));return;}if(event.type==='route'){routeRevision.current=event.routeRevision;routeRef.current=event.route;setRoute(event.route);setAnswers({});answersRef.current={};setSelected(null);queueSave(null);}else if(event.type==='explanation'){const next={...answersRef.current,[event.stopIndex]:event.explanation};answersRef.current=next;setAnswers(next);queueSave(event.stopIndex);}setStatus('ready');});
  const background=()=>{if(window.document.hidden)pause();};window.document.addEventListener('visibilitychange',background);const offBackground=window.enlumor.onAppBackground(pause);
  return()=>{if(flushRef.current===flush)flushRef.current=null;if(takeoverRef.current===pause)takeoverRef.current=null;mounted.current=false;epoch.current++;job.current=null;off();offBackground();window.document.removeEventListener('visibilitychange',background);host.current?.invalidate();const s=source.current;if(s)void window.enlumor.deactivateSurfing(s.context);};
 },[doc.id,reader]);
 useEffect(()=>{if(takeover!==lastTakeover.current){lastTakeover.current=takeover;pause();}},[takeover]);
 useEffect(()=>{let active=true;if(settingsOpen){pause();setConsent(false);setRoute(null);routeRef.current=null;setAnswers({});setSelected(null);}else void window.enlumor.listAiProfiles().then(reply=>{if(!mounted.current||!active)return;const p=unwrap(reply);setProfiles(p);setProfileId(p.some(x=>x.id===profileRef.current)?profileRef.current:p[0]?.id||'');}).catch(fail);return()=>{active=false;};},[settingsOpen]);
 const answer=selected===null?null:answers[selected];
 return <section className="surfing-panel" aria-label="Surfing 共读"><header><div><strong>Surfing</strong><span>从一个值得探索的问题开始，不必先知道怎么问。</span></div><button onClick={()=>void close()} aria-label="关闭 Surfing">关闭</button></header>
 <p className="surfing-scope">{doc.name} · 只提取文字，不代表图表或公式视觉理解。准备文档不会发送网络请求。</p>
 <details className="surfing-setup" open={!route}><summary>阅读范围与服务设置</summary><div className="surfing-controls"><button disabled={busy} onClick={()=>void prepare()}>准备本地全文</button><label>服务<select aria-label="Surfing 服务" value={profileId} disabled={busy} onChange={e=>void changeProfile(e.target.value)}>{profiles.length===0&&<option value="">尚未配置</option>}{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label><label>模型窗口<input aria-label="Surfing 模型上下文窗口（tokens）" type="number" min="1" max="10000000" placeholder="按服务文档填写" value={capacity} disabled={busy} onChange={e=>setCapacity(e.target.value)}/></label><button onClick={()=>void openSettings()}>配置模型</button></div>
 <p className="surfing-help">首版已配置 o200k 编码的 OpenAI Chat 模型可用；未知模型不猜容量。计数在后台进行，含保守余量；BYOK 其他功能保持原样。</p>
 {snapshot&&<p className="surfing-coverage">已读取 {snapshot.pageCount} 页 · {snapshot.passages.length} 段 · {snapshot.characterCount} 字符。{snapshot.emptyPages.length?`${snapshot.emptyPages.length} 页没有可提取文字；仅发送其余文字，非完整视觉内容。`:'每页均有文字，仍需核验提取顺序与原文。'}</p>}
 <label className="surfing-consent"><input type="checkbox" aria-label="确认将当前论文提取文字发送给所选服务" checked={consent} disabled={!snapshot||busy} onChange={e=>setConsent(e.target.checked)}/>我确认将《{doc.name}》的全部已提取文字发送给 {selectedProfile?.name||'所选服务'}（{selectedProfile?.endpoint||'尚未选择'}），不包含图像理解。</label></details>
 <div className="surfing-actions"><button disabled={!snapshot||!consent||!supported||!capacity||busy} onClick={()=>void submit()}>生成探索切入点</button><button disabled={!snapshot} onClick={pause}>暂停 Surfing</button><span role="status" aria-label="Surfing 状态">{labels[status]}</span></div>
 {error&&<p role="alert" className="surfing-error">{error} · 可调整配置后重新尝试；不会自动重试。</p>}
 {route&&<><ol className="surfing-stops">{route.stops.map((stop,index)=><li key={stop.title} className={selected===index?'is-current':''}><button onClick={()=>void choose(index)} aria-label={stop.title}>{index+1}. {stop.title}</button><p>{stop.reason}</p><small>{stop.passageIds.length} 处原文证据</small></li>)}</ol><div className="surfing-actions"><button disabled={selected===null||selected===0} onClick={()=>void choose(selected!-1,false)}>回看上一处</button><button disabled={selected===null||selected>=route.stops.length-1} onClick={()=>void choose(selected!+1,false)}>跳过到下一处</button><button disabled={selected===null||selected>=route.stops.length-1} onClick={()=>void choose(selected!+1,true)}>继续探索</button>{selected!==null&&<button disabled={busy||!consent} onClick={()=>void submit(selected)}>解释这个切入点</button>}</div></>}
 {selected!==null&&<div className="surfing-answer" aria-label="Surfing 解释">{answer?<><p>{answer.text}</p><div>{answer.passageIds.map(id=>{const b=snapshot?.passages.find(p=>p.id===id);return b&&<button key={id} onClick={()=>void host.current!.run({type:'show_evidence',pageIndex:b.pageIndex,passageId:id})}>核对第 {b.pageIndex+1} 页原文</button>;})}</div></>:<p>这一处还没有解释。你可以只看原文，也可以主动请求解释。</p>}</div>}
 <footer><span aria-label="Surfing 保存状态">{saveStatus}</span><small className="surfing-help"> · 本地保存探索进度；恢复时保持暂停，不自动发送请求或跳页。</small>{saveError&&<div role="alert">{saveError}{pendingSave.current&&<><button onClick={()=>void persist().catch(()=>{})}>重试保存 Surfing 进度</button><button onClick={()=>{pendingSave.current=null;onExit();}}>放弃未保存进度并关闭</button></>}</div>}</footer></section>;
}
