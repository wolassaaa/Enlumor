import type{AiProfileInput}from'../shared/ai';
import{MAX_OUTPUT_LIMIT,validContextWindow}from'../shared/ai-models';
const protocols=['openai-chat','openai-responses','anthropic-messages','gemini','dashscope','spark'];
const invalid=()=>new Error('AI_INVALID_CONFIG');
/** Caller supplies an explicitly selected service; no redirects or URL credentials. */
export function validateAiProfile(profile:AiProfileInput):URL {
 if(!profile||typeof profile!=='object'||!protocols.includes(profile.protocol)||typeof profile.id!=='string'||!/^[\w-]{1,100}$/.test(profile.id)||typeof profile.name!=='string'||profile.name.length>100||!profile.name.trim()||typeof profile.model!=='string'||!profile.model.trim()||profile.model.length>200||typeof profile.endpoint!=='string'||profile.endpoint.length>2000||!Number.isInteger(profile.maxOutputTokens)||profile.maxOutputTokens<1||profile.maxOutputTokens>MAX_OUTPUT_LIMIT||!Number.isInteger(profile.timeoutMs)||profile.timeoutMs<100||profile.timeoutMs>120000)throw invalid();
 if(profile.contextWindowTokens!==undefined&&!validContextWindow(profile.contextWindowTokens))throw invalid();
 if(profile.vision!==undefined&&typeof profile.vision!=='boolean')throw invalid();
 let url:URL;try{url=new URL(profile.endpoint);}catch{throw invalid();}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const secure=profile.protocol==='spark'?'wss:':'https:',plain=profile.protocol==='spark'?'ws:':'http:';
 if((url.protocol!==secure&&!(url.protocol===plain&&local))||url.username||url.password||url.search||url.hash)throw invalid();
 if(profile.credential){const c=profile.credential;if(profile.protocol==='spark'){if(c.kind!=='spark'||[c.appId,c.apiKey,c.apiSecret].some(v=>typeof v!=='string'||!v.trim()||v.length>8192||/[\r\n"\\]/.test(v)))throw invalid();}else if(c.kind!=='api-key'||typeof c.apiKey!=='string'||c.apiKey.length>8192||!c.apiKey.trim()||/[\r\n]/.test(c.apiKey))throw invalid();}
 if(profile.protocol==='spark'){
  const routes:Record<string,string>={lite:'/v1.1/chat',generalv3:'/v3.1/chat','pro-128k':'/chat/pro-128k','generalv3.5':'/v3.5/chat','max-32k':'/chat/max-32k','4.0Ultra':'/v4.0/chat',Ultra:'/v4.0/chat'};
  if(url.hostname==='spark-api.xf-yun.com'&&routes[profile.model]!==url.pathname)throw invalid();
  const cap=profile.model==='lite'?4096:profile.model==='generalv3'||profile.model==='generalv3.5'?8192:32768;if(profile.maxOutputTokens>cap)throw invalid();
 }

 const p=profile.parameters;if(!p||typeof p!=='object'||Array.isArray(p)||Object.getPrototypeOf(p)!==Object.prototype)throw invalid();
 // Protocol-specific controls, never authentication/routing/prompts or arbitrary request fields.
 const allowed:Record<string,string[]>={
  'openai-chat':['temperature','top_p','seed','presence_penalty','frequency_penalty','reasoning_effort','enable_thinking'],
  'openai-responses':['temperature','top_p'],
  'anthropic-messages':['temperature','top_p','top_k'],
  gemini:['temperature','topP','topK'],
  spark:['temperature','top_k'],
  dashscope:['temperature','top_p','top_k','seed','repetition_penalty','enable_thinking','incremental_output'],
 };
 for(const [key,value]of Object.entries(p)){
  if(!allowed[profile.protocol].includes(key))throw invalid();
  if(key==='reasoning_effort'){if(typeof value!=='string'||!['none','minimal','low','medium','high','xhigh'].includes(value))throw invalid();}
  else if(key==='enable_thinking'||key==='incremental_output'){if(typeof value!=='boolean')throw invalid();}
  else {
   if(typeof value!=='number'||!Number.isFinite(value))throw invalid();
   if(profile.protocol==='spark'&&((key==='temperature'&&(value<=0||value>1))||(key==='top_k'&&value>6)))throw invalid();
   if(key==='temperature'&&(value<0||value>(profile.protocol==='anthropic-messages'?1:2)))throw invalid();
   if(['top_p','topP'].includes(key)&&(value<0||value>1))throw invalid();
   if(['top_k','topK'].includes(key)&&(!Number.isInteger(value)||value<1||value>10000))throw invalid();
   if(['presence_penalty','frequency_penalty'].includes(key)&&Math.abs(value)>2)throw invalid();
   if(key==='repetition_penalty'&&(value<=0||value>2))throw invalid();
   if(key==='seed'&&(!Number.isInteger(value)||Math.abs(value)>2147483647))throw invalid();
  }
 }
 return url;
}

