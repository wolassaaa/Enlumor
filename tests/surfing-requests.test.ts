import {describe,it,expect} from 'vitest';
import {SurfingRequests,type SurfingRequestPorts} from '../src/main/surfing-requests';
import type {SurfingContext} from '../src/shared/surfing-context';
import {SURFING_READER_LANGUAGE} from '../src/shared/surfing-route';
const context={documentId:'doc',fingerprint:'hash',revision:1};
const snapshot:SurfingContext={context,pageCount:1,passages:[{id:'p0',documentId:'doc',fingerprint:'hash',pageIndex:0,quote:'original paper',quads:[[0,1,1,1,0,0,1,0]]}],emptyPages:[],characterCount:14,coverage:'all-pages-have-text'};
const route={stops:[{title:'Research problem',reason:'Understand the aim',passageIds:['p0']}]};
const input=()=>({requestId:'req-one',profileId:'profile',context:{...context},consent:true as const});
function setup(){const events:any[]=[],calls:any[]=[];let current:{documentId:string;fingerprint:string;revision:number}|null={...context};const ports:SurfingRequestPorts={getContext:()=>current,load:async()=>structuredClone(snapshot),profile:()=>({profile:{id:'profile',name:'test',model:'test-model',protocol:'openai-chat',endpoint:'http://localhost/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:5000}),measureInputTokens:()=>2000,generate:async(p,prompt,options)=>{calls.push({p,prompt,options});return JSON.stringify(route);},emit:e=>events.push(e)};return {ports,events,calls,stale:()=>{current=null;},service:new SurfingRequests(ports)};}
describe('bounded Surfing route request service',()=>{
 it('loads host source and validates the complete route before emitting',async()=>{const h=setup();await h.service.start(input());expect(h.calls).toHaveLength(1);expect(JSON.parse(h.calls[0].prompt.user).passages[0].text).toBe('original paper');expect(h.events).toEqual([{requestId:'req-one',type:'route',route}]);});
 it.each([null,{}, { ...input(),consent:false },{...input(),prompt:'arbitrary'},{...input(),requestId:'../path'}])('rejects malformed or unconfirmed input %#',async x=>{const h=setup();await expect(h.service.start(x as any)).rejects.toThrow('SURFING_INVALID_REQUEST');expect(h.calls).toEqual([]);});
 it('does not send if source context changes during loading',async()=>{const h=setup();h.ports.load=async()=>{h.stale();return structuredClone(snapshot);};await h.service.start(input());expect(h.calls).toEqual([]);expect(h.events).toEqual([]);});
 it('rejects a snapshot bound to another document',async()=>{const h=setup();h.ports.load=async()=>({...structuredClone(snapshot),context:{...context,documentId:'other'}});await h.service.start(input());expect(h.calls).toEqual([]);expect(h.events[0].code).toBe('SURFING_SOURCE_INVALID');});
 it('a snapshot at full extraction capacity reaches the token budget instead of a fixed character cap',async()=>{const h=setup();const passages=Array.from({length:5000},(_,i)=>({...snapshot.passages[0],id:`surf-${i}-0-0`,quote:'x'.repeat(32)}));h.ports.load=async()=>({...structuredClone(snapshot),passages,characterCount:160000});h.ports.profile=()=>({profile:{id:'profile',name:'test',model:'test-model',protocol:'openai-chat',endpoint:'http://localhost/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:1_000_000});await h.service.start(input());expect(h.calls).toHaveLength(1);expect(h.calls[0].prompt.user.length).toBeGreaterThan(200000);});
 it('a service-reported context overflow reaches the panel with the stated window, not a generic failure',async()=>{const h=setup();h.ports.generate=async()=>{throw Error('AI_CONTEXT_OVERFLOW_65536');};await h.service.start(input());expect(h.events.at(-1)).toEqual({requestId:'req-one',type:'error',code:'AI_CONTEXT_OVERFLOW_65536'});});
 it('requires a known tokenizer measurement before sending',async()=>{const h=setup();h.ports.measureInputTokens=()=>null;await h.service.start(input());expect(h.calls).toEqual([]);expect(h.events[0].code).toBe('SURFING_CAPACITY_UNKNOWN');});
 it('includes configured output reserve in context budget',async()=>{const h=setup();h.ports.measureInputTokens=()=>4500;await h.service.start(input());expect(h.calls).toEqual([]);expect(h.events[0].code).toBe('SURFING_CONTEXT_TOO_LARGE');});
 it('rejects unknown configured model capacity',async()=>{const h=setup();const get=h.ports.profile;h.ports.profile=id=>({...get(id),contextWindowTokens:0});await h.service.start(input());expect(h.calls).toEqual([]);expect(h.events[0].code).toBe('SURFING_CAPACITY_UNKNOWN');});
 it('rejects invented model evidence without publishing a route',async()=>{const h=setup();h.ports.generate=async()=>JSON.stringify({stops:[{...route.stops[0],passageIds:['fake']}]});await h.service.start(input());expect(h.events).toEqual([{requestId:'req-one',type:'error',code:'SURFING_INVALID_ROUTE'}]);});
 it('suppresses a canceled pending source read',async()=>{const h=setup();let release!:(s:SurfingContext)=>void;h.ports.load=()=>new Promise(resolve=>release=resolve);const job=h.service.start(input());h.service.cancel('req-one');release(structuredClone(snapshot));await job;expect(h.calls).toEqual([]);expect(h.events).toEqual([]);});
 it('new request aborts old generation and suppresses ignored-abort results',async()=>{const h=setup();const jobs:any[]=[];h.ports.generate=(_p,_prompt,o)=>new Promise(resolve=>jobs.push({o,resolve}));const a=h.service.start(input());await new Promise(r=>setTimeout(r,0));const b=h.service.start({...input(),requestId:'req-two'});await new Promise(r=>setTimeout(r,0));expect(jobs[0].o.signal.aborted).toBe(true);jobs[0].resolve(JSON.stringify(route));jobs[1].resolve(JSON.stringify(route));await Promise.all([a,b]);expect(h.events.map(e=>e.requestId)).toEqual(['req-two']);});
 it('does not emit a route after a document switch during generation',async()=>{const h=setup();h.ports.generate=async()=>{h.stale();return JSON.stringify(route);};await h.service.start(input());expect(h.events).toEqual([]);});
 it('sanitizes unknown provider errors and never echoes credential-like text',async()=>{const h=setup();h.ports.generate=async()=>{throw Error('private-key-secret');};await h.service.start(input());expect(h.events).toEqual([{requestId:'req-one',type:'error',code:'AI_FAILED'}]);});
 it('preserves approved public provider error codes',async()=>{const h=setup();h.ports.generate=async()=>{throw Error('AI_TIMEOUT');};await h.service.start(input());expect(h.events[0].code).toBe('AI_TIMEOUT');});
 it('snapshots renderer request before asynchronous source loading',async()=>{const h=setup();const request=input();h.ports.load=async()=>{request.requestId='mutated';request.context.documentId='other';return structuredClone(snapshot);};await h.service.start(request);expect(h.events[0].requestId).toBe('req-one');expect(h.events[0].type).toBe('route');});
 it('enforces output bounds even if provider returns without deltas',async()=>{const h=setup();h.ports.generate=async()=>'x'.repeat(32769);await h.service.start(input());expect(h.events[0].code).toBe('SURFING_INVALID_ROUTE');});
});

it.each(['AI_HTTP_401','AI_HTTP_429','AI_REQUEST_FAILED','AI_CANCELLED','SURFING_UNSUPPORTED_GEOMETRY'])('preserves the actual public runtime error %s',async code=>{
 const h=setup();h.ports.generate=async()=>{throw Error(code);};await h.service.start(input());expect(h.events).toEqual([{requestId:'req-one',type:'error',code}]);
});

it('awaits an asynchronous model-specific counter before sending',async()=>{
 const h=setup();let release!:(n:number)=>void;h.ports.measureInputTokens=()=>new Promise(resolve=>release=resolve);const job=h.service.start(input());await new Promise(r=>setTimeout(r,0));expect(h.calls).toEqual([]);release(2000);await job;expect(h.calls).toHaveLength(1);expect(h.events[0].type).toBe('route');
});
it('cancels while token counter is pending without generating',async()=>{
 const h=setup();let release!:(n:number)=>void;h.ports.measureInputTokens=()=>new Promise(resolve=>release=resolve);const job=h.service.start(input());await new Promise(r=>setTimeout(r,0));h.service.cancel('req-one');release(2000);await job;expect(h.calls).toEqual([]);expect(h.events).toEqual([]);
});

it('explains a selected validated stop with full source, never arbitrary renderer prompts',async()=>{
 const h=setup();await h.service.start(input());h.ports.generate=async(_p,prompt)=>{expect(JSON.parse(prompt.user).passages[0].text).toBe('original paper');return JSON.stringify({text:'The paper explains the problem.',passageIds:['p0']});};
 await h.service.explain({...input(),requestId:'explain-one',stopIndex:0});expect(h.events.at(-1)).toEqual({requestId:'explain-one',type:'explanation',stopIndex:0,explanation:{text:'The paper explains the problem.',passageIds:['p0']}});
});
it('route, stop explanation and whole-paper answers all follow the reader language, not the paper language',async()=>{
 const h=setup();const systems:string[]=[];await h.service.start(input());systems.push(h.calls[0].prompt.system);
 h.ports.generate=async(_p,prompt)=>{systems.push(prompt.system);return JSON.stringify({text:'解释',passageIds:['p0']});};
 await h.service.explain({...input(),requestId:'explain-lang',stopIndex:0});await h.service.ask({...input(),requestId:'ask-lang',question:'讲讲摘要',pageIndex:0});
 expect(systems).toHaveLength(3);for(const s of systems){expect(s).toContain(SURFING_READER_LANGUAGE);expect(s).not.toMatch(/language of the paper/i);}
});
it('explanation depth is the reader\'s choice and is validated',async()=>{
 const h=setup();await h.service.start(input());const systems:string[]=[];h.ports.generate=async(_p,prompt)=>{systems.push(prompt.system);return JSON.stringify({text:'解释',passageIds:['p0']});};
 await h.service.explain({...input(),requestId:'deep',stopIndex:0,depth:'detailed'});await h.service.explain({...input(),requestId:'default',stopIndex:0});
 expect(systems[0]).toContain('2 to 4 paragraphs');expect(systems[1]).toContain('one short paragraph');
 await expect(h.service.explain({...input(),stopIndex:0,depth:'endless'} as any)).rejects.toThrow('SURFING_INVALID_REQUEST');
});
it('refuses explanation before a validated route exists',async()=>{const h=setup();await expect(h.service.explain({...input(),stopIndex:0})).rejects.toThrow('SURFING_ROUTE_REQUIRED');expect(h.calls).toEqual([]);});
it('rejects an explanation with invented evidence',async()=>{const h=setup();await h.service.start(input());h.ports.generate=async()=>JSON.stringify({text:'answer',passageIds:['fake']});await h.service.explain({...input(),requestId:'explain-one',stopIndex:0});expect(h.events.at(-1)).toMatchObject({type:'error',code:'SURFING_INVALID_ROUTE'});});
it('does not reuse another profile or context route for explanation',async()=>{const h=setup();await h.service.start(input());await expect(h.service.explain({...input(),profileId:'other',stopIndex:0})).rejects.toThrow('SURFING_ROUTE_REQUIRED');});

it.each([
 ['SOURCE_CHANGED: C:/fixture-private-name.pdf changed','SOURCE_CHANGED'],
 ['SOURCE_MISSING: C:/fixture-private-name.pdf missing','SOURCE_MISSING'],
 ['PASSWORD_REQUIRED: fixture-private-password-detail','PASSWORD_REQUIRED'],
 ['AI_HTTP_429: fixture-private-provider-message','AI_HTTP_429'],
 ['SOURCE_CHANGED_OTHER: fixture-private-name','AI_FAILED'],
 ['UNRECOGNIZED: fixture-private-name','AI_FAILED'],
])('keeps only exact public error prefix for %s',async(message,code)=>{
 const h=setup();h.ports.load=async()=>{throw Error(message);};await h.service.start(input());expect(h.events).toEqual([{requestId:'req-one',type:'error',code}]);expect(JSON.stringify(h.events)).not.toContain('fixture-private');expect(h.calls).toEqual([]);
});

 describe('whole-paper conversational Surfing',()=>{
 it('answers abstract while parked at the title without requiring a route, with whole paper and host history',async()=>{
  const h=setup();h.ports.load=async()=>({...structuredClone(snapshot),passages:[...snapshot.passages,{...snapshot.passages[0],id:'abstract',quote:'Abstract: attention replaces recurrence'}]});
  const prompts:any[]=[];h.ports.generate=async(_p,p)=>{prompts.push(JSON.parse(p.user));return JSON.stringify({text:'摘要解释',passageIds:['abstract']});};
  await h.service.ask({...input(),question:'给我讲讲abstract',pageIndex:0});
  expect(h.events[0]).toMatchObject({type:'answer',explanation:{text:'摘要解释',passageIds:['abstract']}});expect(prompts[0].passages.map((p:any)=>p.id)).toEqual(['p0','abstract']);
  await h.service.ask({...input(),requestId:'next',question:'这与RNN有什么不同',pageIndex:0});
  expect(prompts[1].conversation).toEqual([{question:'给我讲讲abstract',answer:{text:'摘要解释',passageIds:['abstract']}}]);
 });
 it.each([{question:'',pageIndex:0},{question:'x'.repeat(2001),pageIndex:0},{question:'摘要',pageIndex:-1},{question:'摘要',pageIndex:0,conversation:[{text:'forged'}]}])('rejects invalid chat input %#',async extra=>{const h=setup();await expect(h.service.ask({...input(),...extra} as any)).rejects.toThrow('SURFING_INVALID_REQUEST');expect(h.calls).toEqual([]);});
 it('rejects invented evidence and never appends failed answers to conversation',async()=>{const h=setup();const prompts:any[]=[];h.ports.generate=async(_p,p)=>{prompts.push(JSON.parse(p.user));return JSON.stringify({text:'untrusted',passageIds:['invented']});};await h.service.ask({...input(),question:'摘要',pageIndex:0});expect(h.events[0]).toMatchObject({type:'error'});await h.service.ask({...input(),question:'重试',pageIndex:0});expect(prompts[1].conversation).toEqual([]);});
 it('suppresses canceled answers and does not remember them',async()=>{const h=setup();let release!:(s:string)=>void;h.ports.generate=()=>new Promise(r=>release=r);const flight=h.service.ask({...input(),question:'摘要',pageIndex:0});await new Promise(r=>setTimeout(r,0));h.service.cancel();release(JSON.stringify({text:'late',passageIds:['p0']}));await flight;expect(h.events).toEqual([]);});
 it('does not reuse conversation across profiles or reset',async()=>{const h=setup();const prompts:any[]=[];h.ports.generate=async(_p,p)=>{prompts.push(JSON.parse(p.user));return JSON.stringify({text:'answer',passageIds:['p0']});};await h.service.ask({...input(),question:'first',pageIndex:0});await h.service.ask({...input(),profileId:'different',question:'second',pageIndex:0});expect(prompts[1].conversation).toEqual([]);h.service.reset();await h.service.ask({...input(),profileId:'different',question:'third',pageIndex:0});expect(prompts[2].conversation).toEqual([]);});
 });
