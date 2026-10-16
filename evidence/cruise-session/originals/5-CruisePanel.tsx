import{useEffect,useRef,useState}from'react';
import type{AiProfileView}from'../shared/ai';
import{initialCruise,cruiseReducer,type CruiseAction,type CruiseBlock}from'../shared/cruise';
import{unwrap,type OpenedDocument}from'../shared/model';
import type{PdfReader,SelectionPart}from'./pdf-reader';
export function CruisePanel({document:doc,reader,takeover,selection,settingsOpen,onSettings,onExit}:{document:OpenedDocument;reader:PdfReader;takeover:number;selection:SelectionPart[];settingsOpen:boolean;onSettings:()=>void;onExit:()=>void}){
 const[state,setState]=useState(initialCruise),live=useRef(state),epoch=useRef(0),mounted=useRef(true),transition=useRef(false);
 const[profiles,setProfiles]=useState<AiProfileView[]>([]),[profileId,setProfileId]=useState(''),[setupError,setSetupError]=useState('');
 const selected=profiles.find(p=>p.id===profileId),block=state.blocks[state.index];
 function send(a:CruiseAction){live.current=cruiseReducer(live.current,a);if(mounted.current)setState(live.current);}
 function cancel(){const id=live.current.requestId;if(id)void window.enlumor.cancelBlockExplanation(id);}
 function pause(reason='已暂停'){epoch.current++;transition.current=false;cancel();send({type:'pause',reason});}
 function locate(b:CruiseBlock){reader.locateCruiseBlock(b);}
 function explain(){const s=live.current,b=s.blocks[s.index];if(!b||s.status==='loading'||s.status==='explaining')return;setSetupError('');if(!selected){setSetupError('请先在模型设置保存服务配置；当前仍可定位和略过原文。');return;}const requestId=crypto.randomUUID();send({type:'explain',requestId,source:{profileId:selected.id,name:selected.name,model:selected.model}});void window.enlumor.startBlockExplanation({requestId,profileId:selected.id,block:b}).then(unwrap).catch(()=>send({type:'text',event:{requestId,type:'error',code:'AI_REQUEST_FAILED'}}));}
 async function load(pageIndex:number,last=false,withExplanation=false,start?:SelectionPart){
  if(transition.current)return;transition.current=true;const generation=++epoch.current;cancel();send({type:'load'});
  try{const blocks=await reader.readPageBlocks(pageIndex);if(!mounted.current||generation!==epoch.current)return;let index=last?blocks.length-1:0;
   if(start&&blocks.length){const q=start.quads[0],x=(q[0]+q[2])/2,y=(q[1]+q[5])/2;let best=Infinity;blocks.forEach((b,i)=>b.quads.forEach(q=>{const d=Math.hypot(x-(q[0]+q[2])/2,y-(q[1]+q[5])/2);if(d<best){best=d;index=i;}}));}
   send({type:'loaded',blocks,index});if(blocks[index])locate(blocks[index]);if(withExplanation&&blocks[index]&&!live.current.results[blocks[index].id])explain();
  }catch{if(mounted.current&&generation===epoch.current)send({type:'failure',code:'CRUISE_READ_FAILED：本页排版暂不支持，请略过或退出。'});}finally{if(generation===epoch.current)transition.current=false;}
 }
 function start(){const selectedPart=selection.find(p=>p.quads.length);void load(selectedPart?.pageIndex??reader.viewer.currentPageNumber-1,false,true,selectedPart);}
 function move(direction:number,skip=false){const s=live.current;if(s.status==='loading'||transition.current)return;cancel();epoch.current++;const target=s.index+direction;
  if(target>=0&&target<s.blocks.length){send({type:'move',index:target});locate(live.current.blocks[target]);if(!skip&&!live.current.results[live.current.blocks[target].id])explain();return;}
  const pageIndex=s.blocks[s.index]?.pageIndex??reader.viewer.currentPageNumber-1,next=pageIndex+direction;
  if(next>=doc.pageCount){send({type:'finish'});return;}if(next<0)return;void load(next,direction<0,!skip);
 }
 function resume(){const s=live.current,b=s.blocks[s.index];if(!b){void load(reader.viewer.currentPageNumber-1,false,true);return;}send({type:'move',index:s.index});if(!s.results[b.id])explain();}
 useEffect(()=>{mounted.current=true;const off=window.enlumor.onAiText(event=>send({type:'text',event}));void window.enlumor.listAiProfiles().then(unwrap).then(list=>{if(mounted.current){setProfiles(list);setProfileId(list[0]?.id||'');}}).catch(()=>setSetupError('读取模型配置失败，请打开模型设置重试。'));
  const manual=()=>pause('手动接管：继续前保持当前位置'),key=(e:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key))manual();};
  const background=()=>{if(window.document.hidden)pause('窗口后台：已暂停');};
  reader.container.addEventListener('wheel',manual,{passive:true});reader.container.addEventListener('pointerdown',manual);reader.container.addEventListener('keydown',key);window.document.addEventListener('visibilitychange',background);
  return()=>{mounted.current=false;epoch.current++;cancel();off();reader.clearCruiseFocus();reader.container.removeEventListener('wheel',manual);reader.container.removeEventListener('pointerdown',manual);reader.container.removeEventListener('keydown',key);window.document.removeEventListener('visibilitychange',background);};
 },[doc.id,reader]);
 useEffect(()=>{if(settingsOpen){pause('模型设置已打开');return;}let valid=true;void window.enlumor.listAiProfiles().then(unwrap).then(list=>{if(valid){setProfiles(list);setProfileId(old=>list.some(p=>p.id===old)?old:list[0]?.id||'');}}).catch(()=>{});return()=>{valid=false;};},[settingsOpen]);
 const oldTakeover=useRef(takeover);useEffect(()=>{if(takeover!==oldTakeover.current){oldTakeover.current=takeover;pause('手动接管：页码或导航已改变');}},[takeover]);
 const labels={idle:'尚未开始',loading:'读取原文',ready:'等待继续',explaining:'正在解释',paused:'已暂停',error:'解释未完成',finished:'本篇已结束'};
 return <section className="cruise-panel" aria-label="Cruise 共读"><header><strong>Cruise · 逐块共读</strong><span aria-label="Cruise 状态" aria-live="polite">{labels[state.status]}</span><button onClick={()=>{pause();onExit();}} aria-label="退出 Cruise">退出</button></header>
 <div className="cruise-controls"><label>服务 <select aria-label="Cruise 服务" value={profileId} onChange={e=>{pause('服务已改变，等待手动继续');setProfileId(e.target.value);}}>{!profiles.length&&<option value="">尚未配置</option>}{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label><button onClick={()=>{pause('打开模型设置');onSettings();}}>模型设置</button></div>
 {state.status==='idle'&&<p>仅发送当前阅读块到 {selected?new URL(selected.endpoint).origin:'你配置的模型服务'}，不上传整份 PDF。点击开始后才发起解释；默认手动继续。</p>}
 {setupError&&<p role="alert">{setupError}</p>}{state.error&&<p role={state.status==='error'?'alert':undefined}>{state.error}</p>}
 {block&&<><div className="cruise-source"><small>第 {block.pageIndex+1} 页 · 本页 {state.index+1}/{state.blocks.length} 块</small><blockquote aria-label="Cruise 原文">{block.quote}</blockquote><button aria-label="返回当前原文" onClick={()=>locate(block)}>返回当前原文</button></div><div className="cruise-answer" aria-label="Cruise 解释" aria-live="polite">{state.text||'尚无解释；原文定位可独立使用。'}</div>{state.source&&<small>来源：{state.source.name} / {state.source.model}{state.status==='paused'&&state.requestId===null&&!state.results[block.id]?' · 未完成':''}</small>}</>}
 {!block&&state.status==='ready'&&<p>当前页没有可用文字块。扫描页需要文字层，可略过到下一页或退出。</p>}
 <footer>{state.status==='idle'?<button aria-label="开始 Cruise" onClick={start}>开始共读</button>:<><button aria-label="后退一个块" disabled={state.status==='loading'} onClick={()=>move(-1)}>后退</button><button aria-label="继续 Cruise" disabled={state.status==='loading'||state.status==='explaining'||state.status==='finished'} onClick={()=>state.status==='paused'||state.status==='error'?resume():move(1)}>继续</button><button aria-label="暂停 Cruise" disabled={state.status==='paused'||state.status==='finished'} onClick={()=>pause()}>暂停</button><button aria-label="略过当前块" disabled={state.status==='loading'||state.status==='finished'} onClick={()=>move(1,true)}>略过</button>{block&&<button aria-label="解释当前块" disabled={state.status==='loading'||state.status==='explaining'} onClick={explain}>{state.status==='error'?'重试解释':'解释当前块'}</button>}</>}</footer></section>;
}

