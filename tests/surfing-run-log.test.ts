import {describe,it,expect,afterEach} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {appendSurfingRun,classifySurfingFailure,type SurfingRunRecord} from '../src/main/surfing-run-log';
import {SurfingRequests,type SurfingRequestPorts} from '../src/main/surfing-requests';
import type {SurfingContext} from '../src/shared/surfing-context';
const context={documentId:'doc',fingerprint:'hash-abcdef0123456789',revision:1};
const passage=(id:string,pageIndex:number,quote:string)=>({id,documentId:'doc',fingerprint:context.fingerprint,pageIndex,quote,quads:[[0,1,1,1,0,0,1,0]]});
const snapshot:SurfingContext={context,pageCount:2,passages:[passage('p0',0,'SECRET-PAPER-TEXT about attention.'),passage('p1',1,'Figure 2: Accuracy versus context length.')],emptyPages:[],characterCount:70,coverage:'all-pages-have-text'};
const ask={requestId:'ask',profileId:'profile',context:{...context},consent:true as const,question:'SECRET-QUESTION 图 2 说明了什么？',pageIndex:0};
const final=JSON.stringify({text:'SECRET-ANSWER',passageIds:['p1']});
function setup(replies:(string|Error)[]){
 const runs:SurfingRunRecord[]=[];
 const ports:SurfingRequestPorts={getContext:()=>context,load:async()=>structuredClone(snapshot),profile:()=>({profile:{id:'profile',name:'t',model:'deepseek-chat',protocol:'openai-chat',endpoint:'http://localhost/SECRET-ENDPOINT/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:100000}),measureInputTokens:()=>2000,
  generate:async(_p,_prompt,options)=>{const reply=replies.shift()!;if(reply instanceof Error)throw reply;options.onUsage?.({inputTokens:1900,outputTokens:40,cachedInputTokens:1500});return reply;},emit:()=>{},record:run=>runs.push(run)};
 return{runs,service:new SurfingRequests(ports)};
}
describe('Surfing run records',()=>{
 it('keeps steps, tool use, usage and outcome for a question',async()=>{
  const h=setup([JSON.stringify({actions:[{type:'search',query:'准确率'},{type:'read_page',pageNumber:2}]}),final]);await h.service.ask(ask);
  expect(h.runs).toHaveLength(1);
  expect(h.runs[0]).toMatchObject({version:1,kind:'ask',protocol:'openai-chat',model:'deepseek-chat',document:'hash-abcdef0',pages:2,passages:2,outcome:'answered'});
  expect(h.runs[0].steps).toMatchObject([
   {reply:'actions',measuredInputTokens:2000,usage:{inputTokens:1900,outputTokens:40,cachedInputTokens:1500},actions:[{type:'search',cjk:true,queryLength:3,hits:0},{type:'read_page',pageNumber:2,truncated:false}]},
   {reply:'final'}]);
 });
 it('names why a step failed without keeping what the model said',async()=>{
  const h=setup(['SECRET-REPLY','SECRET-REPLY']);await h.service.ask(ask);
  expect(h.runs[0]).toMatchObject({outcome:'failed',code:'SURFING_INVALID_ROUTE'});expect(h.runs[0].steps.map(s=>s.failure)).toEqual(['not-json','not-json']);expect(JSON.stringify(h.runs)).not.toContain('SECRET');
 });
 it('shows when a reply was recovered',async()=>{
  const wrapped=setup(['```json\n'+final+'\n```']);await wrapped.service.ask(ask);expect(wrapped.runs[0]).toMatchObject({outcome:'answered',steps:[{reply:'final',unwrapped:true}]});
  const repaired=setup(['nope',final]);await repaired.service.ask(ask);expect(repaired.runs[0]).toMatchObject({outcome:'answered',steps:[{failure:'not-json'},{reply:'final'}]});
  const empty=setup([Object.assign(Error('AI_INCOMPLETE'),{emptyReply:true}),final]);await empty.service.ask(ask);expect(empty.runs[0]).toMatchObject({outcome:'answered',steps:[{failure:'empty'},{reply:'final'}]});
 });
 it('records provider failures and cancellation',async()=>{
  const failed=setup([Error('AI_HTTP_429')]);await failed.service.ask(ask);expect(failed.runs[0]).toMatchObject({outcome:'failed',code:'AI_HTTP_429'});
  let cancel=()=>{};const runs:SurfingRunRecord[]=[];
  const service=new SurfingRequests({getContext:()=>context,load:async()=>structuredClone(snapshot),profile:()=>({profile:{id:'profile',name:'t',model:'m',protocol:'openai-chat',endpoint:'http://localhost/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:100000}),measureInputTokens:()=>2000,generate:async()=>{cancel();return final;},emit:()=>{},record:run=>runs.push(run)});
  cancel=()=>service.cancel();await service.ask(ask);expect(runs[0].outcome).toBe('cancelled');
 });
 it('never stores paper text, the question, the answer, a search query or the endpoint',async()=>{
  const h=setup([JSON.stringify({actions:[{type:'search',query:'SECRET-QUERY'}]}),final]);await h.service.ask(ask);
  expect(JSON.stringify(h.runs)).not.toContain('SECRET');
 });
 it('a failing record port does not break the answer',async()=>{
  const events:any[]=[];
  const service=new SurfingRequests({getContext:()=>context,load:async()=>structuredClone(snapshot),profile:()=>({profile:{id:'profile',name:'t',model:'m',protocol:'openai-chat',endpoint:'http://localhost/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:100000}),measureInputTokens:()=>2000,generate:async()=>final,emit:e=>events.push(e),record:()=>{throw Error('disk full');}});
  await service.ask(ask);expect(events.at(-1).type).toBe('answer');
 });
 it('classifies replies that could not be used',()=>{
  expect(classifySurfingFailure('  ```json\n{}\n```')).toBe('fenced');expect(classifySurfingFailure('Here is my answer')).toBe('not-json');expect(classifySurfingFailure('{"actions":[{"type":"read_page","pageNumber":1}]}')).toBe('actions-rejected');expect(classifySurfingFailure('{"text":"x"}')).toBe('schema');
 });
});
describe('Surfing run file',()=>{
 const dirs:string[]=[];afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
 const record={version:1,at:'2026-11-02T00:00:00.000Z',kind:'ask',protocol:'openai-chat',model:'m',document:'abc',pages:1,passages:1,outcome:'answered',durationMs:1,steps:[]} as SurfingRunRecord;
 it('appends one JSON line per run',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'surfing-runs-'));dirs.push(dir);const file=path.join(dir,'logs','surfing-runs.jsonl');
  appendSurfingRun(file,record);appendSurfingRun(file,record);
  expect(readFileSync(file,'utf8').trim().split('\n').map(l=>JSON.parse(l))).toEqual([record,record]);
 });
 it('rolls the file over instead of growing without limit',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'surfing-runs-'));dirs.push(dir);const file=path.join(dir,'surfing-runs.jsonl');
  writeFileSync(file,'x'.repeat(100));appendSurfingRun(file,record,50);
  expect(statSync(file+'.1').size).toBe(100);expect(readFileSync(file,'utf8').trim().split('\n')).toHaveLength(1);
 });
});
