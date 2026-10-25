import{generateSpark}from'./spark-client';
import{validateAiProfile}from'./ai-config';
export{validateAiProfile}from'./ai-config';
import {AI_MAX_PROMPT_CHARACTERS,type AiProfileInput,type AiPrompt} from '../shared/ai';
import type {AiModelInfo} from '../shared/ai-models';

const MAX_RESPONSE_BYTES=4*1024*1024,MAX_EVENT_BYTES=512*1024;
const invalid=()=>new Error('AI_INVALID_CONFIG');
const failure=(code:string)=>new Error(code);

export function buildAiRequest(profile:AiProfileInput,prompt:AiPrompt,stream=true):{url:string;headers:Record<string,string>;body:any} {
 const url=validateAiProfile(profile);
 if(!prompt||typeof prompt.system!=='string'||typeof prompt.user!=='string'||!prompt.user.trim()||prompt.system.length+prompt.user.length>AI_MAX_PROMPT_CHARACTERS)throw failure('AI_INVALID_PROMPT');
 const headers:Record<string,string>={'Content-Type':'application/json','Accept':stream?'text/event-stream':'application/json'};
 const key=profile.credential?.kind==='api-key'?profile.credential.apiKey:'';
 if(!key&&url.protocol==='https:')throw failure('AI_KEY_REQUIRED');
 let body:any;
 const addPath=(suffix:string,root:string)=>{let base=url.pathname.replace(/\/+$/,'');if(!base)base=root;if(!base.endsWith(suffix))base+=suffix;url.pathname=base;};
 switch(profile.protocol){
  case'openai-chat':
   addPath('/chat/completions','/v1');if(key)headers.Authorization='Bearer '+key;
   body={model:profile.model,messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}],max_tokens:profile.maxOutputTokens,stream,...profile.parameters};break;
  case'openai-responses':
   addPath('/responses','/v1');if(key)headers.Authorization='Bearer '+key;
   body={model:profile.model,instructions:prompt.system,input:prompt.user,max_output_tokens:profile.maxOutputTokens,stream,store:false,...profile.parameters};break;
  case'anthropic-messages':
   addPath('/messages','/v1');if(key)headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
   body={model:profile.model,system:prompt.system,messages:[{role:'user',content:prompt.user}],max_tokens:profile.maxOutputTokens,stream,...profile.parameters};break;
  case'dashscope':{
   const full='/api/v1/services/aigc/text-generation/generation',base=url.pathname.replace(/\/+$/,'');
   if(!base)url.pathname=full;else if(base.endsWith('/api/v1'))url.pathname=base+'/services/aigc/text-generation/generation';else if(!base.endsWith(full))throw invalid();
   if(key)headers.Authorization='Bearer '+key;if(stream)headers['X-DashScope-SSE']='enable';
   body={model:profile.model,input:{messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]},parameters:{max_tokens:profile.maxOutputTokens,result_format:'message',incremental_output:stream,...profile.parameters}};break;
  }
  case'gemini':{
   let base=url.pathname.replace(/\/+$/,'')||'/v1beta';
   if(/:(?:streamGenerateContent|generateContent)$/.test(base))base=base.replace(/:(?:streamGenerateContent|generateContent)$/,stream?':streamGenerateContent':':generateContent');
   else base+='/models/'+encodeURIComponent(profile.model)+(stream?':streamGenerateContent':':generateContent');
   url.pathname=base;if(stream)url.searchParams.set('alt','sse');if(key)headers['x-goog-api-key']=key;
   body={systemInstruction:{parts:[{text:prompt.system}]},contents:[{role:'user',parts:[{text:prompt.user}]}],generationConfig:{maxOutputTokens:profile.maxOutputTokens,...profile.parameters}};break;
  }
  default:throw failure('AI_PROTOCOL_NOT_READY');
 }
 return{url:url.toString(),headers,body};
}

function decodeObject(profile:AiProfileInput,value:any,stream:boolean):{text:string;done:boolean} {
 if(!value||typeof value!=='object'||Array.isArray(value))throw failure('AI_INVALID_RESPONSE');
 if(value.error||value.type==='error'||value.type==='response.failed')throw failure('AI_REMOTE_ERROR');
 let text='',done=false;
 switch(profile.protocol){
  case'openai-chat':{
   const choices=value.choices;if(!Array.isArray(choices))throw failure('AI_INVALID_RESPONSE');
   const c=choices[0];if(!c)return{text:'',done:false};const finish=c.finish_reason;
   if(finish==='length'||finish==='content_filter')throw failure('AI_INCOMPLETE');
   const content=stream?c.delta?.content:c.message?.content;
   if(typeof content==='string')text=content;
   else if(Array.isArray(content))text=content.filter(p=>p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('');
   else if(content!==undefined&&content!==null)throw failure('AI_INVALID_RESPONSE');
   done=!!finish||!stream;break;
  }
  case'openai-responses':
   if(!stream){if(value.status&&value.status!=='completed')throw failure('AI_INCOMPLETE');if(!Array.isArray(value.output))throw failure('AI_INVALID_RESPONSE');text=value.output.flatMap((v:any)=>v.type==='message'&&Array.isArray(v.content)?v.content:[]).filter((v:any)=>v.type==='output_text'&&typeof v.text==='string').map((v:any)=>v.text).join('');done=true;}
   else if(value.type==='response.output_text.delta'){if(typeof value.delta!=='string')throw failure('AI_INVALID_RESPONSE');text=value.delta;}
   else if(value.type==='response.completed'){if(value.response?.status&&value.response.status!=='completed')throw failure('AI_INCOMPLETE');done=true;}
   else if(value.type==='response.incomplete')throw failure('AI_INCOMPLETE');
   break;
  case'anthropic-messages':
   if(!stream){if(value.stop_reason==='max_tokens')throw failure('AI_INCOMPLETE');if(!Array.isArray(value.content))throw failure('AI_INVALID_RESPONSE');text=value.content.filter((v:any)=>v.type==='text'&&typeof v.text==='string').map((v:any)=>v.text).join('');done=true;}
   else if(value.type==='content_block_start'&&value.content_block?.type==='text'){if(typeof value.content_block.text!=='string')throw failure('AI_INVALID_RESPONSE');text=value.content_block.text;}
   else if(value.type==='content_block_delta'&&value.delta?.type==='text_delta'){if(typeof value.delta.text!=='string')throw failure('AI_INVALID_RESPONSE');text=value.delta.text;}
   else if(value.type==='message_delta'&&value.delta?.stop_reason==='max_tokens')throw failure('AI_INCOMPLETE');
   else if(value.type==='message_stop')done=true;
   break;
  case'dashscope':{
   if(value.code||(typeof value.status_code==='number'&&value.status_code>=400))throw failure('AI_REMOTE_ERROR');
   const output=value.output,c=output?.choices?.[0],content=c?.message?.content??output?.text,finish=c?.finish_reason??output?.finish_reason;
   if(typeof content!=='string')throw failure('AI_INVALID_RESPONSE');
   if(finish&&finish!=='stop'&&finish!=='null')throw failure('AI_INCOMPLETE');text=content;done=finish==='stop';if(!stream&&!done)throw failure('AI_INCOMPLETE');break;
  }
  case'gemini':{
   const c=value.candidates?.[0];if(!c){if(value.promptFeedback?.blockReason)throw failure('AI_REMOTE_ERROR');if(!Array.isArray(value.candidates))throw failure('AI_INVALID_RESPONSE');return{text:'',done:false};}
   if(c.finishReason&&c.finishReason!=='STOP')throw failure('AI_INCOMPLETE');
   if(c.content?.parts&&!Array.isArray(c.content.parts))throw failure('AI_INVALID_RESPONSE');
   text=(c.content?.parts||[]).filter((p:any)=>typeof p.text==='string'&&!p.thought).map((p:any)=>p.text).join('');done=c.finishReason==='STOP'||!stream;break;
  }
  default:throw failure('AI_PROTOCOL_NOT_READY');
 }
 return{text,done};
}

// Services name the context window differently (OpenRouter/Together context_length, Groq context_window, Mistral max_context_length,
// vLLM max_model_len, Gemini inputTokenLimit); whatever is present and plausible is kept.
const windowFields=['context_length','context_window','max_context_length','max_model_len','max_input_tokens','inputTokenLimit'];
function reportedWindow(item:any):number|undefined{
 for(const value of [...windowFields.map(f=>item?.[f]),item?.top_provider?.context_length]){const n=typeof value==='string'?Number(value):value;if(Number.isSafeInteger(n)&&n>=1024&&n<=10_000_000)return n;}
 return undefined;
}
export async function listAiModels(profile:AiProfileInput,options:{signal?:AbortSignal;fetch?:typeof fetch}={}):Promise<string[]>{return(await listAiModelInfo(profile,options)).map(m=>m.id);}
export async function listAiModelInfo(profile:AiProfileInput,options:{signal?:AbortSignal;fetch?:typeof fetch}={}):Promise<AiModelInfo[]>{
 if(profile.protocol==='dashscope'||profile.protocol==='spark')throw failure('AI_MODEL_DISCOVERY_UNSUPPORTED');
 const request=buildAiRequest(profile,{system:'',user:'Model discovery'},false),url=new URL(request.url);
 if(profile.protocol==='gemini')url.pathname=url.pathname.replace(/\/models\/[^/]+:generateContent$/,'/models');
 else url.pathname=url.pathname.replace(/\/(chat\/completions|responses|messages)$/,'/models');
 url.search='';const timer=new AbortController(),timeout=setTimeout(()=>timer.abort(),profile.timeoutMs);const signal=options.signal?AbortSignal.any([options.signal,timer.signal]):timer.signal;
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const response=await(options.fetch||fetch)(url,{method:'GET',headers:{...request.headers,Accept:'application/json'},redirect:'error',signal});
  if(!response.ok){await response.body?.cancel();throw failure('AI_HTTP_'+response.status);}if(!response.body)throw failure('AI_INVALID_RESPONSE');
  reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_RESPONSE_BYTES)throw failure('AI_RESPONSE_TOO_LARGE');chunks.push(chunk.value);}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('AI_INVALID_RESPONSE');}
  const list=profile.protocol==='gemini'?value.models:value.data;if(!Array.isArray(list))throw failure('AI_INVALID_RESPONSE');
  const seen=new Set<string>(),models:AiModelInfo[]=[];
  for(const v of list){const id=profile.protocol==='gemini'?v?.name?.replace(/^models\//,''):v?.id;if(typeof id!=='string'||!id.length||id.length>200||seen.has(id))continue;seen.add(id);const contextWindow=reportedWindow(v);models.push(contextWindow?{id,contextWindow}:{id});if(models.length>=1000)break;}
  return models;
 }catch(error){if(options.signal?.aborted)throw failure('AI_CANCELLED');if(timer.signal.aborted)throw failure('AI_TIMEOUT');if(error instanceof Error&&/^AI_[A-Z_0-9]+$/.test(error.message))throw error;throw failure('AI_REQUEST_FAILED');}
 finally{clearTimeout(timeout);await reader?.cancel().catch(()=>{});reader?.releaseLock();}
}

// "Context too long" in the words of OpenAI/DeepSeek, Anthropic, Gemini and common relays.
const overflow=/context[_ ]length|context window|maximum context|prompt is too long|input is too long|too many tokens|token limit|input token count|reduce the length of the (messages|prompt)/i;
const overflowLimit=[/maximum context length is (\d{4,8})/i,/> ?(\d{4,8}) maximum/i,/allowed \((\d{4,8})\)/i,/(?:limit|maximum)(?: of| is)? (\d{4,8}) tokens/i];
/** Error code for a failed HTTP response. An over-long prompt becomes AI_CONTEXT_OVERFLOW, with the service's real window when it states one. */
async function httpFailure(response:Response):Promise<Error>{
 if(![400,413,422].includes(response.status)||!response.body){await response.body?.cancel();return failure('AI_HTTP_'+response.status);}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(size<16384){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;chunks.push(chunk.value);}}catch{/* keep what arrived */}finally{await reader.cancel().catch(()=>{});}
 const text=Buffer.concat(chunks).toString('utf8');
 if(!overflow.test(text))return failure('AI_HTTP_'+response.status);
 for(const pattern of overflowLimit){const n=Number(pattern.exec(text)?.[1]);if(Number.isSafeInteger(n)&&n>=1024&&n<=10_000_000)return failure('AI_CONTEXT_OVERFLOW_'+n);}
 return failure('AI_CONTEXT_OVERFLOW');
}

export async function generateText(profile:AiProfileInput,prompt:AiPrompt,options:{stream?:boolean;signal?:AbortSignal;onDelta?:(text:string)=>void;fetch?:typeof fetch}={}):Promise<string>{
 if(profile.protocol==='spark')return generateSpark(profile,prompt,options);
 const stream=options.stream!==false,request=buildAiRequest(profile,prompt,stream),timer=new AbortController();
 const timeout=setTimeout(()=>timer.abort(),profile.timeoutMs);
 const signal=options.signal?AbortSignal.any([options.signal,timer.signal]):timer.signal;
 let text='',bytes=0,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const emit=(delta:string)=>{if(!delta)return;text+=delta;if(text.length>MAX_RESPONSE_BYTES)throw failure('AI_RESPONSE_TOO_LARGE');options.onDelta?.(delta);};
 try{
  const response=await(options.fetch||fetch)(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),redirect:'error',signal});
  if(!response.ok)throw await httpFailure(response);
  if(!response.body)throw failure('AI_INVALID_RESPONSE');
  reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',done=false;
  const sse=stream&&!response.headers.get('content-type')?.includes('application/json');
  const frame=(raw:string)=>{
   if(new TextEncoder().encode(raw).byteLength>MAX_EVENT_BYTES)throw failure('AI_RESPONSE_TOO_LARGE');
   const lines=raw.split(/\r?\n/),data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
   const event=lines.find(line=>line.startsWith('event:'))?.slice(6).trim();
   if(event==='error')throw failure('AI_REMOTE_ERROR');if(!data)return;
   if(data==='[DONE]'){if(profile.protocol!=='openai-chat')throw failure('AI_INVALID_RESPONSE');done=true;return;}
   let value;try{value=JSON.parse(data);}catch{throw failure('AI_INVALID_RESPONSE');}
   const decoded=decodeObject(profile,value,true);let delta=decoded.text;if(profile.protocol==='dashscope'&&profile.parameters.incremental_output===false){if(!delta.startsWith(text))throw failure('AI_INVALID_RESPONSE');delta=delta.slice(text.length);}emit(delta);done||=decoded.done;
  };
  while(!done){
   const chunk=await reader.read();if(chunk.done){pending+=decoder.decode();break;}
   bytes+=chunk.value.byteLength;if(bytes>MAX_RESPONSE_BYTES)throw failure('AI_RESPONSE_TOO_LARGE');
   pending+=decoder.decode(chunk.value,{stream:true});
   if(sse){let split:RegExpExecArray|null;while((split=/\r?\n\r?\n/.exec(pending))){const raw=pending.slice(0,split.index);pending=pending.slice(split.index+split[0].length);frame(raw);if(done)break;}if(pending.length>MAX_EVENT_BYTES)throw failure('AI_RESPONSE_TOO_LARGE');}
  }
  if(!sse){let value;try{value=JSON.parse(pending);}catch{throw failure('AI_INVALID_RESPONSE');}const decoded=decodeObject(profile,value,false);emit(decoded.text);done=decoded.done;}
  else if(!done&&pending.trim())frame(pending);
  if(!done||!text.trim())throw failure('AI_INCOMPLETE');return text;
 }catch(error){
  if(options.signal?.aborted)throw failure('AI_CANCELLED');if(timer.signal.aborted)throw failure('AI_TIMEOUT');
  if(error instanceof Error&&/^AI_[A-Z_0-9]+$/.test(error.message))throw error;
  throw failure('AI_REQUEST_FAILED');
 }finally{clearTimeout(timeout);await reader?.cancel().catch(()=>{});reader?.releaseLock();}
}
