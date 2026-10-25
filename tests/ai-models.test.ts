import {afterEach,expect,it} from 'vitest';
import {createServer,type Server,type RequestListener} from 'node:http';
import {generateText,listAiModelInfo} from '../src/main/ai-client';
import {knownContextWindow,pickDefaultModel,resolveContextWindow,FALLBACK_CONTEXT_WINDOW} from '../src/shared/ai-models';
import type {AiProfileInput,AiProtocol} from '../src/shared/ai';
const servers:Server[]=[];
async function server(handler:RequestListener){const s=createServer(handler);servers.push(s);await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return`http://127.0.0.1:${(s.address() as any).port}/v1`;}
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
const profile=(endpoint:string,protocol:AiProtocol='openai-chat'):AiProfileInput=>({id:'t',name:'t',protocol,endpoint,model:'m',credential:{kind:'api-key',apiKey:'k'},maxOutputTokens:256,timeoutMs:2000,parameters:{}});
const prompt={system:'s',user:'u'};

it('discovery keeps the context window a relay or aggregator reports, under any of the common field names',async()=>{
 const endpoint=await server((_q,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'openai/gpt-4o',context_length:128000},{id:'anthropic/claude-x',top_provider:{context_length:200000}},{id:'mistral-large',max_context_length:'131072'},{id:'local-vllm',max_model_len:32768},{id:'no-window'},{id:'bogus',context_length:12}]}));});
 expect(await listAiModelInfo(profile(endpoint))).toEqual([{id:'openai/gpt-4o',contextWindow:128000},{id:'anthropic/claude-x',contextWindow:200000},{id:'mistral-large',contextWindow:131072},{id:'local-vllm',contextWindow:32768},{id:'no-window'},{id:'bogus'}]);
});
it('the catalog knows common families across vendor prefixes and reads sizes written in the name',()=>{
 expect(knownContextWindow('gpt-4o-mini')).toEqual({tokens:128000,source:'catalog'});
 expect(knownContextWindow('openai/gpt-4.1').tokens).toBe(1047576);
 expect(knownContextWindow('claude-sonnet-4-5').tokens).toBe(200000);
 expect(knownContextWindow('deepseek-ai/DeepSeek-V3').tokens).toBe(128000);
 expect(knownContextWindow('Qwen/Qwen2.5-72B-Instruct').tokens).toBe(131072);
 expect(knownContextWindow('moonshot-v1-32k').tokens).toBe(32000);
 expect(knownContextWindow('gemini-2.5-pro').tokens).toBe(1048576);
 expect(knownContextWindow('totally-new-model')).toEqual({tokens:FALLBACK_CONTEXT_WINDOW,source:'fallback'});
 expect(resolveContextWindow('gpt-4o',64000)).toEqual({tokens:64000,source:'service'});
 expect(resolveContextWindow('gpt-4o',5)).toEqual({tokens:128000,source:'catalog'});
});
it('a pasted key is enough: a sensible chat model is chosen from the discovered list',()=>{
 expect(pickDefaultModel(['text-embedding-3-small','whisper-1','gpt-4o-mini','gpt-4o'])).toBe('gpt-4o');
 expect(pickDefaultModel(['deepseek-reasoner','deepseek-chat'])).toBe('deepseek-chat');
 expect(pickDefaultModel(['text-embedding-v3','qwen-turbo'])).toBe('qwen-turbo');
 expect(pickDefaultModel([])).toBe(null);
});
for(const [label,status,body,code] of [
 ['OpenAI / DeepSeek',400,{error:{message:"This model's maximum context length is 65536 tokens. However, you requested 70000 tokens.",code:'context_length_exceeded'}},'AI_CONTEXT_OVERFLOW_65536'],
 ['Anthropic',400,{type:'error',error:{type:'invalid_request_error',message:'prompt is too long: 250000 tokens > 200000 maximum'}},'AI_CONTEXT_OVERFLOW_200000'],
 ['Gemini',400,{error:{message:'The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).'}},'AI_CONTEXT_OVERFLOW_1048576'],
 ['relay without a number',413,{error:{message:'Request too large: context window exceeded'}},'AI_CONTEXT_OVERFLOW'],
 ['unrelated bad request',400,{error:{message:'temperature must be between 0 and 2'}},'AI_HTTP_400'],
 ['server error',500,{error:{message:'maximum context length is 4096'}},'AI_HTTP_500'],
] as const)it(`${label}: an over-long prompt is reported as AI_CONTEXT_OVERFLOW with the real window when stated`,async()=>{
 const endpoint=await server((_q,res)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(body));});
 await expect(generateText(profile(endpoint),prompt,{stream:false})).rejects.toThrow(new RegExp('^'+code+'$'));
});
it('long prompts within the shared bound are no longer rejected locally',async()=>{
 const endpoint=await server((_q,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'ok'},finish_reason:'stop'}]}));});
 expect(await generateText(profile(endpoint),{system:'s',user:'x '.repeat(300000)},{stream:false})).toBe('ok');
});
import {buildAiRequest} from '../src/main/ai-client';
const img={mediaType:'image/jpeg' as const,data:'QUJD'};
const turns=[{role:'assistant' as const,text:'{"actions":[{"type":"view_page","pageNumber":2}]}'},{role:'user' as const,text:'第 2 页如下',images:[img]}];
it('follow-up turns carry page images in each protocol\'s own shape',()=>{
 const chat=buildAiRequest(profile('https://x.example/v1'),{...prompt,turns},false).body;expect(chat.messages.slice(2)).toEqual([{role:'assistant',content:turns[0].text},{role:'user',content:[{type:'text',text:'第 2 页如下'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,QUJD'}}]}]);
 const claude=buildAiRequest(profile('https://x.example/v1','anthropic-messages'),{...prompt,turns},false).body;expect(claude.messages[2].content[1]).toEqual({type:'image',source:{type:'base64',media_type:'image/jpeg',data:'QUJD'}});
 const gemini=buildAiRequest(profile('https://x.example/v1beta','gemini'),{...prompt,turns},false).body;expect(gemini.contents[1].role).toBe('model');expect(gemini.contents[2].parts[1]).toEqual({inline_data:{mime_type:'image/jpeg',data:'QUJD'}});
 const responses=buildAiRequest(profile('https://x.example/v1/responses','openai-responses'),{...prompt,turns},false).body;expect(responses.input[2].content[1]).toEqual({type:'input_image',image_url:'data:image/jpeg;base64,QUJD'});
 expect(buildAiRequest(profile('https://x.example/v1'),prompt,false).body.messages).toHaveLength(2);
});
it('turns are bounded and shape-checked; text-only protocols refuse images',()=>{
 expect(()=>buildAiRequest(profile('https://dashscope.example/api/v1','dashscope'),{...prompt,turns},false)).toThrow('AI_IMAGES_UNSUPPORTED');
 for(const bad of [[{role:'system',text:'x'}],[{role:'assistant',text:'x',images:[img]}],[{role:'user',text:'x',images:[{mediaType:'image/gif',data:'QUJD'}]}],[{role:'user',text:'x',images:[{mediaType:'image/png',data:'not base64!'}]}],Array.from({length:13},()=>({role:'user',text:'x'})),[{role:'user',text:'x',images:Array(7).fill(img)}]])
  expect(()=>buildAiRequest(profile('https://x.example/v1'),{...prompt,turns:bad as any},false)).toThrow('AI_INVALID_PROMPT');
});

import {forgetLearnedOutputLimits,requestMaxOutput} from '../src/main/ai-client';
import {knownMaxOutput,profileMaxOutput,resolveMaxOutput,canSeeImages,FALLBACK_MAX_OUTPUT} from '../src/shared/ai-models';
it('output limits come from the catalog; the legacy 2048 default reads as the model\'s own limit',()=>{
 expect(knownMaxOutput('deepseek-flash')).toEqual({tokens:384000,source:'catalog'});
 expect(knownMaxOutput('gpt-4o-mini').tokens).toBe(16384);
 expect(knownMaxOutput('claude-sonnet-4-5').tokens).toBe(64000);
 expect(knownMaxOutput('mystery-model')).toEqual({tokens:FALLBACK_MAX_OUTPUT,source:'fallback'});
 expect(resolveMaxOutput('gpt-4o',8000)).toEqual({tokens:8000,source:'service'});
 expect(profileMaxOutput({model:'deepseek-flash',maxOutputTokens:2048})).toBe(384000);
 expect(profileMaxOutput({model:'deepseek-flash',maxOutputTokens:3000})).toBe(3000);
 expect(knownContextWindow('deepseek-flash').tokens).toBe(1048576);
 expect(canSeeImages({model:'deepseek-flash'})).toBe(true);expect(canSeeImages({model:'deepseek-v4-pro'})).toBe(false);
 expect(pickDefaultModel(['deepseek-v4-pro','deepseek-flash'])).toBe('deepseek-flash');
});
for(const [label,message,learned] of [
 ['DeepSeek','Invalid max_tokens value, the valid range of max_tokens is [1, 8192]',8192],
 ['OpenAI','max_tokens is too large: 384000. This model supports at most 16384 completion tokens, whereas you provided 384000.',16384],
 ['Anthropic','max_tokens: 384000 > 64000, which is the maximum allowed number of output tokens for claude-x',64000],
] as const)it(`${label}: a too-large output limit is learned from the 400 reply and the request is retried within it`,async()=>{
 forgetLearnedOutputLimits();const asked:number[]=[];
 const endpoint=await server(async(q,res)=>{let raw='';for await(const c of q)raw+=c;const max=JSON.parse(raw).max_tokens;asked.push(max);res.setHeader('content-type','application/json');if(max>learned){res.statusCode=400;res.end(JSON.stringify({error:{message}}));return;}res.end(JSON.stringify({choices:[{message:{content:'ok'},finish_reason:'stop'}]}));});
 const p={...profile(endpoint),model:'deepseek-flash',maxOutputTokens:2048};
 expect(await generateText(p,prompt,{stream:false})).toBe('ok');expect(asked).toEqual([384000,learned]);
 expect(requestMaxOutput(p)).toBe(learned);expect(await generateText(p,prompt,{stream:false})).toBe('ok');expect(asked).toHaveLength(3);
 forgetLearnedOutputLimits();
});
it('an output-limit 400 without a number is retried once lower; a second refusal is a plain 400',async()=>{
 forgetLearnedOutputLimits();const asked:number[]=[];
 const endpoint=await server(async(q,res)=>{let raw='';for await(const c of q)raw+=c;asked.push(JSON.parse(raw).max_tokens);res.statusCode=400;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:{message:'max_tokens is too large'}}));});
 await expect(generateText({...profile(endpoint),maxOutputTokens:20000},prompt,{stream:false})).rejects.toThrow(/^AI_HTTP_400$/);expect(asked).toEqual([20000,4096]);
 forgetLearnedOutputLimits();
});
it('the timeout bounds silence, not a long reply that keeps streaming (thinking models)',async()=>{
 const endpoint=await server((_q,res)=>{res.setHeader('content-type','text/event-stream');let n=0;const tick=setInterval(()=>{n++;if(n<8){res.write('data: {"choices":[{"delta":{"reasoning_content":"…","content":null}}]}\n\n');return;}clearInterval(tick);res.end('data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');},60);});
 expect(await generateText({...profile(endpoint),timeoutMs:200},prompt)).toBe('done');
});
