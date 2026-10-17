import {useLayoutEffect,useRef,useState} from 'react';
import {unwrap} from '../shared/model';
import type{AiProfileInput,AiProfileView,AiProtocol}from'../shared/ai';
const presets=[
 ['自定义 OpenAI','openai-chat','https://api.openai.com/v1'],
 ['DeepSeek','openai-chat','https://api.deepseek.com/v1'],
 ['阿里云百炼 / 通义千问','openai-chat','https://dashscope.aliyuncs.com/compatible-mode/v1'],
 ['火山方舟 / 豆包','openai-chat','https://ark.cn-beijing.volces.com/api/v3/chat/completions'],
 ['百度千帆','openai-chat','https://qianfan.baidubce.com/v2/chat/completions'],
 ['腾讯混元','openai-chat','https://api.hunyuan.cloud.tencent.com/v1'],
 ['Claude','anthropic-messages','https://api.anthropic.com/v1/messages'],
 ['Gemini','gemini','https://generativelanguage.googleapis.com/v1beta'],
] as const;
const empty=():AiProfileInput=>({id:crypto.randomUUID(),name:'新模型配置',protocol:'openai-chat',endpoint:presets[0][2],model:'',maxOutputTokens:1024,timeoutMs:30000,parameters:{}});
export function ModelSettings({close,returnFocus}:{close:()=>void;returnFocus:HTMLElement|null}){
 const dialog=useRef<HTMLDialogElement>(null);const[profiles,setProfiles]=useState<AiProfileView[]>([]),[draft,setDraft]=useState(empty),[key,setKey]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[parameters,setParameters]=useState('{}');
 const [models,setModels]=useState<string[]>([]);
 const selectedView=profiles.find(p=>p.id===selected);
 const refresh=async()=>{const list=unwrap(await window.enlumor.listAiProfiles());setProfiles(list);return list;};
 useLayoutEffect(()=>{const el=dialog.current!;el.showModal();void refresh().catch(e=>setError(String(e)));return()=>{el.close();queueMicrotask(()=>returnFocus?.isConnected&&returnFocus.focus());};},[]);
 const choose=(id:string)=>{setModels([]);setSelected(id);const p=profiles.find(p=>p.id===id);setDraft(p?{id:p.id,name:p.name,protocol:p.protocol,endpoint:p.endpoint,model:p.model,maxOutputTokens:p.maxOutputTokens,timeoutMs:p.timeoutMs,parameters:p.parameters}:empty());setParameters(JSON.stringify(p?.parameters||{},null,2));setKey('');setMessage('');setError('');};
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const save=()=>run(async()=>{let parsed;try{parsed=JSON.parse(parameters);}catch{throw Error('AI_INVALID_CONFIG: 参数必须是 JSON 对象');}const saved=unwrap(await window.enlumor.saveAiProfile({...draft,parameters:parsed,credential:key?{kind:'api-key',apiKey:key}:undefined}));await refresh();setDraft({...draft,id:saved.id,parameters:parsed});setSelected(saved.id);setKey('');setMessage('配置已保存');});
 return <dialog ref={dialog} className="ai-settings" aria-modal="true" aria-labelledby="ai-title" onCancel={event=>{event.preventDefault();if(!busy)close();}}><form onSubmit={event=>{event.preventDefault();void save();}}>
  <h2 id="ai-title">模型设置</h2><p>服务与协议独立配置。仅“测试连接”发送固定短句；不会发送 PDF。</p>
  <fieldset disabled={busy}>
   <label>已有配置<select aria-label="已有配置" value={selected} onChange={e=>choose(e.target.value)}><option value="">新建配置</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>厂商预设<select aria-label="厂商预设" defaultValue="" onChange={e=>{if(!e.target.value)return;const p=presets[Number(e.target.value)];setDraft({...draft,name:p[0],protocol:p[1],endpoint:p[2],model:''});}}><option value="">选择或手动配置</option>{presets.map((p,i)=><option key={p[0]} value={i}>{p[0]}</option>)}</select></label>
   <label>配置名称<input aria-label="配置名称" autoFocus value={draft.name} maxLength={100} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>协议<select aria-label="协议" value={draft.protocol} onChange={e=>setDraft({...draft,protocol:e.target.value as AiProtocol})}><option value="openai-chat">OpenAI Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic-messages">Claude Messages</option><option value="gemini">Gemini GenerateContent</option></select></label>
   <label>接口地址<input aria-label="接口地址" value={draft.endpoint} maxLength={2000} onChange={e=>setDraft({...draft,endpoint:e.target.value})}/></label>
   <datalist id="ai-models">{models.map(id=><option key={id} value={id}/>)}</datalist><label>模型 ID<input list="ai-models" aria-label="模型 ID" value={draft.model} maxLength={200} placeholder="填写服务商模型 ID" onChange={e=>setDraft({...draft,model:e.target.value})}/></label>
   <label>API 密钥<input aria-label="API 密钥" type="password" autoComplete="off" value={key} placeholder={selectedView?.hasCredential?'已保存；留空保留原密钥':'填写密钥，本地服务可留空'} onChange={e=>setKey(e.target.value)}/></label>
   <label>最大输出 tokens<input aria-label="最大输出 tokens" type="number" min={1} max={32768} value={draft.maxOutputTokens} onChange={e=>setDraft({...draft,maxOutputTokens:Number(e.target.value)})}/></label>
   <label>超时（毫秒）<input aria-label="超时（毫秒）" type="number" min={100} max={120000} value={draft.timeoutMs} onChange={e=>setDraft({...draft,timeoutMs:Number(e.target.value)})}/></label>
   <label>协议参数 JSON<textarea aria-label="协议参数 JSON" value={parameters} onChange={e=>setParameters(e.target.value)}/></label>
  </fieldset>
  {selectedView?.credentialStorage==='session'&&<p role="status">系统加密不可用，密钥仅保留本次会话；重启后需重新填写。</p>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <div className="ai-actions"><button type="button" disabled={busy||!selected} onClick={()=>void run(async()=>{try{setModels(unwrap(await window.enlumor.listAiModels(selected)));setMessage('模型列表已读取；也可手动填写');}catch(e){throw Error((e instanceof Error?e.message:String(e))+'；仍可手动填写模型 ID');}})}>读取模型列表</button><button type="button" disabled={busy} onClick={close}>关闭设置</button><button type="button" disabled={busy||!selected} onClick={()=>void run(async()=>{unwrap(await window.enlumor.deleteAiProfile(selected));await refresh();choose('');setMessage('配置已删除');})}>删除配置</button><button type="button" disabled={busy||!selected} onClick={()=>void run(async()=>{unwrap(await window.enlumor.testAiProfile(selected));setMessage('连接测试成功');})}>测试连接</button><button type="submit" disabled={busy}>{busy?'处理中…':'保存配置'}</button></div>
 </form></dialog>;
}
