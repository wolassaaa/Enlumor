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
 ['讯飞星火 WebSocket（Lite）','spark','wss://spark-api.xf-yun.com/v1.1/chat'],
 ['百炼 DashScope 原生文本','dashscope','https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'],
] as const;
const empty=():AiProfileInput=>({id:crypto.randomUUID(),name:'新模型配置',protocol:'openai-chat',endpoint:presets[0][2],model:'',maxOutputTokens:1024,timeoutMs:30000,parameters:{}});
export function ModelSettings({close,returnFocus}:{close:()=>void;returnFocus:HTMLElement|null}){
 const dialog=useRef<HTMLDialogElement>(null);
 const[profiles,setProfiles]=useState<AiProfileView[]>([]),[draft,setDraft]=useState(empty),[key,setKey]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[parameters,setParameters]=useState('{}');
 const[models,setModels]=useState<string[]>([]),[appId,setAppId]=useState(''),[apiSecret,setApiSecret]=useState(''),[provider,setProvider]=useState(''),[fields,setFields]=useState<Record<string,string>>({});
 const clearSecrets=()=>{setKey('');setAppId('');setApiSecret('');};
 const selectedView=profiles.find(p=>p.id===selected);
 const refresh=async()=>{const list=unwrap(await window.enlumor.listAiProfiles());setProfiles(list);return list;};
 useLayoutEffect(()=>{const el=dialog.current!;el.showModal();void refresh().catch(()=>setError('读取配置失败，请关闭后重试。'));return()=>{el.close();queueMicrotask(()=>returnFocus?.isConnected&&returnFocus.focus());};},[]);
 const choose=(id:string)=>{setModels([]);setSelected(id);const p=profiles.find(p=>p.id===id);setDraft(p?{id:p.id,name:p.name,protocol:p.protocol,endpoint:p.endpoint,model:p.model,maxOutputTokens:p.maxOutputTokens,timeoutMs:p.timeoutMs,parameters:p.parameters}:empty());setProvider(p?String(presets.findIndex(v=>v[1]===p.protocol&&v[2]===p.endpoint)):'');setParameters(JSON.stringify(p?.parameters||{},null,2));clearSecrets();setMessage('');setError('');setFields({});};
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');setError('');try{await fn();}catch(e){const raw=e instanceof Error?e.message:String(e);const hint=raw.includes('AI_INVALID_CONFIG')?'请检查高级设置中的地址、输出上限和协议参数。':raw.includes('401')||raw.includes('AI_KEY_REQUIRED')?'密钥未填写或未通过认证，请检查 API 密钥。':raw.includes('403')?'当前密钥没有访问权限，请检查服务商授权。':raw.includes('404')?'模型或接口地址未找到，请检查模型 ID 和接口地址。':raw.includes('TIMEOUT')?'连接超时，请检查网络或在高级设置中增加超时。':'操作失败，请检查网络与服务商配置后重试。';setError(hint+'（'+raw+'）');}finally{setBusy(false);}};
 const persist=async()=>{
  const invalid:Record<string,string>={};let parsed:Record<string,unknown>={};
  if(!draft.model.trim())invalid.model='请选择或填写模型 ID';
  if(!draft.name.trim())invalid.name='请填写配置名称';
  try{const url=new URL(draft.endpoint);const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);const secure=draft.protocol==='spark'?'wss:':'https:',plain=draft.protocol==='spark'?'ws:':'http:';if((url.protocol!==secure&&!(local&&url.protocol===plain))||url.username||url.password||url.search||url.hash)throw Error();}catch{invalid.endpoint='请填写有效的安全接口地址；本地服务可使用 HTTP / WS';}
  try{parsed=JSON.parse(parameters);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();}catch{invalid.parameters='协议参数必须是 JSON 对象，例如 {}';}
  if(!Number.isInteger(draft.maxOutputTokens)||draft.maxOutputTokens<1||draft.maxOutputTokens>32768)invalid.tokens='输出上限须为 1–32768 的整数';
  if(!Number.isInteger(draft.timeoutMs)||draft.timeoutMs<100||draft.timeoutMs>120000)invalid.timeout='超时须为 100–120000 毫秒的整数';
  if(draft.protocol==='spark'&&(key||appId||apiSecret)&&!(key.trim()&&appId.trim()&&apiSecret.trim()))invalid.key='Spark 的 APPID、API 密钥和 APISecret 需要一起填写';
  setFields(invalid);
  if(Object.keys(invalid).length){const first=Object.keys(invalid)[0];const advanced=dialog.current?.querySelector<HTMLDetailsElement>('details');if(!['model','key'].includes(first)&&advanced)advanced.open=true;requestAnimationFrame(()=>dialog.current?.querySelector<HTMLInputElement>('[data-field="'+first+'"]')?.focus());return null;}
  const credential=draft.protocol==='spark'?(key?{kind:'spark' as const,appId,apiKey:key,apiSecret}:undefined):(key?{kind:'api-key' as const,apiKey:key}:undefined);
  const saved=unwrap(await window.enlumor.saveAiProfile({...draft,model:draft.model.trim(),name:draft.name.trim(),parameters:parsed,credential}));
  setDraft({...draft,id:saved.id,model:saved.model,name:saved.name,parameters:parsed});setSelected(saved.id);clearSecrets();await refresh();setMessage('配置已保存');return saved.id;
 };
 const save=(testConnection=false)=>run(async()=>{const id=await persist();if(id&&testConnection){setMessage('配置已保存，正在测试连接…');try{unwrap(await window.enlumor.testAiProfile(id));setMessage('配置已保存，连接测试成功');}catch(e){setMessage('配置已保存；连接测试未通过，可修改后重试');throw e;}}});
 const fieldError=(name:string)=>fields[name]&&<span className="ai-field-error" id={'ai-error-'+name}>{fields[name]}</span>;
 return <dialog ref={dialog} className="ai-settings" aria-modal="true" aria-label="模型设置" onCancel={event=>{event.preventDefault();if(!busy)close();}}><form noValidate onSubmit={event=>{event.preventDefault();void save(true);}}>
  <header className="ai-heading"><span className="ai-eyebrow">MODEL / 共读连接</span><h2 id="ai-title">连接你的模型</h2><p>选服务商，填密钥和模型，就能开始共读。连接测试只发送固定短句，不发送 PDF。</p></header>
  <fieldset disabled={busy} className="ai-basic">
   <label className="ai-full">已有配置<select aria-label="已有配置" value={selected} onChange={e=>choose(e.target.value)}><option value="">新建配置</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="ai-full">服务商<select aria-label="厂商预设" autoFocus value={provider} onChange={e=>{const value=e.target.value;setProvider(value);setModels([]);setFields({});setError('');setMessage('');if(!value)return;const p=presets[Number(value)];clearSecrets();setParameters('{}');setDraft({...draft,name:p[0],protocol:p[1],endpoint:p[2],model:p[0]==='DeepSeek'?'deepseek-chat':p[1]==='spark'?'lite':'',parameters:{}});}}><option value="">自定义 / 兼容接口</option>{presets.map((p,i)=><option key={p[0]} value={i}>{p[0]}</option>)}</select></label>
   <label className="ai-full">API 密钥<input data-field="key" aria-label="API 密钥" aria-invalid={!!fields.key} aria-describedby={fields.key?'ai-error-key':undefined} type="password" autoComplete="off" value={key} placeholder={selectedView?.hasCredential?'密钥已保存；留空保留':'粘贴服务商的 API 密钥，本地服务可留空'} onChange={e=>setKey(e.target.value)}/>{fieldError('key')}</label>
   {draft.protocol==='spark'&&<><label>APPID<input aria-label="Spark APPID" autoComplete="off" value={appId} onChange={e=>setAppId(e.target.value)} placeholder="留空保留已保存凭据"/></label><label>APISecret<input aria-label="Spark APISecret" type="password" autoComplete="off" value={apiSecret} onChange={e=>setApiSecret(e.target.value)}/></label><p className="ai-full">星火需填写三项凭据；WebSocket 直连不继承 HTTP 代理。</p></>}
   <datalist id="ai-models">{[...new Set([...models,...(provider==='1'?['deepseek-chat','deepseek-reasoner']:[])])].map(id=><option key={id} value={id}/>)}</datalist>
   <label className="ai-full">模型<input data-field="model" list="ai-models" aria-label="模型 ID" aria-invalid={!!fields.model} aria-describedby={fields.model?'ai-error-model':'ai-model-help'} value={draft.model} maxLength={200} placeholder={draft.protocol==='spark'?'Spark domain，例如 lite':'选择或填写服务商的模型 ID'} onChange={e=>{setDraft({...draft,model:e.target.value});setFields({...fields,model:''});}}/>{fieldError('model')}<span id="ai-model-help" className="ai-help">{provider==='1'?'默认 deepseek-chat；也可填写 deepseek-reasoner。':'填写服务商控制台提供的模型 ID；自定义接口请展开高级设置填写地址。'}</span></label>
  </fieldset>
  <details className="ai-advanced"><summary>高级设置</summary><fieldset disabled={busy}>
   <label>配置名称<input data-field="name" aria-label="配置名称" value={draft.name} maxLength={100} onChange={e=>setDraft({...draft,name:e.target.value})}/>{fieldError('name')}</label>
   <label>协议<select aria-label="协议" value={draft.protocol} onChange={e=>{clearSecrets();setProvider('');setParameters('{}');setDraft({...draft,protocol:e.target.value as AiProtocol,parameters:{}});}}><option value="openai-chat">OpenAI Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic-messages">Claude Messages</option><option value="gemini">Gemini GenerateContent</option><option value="dashscope">DashScope 原生文本</option><option value="spark">Spark WebSocket</option></select></label>
   <label className="ai-full">接口地址<input data-field="endpoint" aria-label="接口地址" value={draft.endpoint} maxLength={2000} onChange={e=>{setProvider('');setDraft({...draft,endpoint:e.target.value});}}/>{fieldError('endpoint')}</label>
   <label>最大输出 tokens<input data-field="tokens" aria-label="最大输出 tokens" type="number" value={draft.maxOutputTokens} onChange={e=>setDraft({...draft,maxOutputTokens:Number(e.target.value)})}/>{fieldError('tokens')}</label>
   <label>超时（毫秒）<input data-field="timeout" aria-label="超时（毫秒）" type="number" value={draft.timeoutMs} onChange={e=>setDraft({...draft,timeoutMs:Number(e.target.value)})}/>{fieldError('timeout')}</label>
   <label className="ai-full">协议参数 JSON<textarea data-field="parameters" aria-label="协议参数 JSON" value={parameters} onChange={e=>setParameters(e.target.value)}/>{fieldError('parameters')}</label>
  </fieldset><div className="ai-secondary">
   <button type="button" disabled={busy||!selected} onClick={()=>void run(async()=>{try{setModels(unwrap(await window.enlumor.listAiModels(selected)));setMessage('模型列表已读取；也可手动填写');}catch(e){throw Error((e instanceof Error?e.message:String(e))+'；仍可手动填写模型 ID');}})}>读取模型列表</button>
   <button type="button" disabled={busy||!selected} onClick={()=>void run(async()=>{const id=await persist();if(id){unwrap(await window.enlumor.testAiProfile(id));setMessage('连接测试成功');}})}>测试连接</button>
   <button type="button" disabled={busy} onClick={()=>void save()}>保存配置</button>
   <button type="button" disabled={busy||!selected} onClick={()=>void run(async()=>{unwrap(await window.enlumor.deleteAiProfile(selected));await refresh();choose('');setMessage('配置已删除');})}>删除配置</button>
  </div></details>
  {selectedView?.credentialStorage==='session'&&<p role="status">系统加密不可用，密钥仅保留本次会话；重启后需重新填写。</p>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <div className="ai-actions"><button type="button" disabled={busy} onClick={close}>关闭设置</button><button className="ai-primary" type="submit" disabled={busy}>{busy?'处理中…':'保存并测试'}</button></div>
 </form></dialog>;
}
