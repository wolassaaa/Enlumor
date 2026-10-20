import{it,expect}from'vitest';
import{ExplanationRequests}from'../src/main/cruise-requests';
import{cruiseReducer,initialCruise}from'../src/shared/cruise';
const input={requestId:'req-one',profileId:'p',block:{id:'b',documentId:'d',fingerprint:'f',pageIndex:0,quote:'original',quads:[[1,10,20,10,1,1,20,1]]}};
const profile:any={id:'p',name:'local',model:'m'};
it('validates before sending, only sends bounded current block, emits deltas/done',async()=>{const events:any[]=[],prompts:any[]=[];let verified=false;const r=new ExplanationRequests(async()=>{verified=true;},()=>profile,async(_p,prompt,o)=>{expect(verified).toBe(true);prompts.push(prompt);o.onDelta?.('answer');return'answer';},e=>events.push(e));await r.start(input);await new Promise(r=>setTimeout(r,0));expect(JSON.parse(prompts[0].user)).toEqual({blockId:'b',text:'original'});expect(events.map(e=>e.type)).toEqual(['delta','done']);});
it('cancel during validation prevents network and late events',async()=>{let release!:()=>void,calls=0;const events:any[]=[];const r=new ExplanationRequests(()=>new Promise(resolve=>release=resolve),()=>profile,async()=>{calls++;return'x';},e=>events.push(e));const pending=r.start(input);r.cancel(input.requestId);release();await pending;expect(calls).toBe(0);expect(events).toEqual([]);});
it('new request aborts old and suppresses old callbacks even if provider ignores abort',async()=>{const jobs:any[]=[],events:any[]=[];const r=new ExplanationRequests(async()=>{},()=>profile,(_p,_prompt,o)=>new Promise(resolve=>jobs.push({o,resolve})),e=>events.push(e));await r.start(input);await r.start({...input,requestId:'req-two'});expect(jobs[0].o.signal.aborted).toBe(true);jobs[0].o.onDelta('wrong');jobs[0].resolve('wrong');jobs[1].o.onDelta('right');jobs[1].resolve('right');await new Promise(r=>setTimeout(r,0));expect(events.every(e=>e.requestId==='req-two')).toBe(true);});
it('rejects invalid payloads and sanitizes verification/provider errors',async()=>{const events:any[]=[];const r=new ExplanationRequests(async()=>{throw Error('private path SECRET');},()=>profile,async()=>'',e=>events.push(e));await expect(r.start({...input,requestId:'bad!'})).rejects.toThrow('CRUISE_INVALID_REQUEST');await expect(r.start({...input,block:{...input.block,quote:'x'.repeat(1201)}})).rejects.toThrow('CRUISE_INVALID_REQUEST');await r.start(input);expect(events[0]).toEqual({requestId:'req-one',type:'error',code:'CRUISE_ANCHOR_INVALID'});});

it('preserves sanitized HTTP status codes for manual retry',async()=>{const events:any[]=[];const r=new ExplanationRequests(async()=>{},()=>profile,async()=>{throw Error('AI_HTTP_429');},e=>events.push(e));await r.start(input);await new Promise(r=>setTimeout(r,0));expect(events[0].code).toBe('AI_HTTP_429');});

for(const answer of ['', ' \n\t'])it(`does not mark an empty resolved explanation successful (${JSON.stringify(answer)})`,async()=>{
 const events:any[]=[];
 const requests=new ExplanationRequests(async()=>{},()=>profile,async(_p,_prompt,o)=>{o.onDelta(answer);return answer;},e=>events.push(e));
 await requests.start(input);await new Promise(r=>setTimeout(r,0));
 expect(events.filter(e=>e.type!=='delta')).toEqual([{requestId:'req-one',type:'error',code:'AI_INCOMPLETE'}]);
});

it('cancel suppresses ignored-abort delta and done after partial text without replacing the paused answer',async()=>{
 let resolve!:(text:string)=>void,options:any;const events:any[]=[];
 let state=cruiseReducer(initialCruise(),{type:'loaded',blocks:[input.block],index:0});
 state=cruiseReducer(state,{type:'explain',requestId:input.requestId,source:{profileId:'p',name:'local',model:'m'}});
 const requests=new ExplanationRequests(async()=>{},()=>profile,(_p,_prompt,o)=>{options=o;return new Promise(r=>resolve=r);},event=>{events.push(event);state=cruiseReducer(state,{type:'text',event});});
 await requests.start(input);options.onDelta('partial');requests.cancel(input.requestId);
 state=cruiseReducer(state,{type:'pause',reason:'manual'});const paused=state;
 options.onDelta('late');resolve('partial late');await new Promise(r=>setTimeout(r,0));
 expect(options.signal.aborted).toBe(true);expect(state).toEqual(paused);
 expect(events).toEqual([{requestId:'req-one',type:'delta',text:'partial'}]);expect(state.results).toEqual({});
});

for(const code of ['AI_HTTP_429','AI_TIMEOUT','AI_INCOMPLETE'])it(`${code} retains partial text but only manual retry populates one successful result`,async()=>{
 let calls=0;const events:any[]=[];
 let state=cruiseReducer(initialCruise(),{type:'loaded',blocks:[input.block],index:0});
 const source={profileId:'p',name:'local',model:'m'};
 const requests=new ExplanationRequests(async()=>{},()=>profile,async(_p,_prompt,o)=>{calls++;o.onDelta(calls===1?'partial':'complete');if(calls===1)throw Error(code);return'complete';},event=>{events.push(event);state=cruiseReducer(state,{type:'text',event});});
 state=cruiseReducer(state,{type:'explain',requestId:input.requestId,source});
 await requests.start(input);await new Promise(r=>setTimeout(r,0));
 expect(state).toMatchObject({status:'error',text:'partial',error:code,results:{}});expect(calls).toBe(1);
 state=cruiseReducer(state,{type:'explain',requestId:'manual-retry',source});
 await requests.start({...input,requestId:'manual-retry'});await new Promise(r=>setTimeout(r,0));
 expect(state).toMatchObject({status:'ready',text:'complete',results:{b:{text:'complete',source}}});
 expect(Object.keys(state.results)).toEqual(['b']);expect(events.filter(e=>e.type==='done')).toEqual([{requestId:'manual-retry',type:'done'}]);expect(calls).toBe(2);
});

for(const followUp of [null,[],{},'question',{question:1},{question:''},{question:' \n\t'},{question:'x'.repeat(1001)},{question:'why?',previousAnswer:1},{question:'why?',previousAnswer:'x'.repeat(8193)}])it(`rejects malformed or unbounded follow-up before verify/network (${JSON.stringify(followUp)?.slice(0,70)})`,async()=>{
 let verifies=0,calls=0;const events:any[]=[];
 const r=new ExplanationRequests(async()=>{verifies++;},()=>profile,async()=>{calls++;return'answer';},e=>events.push(e));
 await expect(r.start({...input,followUp} as any)).rejects.toThrow('CRUISE_INVALID_REQUEST');
 expect(verifies).toBe(0);expect(calls).toBe(0);expect(events).toEqual([]);
});
it('serializes only current evidence, bounded question and explicitly non-evidence previous model answer',async()=>{
 const prompts:any[]=[],events:any[]=[];let verifies=0;
 const r=new ExplanationRequests(async()=>{verifies++;},()=>profile,async(_p,prompt,o)=>{prompts.push(prompt);o.onDelta('follow-up answer');return'follow-up answer';},e=>events.push(e));
 await r.start({...input,followUp:{question:'Why does this matter?',previousAnswer:'Prior model interpretation'},otherPage:'DO NOT SEND'} as any);await new Promise(r=>setTimeout(r,0));
 expect(verifies).toBe(1);expect(JSON.parse(prompts[0].user)).toEqual({blockId:'b',text:'original',question:'Why does this matter?',previousAnswer:'Prior model interpretation'});
 expect(prompts[0].system).toContain('previousAnswer');expect(prompts[0].system).toContain('不是原文');expect(prompts[0].system).toContain('question');
 expect(events.map(e=>e.type)).toEqual(['delta','done']);
});
it('accepts inclusive follow-up boundaries and omits absent previous answer',async()=>{
 const prompts:any[]=[];const r=new ExplanationRequests(async()=>{},()=>profile,async(_p,prompt,o)=>{prompts.push(prompt);o.onDelta('answer');return'answer';},()=>{});
 await r.start({...input,followUp:{question:'q'.repeat(1000),previousAnswer:'p'.repeat(8192)}} as any);await new Promise(r=>setTimeout(r,0));
 expect(JSON.parse(prompts[0].user)).toEqual({blockId:'b',text:'original',question:'q'.repeat(1000),previousAnswer:'p'.repeat(8192)});
 await r.start({...input,followUp:{question:'why?'}} as any);await new Promise(r=>setTimeout(r,0));expect(JSON.parse(prompts[1].user)).toEqual({blockId:'b',text:'original',question:'why?'});
});
it('follow-up shares the normal explanation active slot and still rejects unverified evidence',async()=>{
 const jobs:any[]=[],events:any[]=[];let valid=true;
 const r=new ExplanationRequests(async()=>{if(!valid)throw Error('invalid anchor');},()=>profile,(_p,_prompt,o)=>new Promise(resolve=>jobs.push({o,resolve})),e=>events.push(e));
 await r.start(input);await r.start({...input,requestId:'follow-up',followUp:{question:'why?'}} as any);
 expect(jobs[0].o.signal.aborted).toBe(true);jobs[0].o.onDelta('old answer');jobs[0].resolve('old answer');jobs[1].o.onDelta('new answer');jobs[1].resolve('new answer');await new Promise(r=>setTimeout(r,0));
 expect(events).toEqual([{requestId:'follow-up',type:'delta',text:'new answer'},{requestId:'follow-up',type:'done'}]);
 valid=false;await r.start({...input,requestId:'unverified',followUp:{question:'why?'}} as any);expect(jobs).toHaveLength(2);expect(events.at(-1)).toEqual({requestId:'unverified',type:'error',code:'CRUISE_ANCHOR_INVALID'});
});
