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
