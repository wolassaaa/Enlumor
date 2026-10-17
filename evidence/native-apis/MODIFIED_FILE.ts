import{createHmac}from'node:crypto';import type{AiProfileInput,AiPrompt}from'../shared/ai';import{validateAiProfile}from'./ai-config';
const fail=(code:string)=>new Error(code);
export function signSparkUrl(profile:AiProfileInput,now=new Date()):string{
 const url=validateAiProfile(profile),c=profile.credential;if(profile.protocol!=='spark'||c?.kind!=='spark')throw fail('AI_KEY_REQUIRED');if(!Number.isFinite(now.getTime()))throw fail('AI_INVALID_CONFIG');const date=now.toUTCString(),host=url.host;
 const signature=createHmac('sha256',c.apiSecret).update(`host: ${host}\ndate: ${date}\nGET ${url.pathname} HTTP/1.1`).digest('base64');
 url.searchParams.set('authorization',Buffer.from(`api_key="${c.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`).toString('base64'));url.searchParams.set('date',date);url.searchParams.set('host',host);return url.toString();
}
export async function generateSpark(profile:AiProfileInput,prompt:AiPrompt,options:{signal?:AbortSignal;onDelta?:(text:string)=>void;stream?:boolean}={}):Promise<string>{
 const url=signSparkUrl(profile),c=profile.credential!;if(c.kind!=='spark')throw fail('AI_KEY_REQUIRED');if(!prompt||typeof prompt.system!=='string'||typeof prompt.user!=='string'||!prompt.user.trim()||prompt.system.length+prompt.user.length>200000)throw fail('AI_INVALID_PROMPT');if(options.signal?.aborted)throw fail('AI_CANCELLED');
 const supportsSystem=['generalv3.5','max-32k','4.0Ultra','Ultra'].includes(profile.model),messages=supportsSystem?[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]:[{role:'user',content:prompt.system+'\n\n原文数据：\n'+prompt.user}];
 return new Promise((resolve,reject)=>{
  let socket:WebSocket,settled=false,text='',bytes=0,lastSeq=-1;
  const finish=(code?:string)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);try{socket?.close();}catch{}if(code)reject(fail(code));else resolve(text);};
  const abort=()=>finish('AI_CANCELLED'),timer=setTimeout(()=>finish('AI_TIMEOUT'),profile.timeoutMs);options.signal?.addEventListener('abort',abort,{once:true});
  try{socket=new WebSocket(url);}catch{finish('AI_REQUEST_FAILED');return;}
  socket.addEventListener('open',()=>{if(settled)return;try{socket.send(JSON.stringify({header:{app_id:c.appId},parameter:{chat:{domain:profile.model,max_tokens:profile.maxOutputTokens,...profile.parameters}},payload:{message:{text:messages}}}));}catch{finish('AI_REQUEST_FAILED');}});
  socket.addEventListener('message',event=>{if(settled)return;try{
   if(typeof event.data!=='string'||Buffer.byteLength(event.data)>512*1024)throw fail('AI_RESPONSE_TOO_LARGE');bytes+=Buffer.byteLength(event.data);if(bytes>4*1024*1024)throw fail('AI_RESPONSE_TOO_LARGE');let v;try{v=JSON.parse(event.data);}catch{throw fail('AI_INVALID_RESPONSE');}if(!v?.header||!Number.isInteger(v.header.code))throw fail('AI_INVALID_RESPONSE');if(v.header.code!==0)throw fail('AI_REMOTE_ERROR');const choice=v.payload?.choices;
   if(!choice||![0,1,2].includes(choice.status)||!Number.isInteger(choice.seq)||choice.seq<=lastSeq||!Array.isArray(choice.text))throw fail('AI_INVALID_RESPONSE');lastSeq=choice.seq;
   for(const part of choice.text){if(part.role!=='assistant'||typeof part.content!=='string')throw fail('AI_INVALID_RESPONSE');if(part.index!==undefined&&part.index!==0)throw fail('AI_INVALID_RESPONSE');text+=part.content;if(text.length>4*1024*1024)throw fail('AI_RESPONSE_TOO_LARGE');if(part.content)options.onDelta?.(part.content);}
   if(choice.status===2){if(!text.trim())throw fail('AI_INCOMPLETE');finish();}
  }catch(error){finish(error instanceof Error&&/^AI_[A-Z_0-9]+$/.test(error.message)?error.message:'AI_INVALID_RESPONSE');}});
  socket.addEventListener('error',()=>finish(text?'AI_INCOMPLETE':'AI_REQUEST_FAILED'));
  socket.addEventListener('close',()=>finish('AI_INCOMPLETE'));
 });
}

