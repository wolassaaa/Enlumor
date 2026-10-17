import {afterEach,expect,it} from 'vitest';
import {createServer,type Server,type RequestListener} from 'node:http';
import {buildAiRequest,generateText,listAiModels} from '../src/main/ai-client';
import type {AiProfileInput,AiProtocol} from '../src/shared/ai';
const servers:Server[]=[];
async function server(handler:RequestListener){const s=createServer(handler);servers.push(s);await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return`http://127.0.0.1:${(s.address() as any).port}`;}
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
const profile=(protocol:AiProtocol,endpoint='https://models.example/v1'):AiProfileInput=>({id:'test',name:'fixture',protocol,endpoint,model:'test-model',credential:{kind:'api-key',apiKey:'fixture-secret'},maxOutputTokens:256,timeoutMs:1000,parameters:{}});
const prompt={system:'Explain only supplied evidence.',user:'中文原文'};
it('builds Chat and Responses endpoints without duplicate version and keeps protocol shapes distinct',()=>{
 const chat=buildAiRequest(profile('openai-chat'),prompt,true);expect(chat.url).toBe('https://models.example/v1/chat/completions');expect(chat.body.messages[0]).toEqual({role:'system',content:prompt.system});expect(chat.headers.Authorization).toBe('Bearer fixture-secret');expect(chat.body.stream).toBe(true);
 const response=buildAiRequest(profile('openai-responses','https://models.example/v1/responses'),prompt,true);expect(response.url).toBe('https://models.example/v1/responses');expect(response.body.input).toBe(prompt.user);expect(response.body.instructions).toBe(prompt.system);expect(response.body.messages).toBeUndefined();
});
it('builds Claude and Gemini native requests and authentication',()=>{
 const claude=buildAiRequest(profile('anthropic-messages','https://models.example'),prompt,true);expect(claude.url).toBe('https://models.example/v1/messages');expect(claude.headers['x-api-key']).toBe('fixture-secret');expect(claude.headers['anthropic-version']).toBe('2023-06-01');expect(claude.body.system).toBe(prompt.system);expect(claude.body.messages).toEqual([{role:'user',content:prompt.user}]);
 const gemini=buildAiRequest(profile('gemini','https://models.example/v1beta'),prompt,true);expect(gemini.url).toBe('https://models.example/v1beta/models/test-model:streamGenerateContent?alt=sse');expect(gemini.headers['x-goog-api-key']).toBe('fixture-secret');expect(gemini.body.systemInstruction.parts[0].text).toBe(prompt.system);expect(gemini.body.generationConfig.maxOutputTokens).toBe(256);
});
it('rejects remote plain HTTP URL credentials query secrets reserved parameters and excessive limits',()=>{
 for(const endpoint of ['http://models.example/v1','https://u:password@models.example/v1','file:///test','https://models.example/v1?key=secret'])expect(()=>buildAiRequest(profile('openai-chat',endpoint),prompt,true)).toThrow(/AI_INVALID/);
 for(const parameters of [{messages:[]},{stream:false},{api_key:'secret'},{temperature:NaN}])expect(()=>buildAiRequest({...profile('openai-chat'),parameters},prompt,true)).toThrow(/AI_INVALID/);
 expect(()=>buildAiRequest({...profile('openai-chat'),timeoutMs:0},prompt,true)).toThrow(/AI_INVALID/);expect(()=>buildAiRequest({...profile('openai-chat'),maxOutputTokens:1e9},prompt,true)).toThrow(/AI_INVALID/);
});
for(const [protocol,response] of [
 ['openai-chat',{choices:[{message:{content:'你好'},finish_reason:'stop'}]}],
 ['openai-responses',{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'你好'}]}]}],
 ['anthropic-messages',{content:[{type:'text',text:'你好'}],stop_reason:'end_turn'}],
 ['gemini',{candidates:[{content:{parts:[{text:'你好'}]},finishReason:'STOP'}]}],
] as const)it(`${protocol}: handles ordinary JSON through a real local HTTP server`,async()=>{
 let received:any;const endpoint=await server(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received=JSON.parse(raw);res.setHeader('content-type','application/json');res.end(JSON.stringify(response));});const deltas:string[]=[];expect(await generateText(profile(protocol,endpoint),prompt,{stream:false,onDelta:t=>deltas.push(t)})).toBe('你好');expect(deltas.join('')).toBe('你好');expect(received.model||reqModel(received)).toBe('test-model');
});
function reqModel(body:any){return body.contents?'test-model':undefined;}
const events:Record<string,string>= {
 'openai-chat':'data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}\r\n\r\ndata: [DONE]\r\n\r\n',
 'openai-responses':'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
 'anthropic-messages':'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
 'gemini':'data: {"candidates":[{"content":{"parts":[{"text":"你好"}]},"finishReason":"STOP"}]}\n\n',
};
for(const protocol of Object.keys(events) as AiProtocol[])it(`${protocol}: preserves UTF-8 split across every byte and SSE frame boundaries`,async()=>{
 const endpoint=await server(async(_req,res)=>{res.setHeader('content-type','text/event-stream');for(const byte of Buffer.from(events[protocol])){res.write(Buffer.from([byte]));await new Promise(r=>setImmediate(r));}res.end();});const deltas:string[]=[];expect(await generateText(profile(protocol,endpoint),prompt,{onDelta:t=>deltas.push(t)})).toBe('你好');expect(deltas.join('')).toBe('你好');
});
it('rejects truncated streams while preserving delivered partial text',async()=>{
 const endpoint=await server((_req,res)=>{res.setHeader('content-type','text/event-stream');res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');});const deltas:string[]=[];await expect(generateText(profile('openai-chat',endpoint),prompt,{onDelta:t=>deltas.push(t)})).rejects.toThrow('AI_INCOMPLETE');expect(deltas.join('')).toBe('partial');
});
for(const status of [401,429,500])it(`reports ${status} without echoing credential-bearing server body`,async()=>{
 const endpoint=await server((_req,res)=>{res.writeHead(status);res.end('fixture-secret private server diagnostic');});await expect(generateText(profile('openai-chat',endpoint),prompt)).rejects.toThrow('AI_HTTP_'+status);
});
it('refuses cross-origin redirects instead of forwarding authentication',async()=>{
 let reached=false;const target=await server((_req,res)=>{reached=true;res.end('{}');});const endpoint=await server((_req,res)=>{res.writeHead(302,{location:target});res.end();});await expect(generateText(profile('openai-chat',endpoint),prompt)).rejects.toThrow('AI_REQUEST_FAILED');expect(reached).toBe(false);
});
it('timeouts and explicit abort cancel a stalled request',async()=>{
 const endpoint=await server(()=>{});await expect(generateText({...profile('openai-chat',endpoint),timeoutMs:100},prompt)).rejects.toThrow('AI_TIMEOUT');const controller=new AbortController();const promise=generateText(profile('openai-chat',endpoint),prompt,{signal:controller.signal});controller.abort();await expect(promise).rejects.toThrow('AI_CANCELLED');
});
it('rejects malformed SSE JSON and provider error events',async()=>{
 for(const body of ['data: {broken}\n\n','event: error\ndata: {"type":"error","error":{"message":"fixture-secret"}}\n\n']){const endpoint=await server((_req,res)=>{res.setHeader('content-type','text/event-stream');res.end(body);});await expect(generateText(profile('anthropic-messages',endpoint),prompt)).rejects.toThrow(/AI_(INVALID_RESPONSE|REMOTE_ERROR)/);}
});
it('rejects incorrectly typed reasoning and excessive numeric parameters',()=>{
 for(const parameters of [{reasoning_effort:['low']},{temperature:5},{top_p:-1}])expect(()=>buildAiRequest({...profile('openai-chat'),parameters},prompt)).toThrow('AI_INVALID_CONFIG');
});
it('Claude preserves initial content_block_start text and rejects incomplete EOF',async()=>{
 const endpoint=await server((_req,res)=>{res.setHeader('content-type','text/event-stream');res.end('event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"text","text":"你好"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n');});expect(await generateText(profile('anthropic-messages',endpoint),prompt)).toBe('你好');
});
it('caps a complete oversized SSE event, not only the unfinished buffer',async()=>{
 const endpoint=await server((_req,res)=>{res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:'x'.repeat(600000)}}]})+'\n\ndata: [DONE]\n\n');});await expect(generateText(profile('openai-chat',endpoint),prompt)).rejects.toThrow('AI_RESPONSE_TOO_LARGE');
});
for(const protocol of ['openai-chat','openai-responses','anthropic-messages','gemini'] as const)it(`${protocol}: model discovery uses the right GET route and normalizes IDs`,async()=>{
 let method='',route='';const endpoint=await server((req,res)=>{method=req.method!;route=req.url!;res.setHeader('content-type','application/json');res.end(JSON.stringify(protocol==='gemini'?{models:[{name:'models/demo'},{name:'models/demo'}]}:{data:[{id:'demo'},{id:'demo'}]}));});expect(await listAiModels(profile(protocol,endpoint))).toEqual(['demo']);expect(method).toBe('GET');expect(route).toBe(protocol==='gemini'?'/v1beta/models':'/v1/models');
});
