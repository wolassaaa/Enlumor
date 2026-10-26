import {describe,it,expect} from 'vitest';
import {SurfingRequests,type SurfingRequestPorts} from '../src/main/surfing-requests';
import {parseSurfingAgentStep,searchSurfingPassages} from '../src/main/surfing-agent';
import type {SurfingContext} from '../src/shared/surfing-context';
import type {AiPrompt} from '../src/shared/ai';
const context={documentId:'doc',fingerprint:'hash',revision:1};
const passage=(id:string,pageIndex:number,quote:string)=>({id,documentId:'doc',fingerprint:'hash',pageIndex,quote,quads:[[0,1,1,1,0,0,1,0]]});
const snapshot:SurfingContext={context,pageCount:3,passages:[passage('p0',0,'Attention cost grows quadratically.'),passage('p1',1,'Figure 2: Accuracy versus context length.'),passage('p2',2,'We conclude retrieval helps.')],emptyPages:[],characterCount:90,coverage:'all-pages-have-text'};
const ask=(requestId='ask')=>({requestId,profileId:'profile',context:{...context},consent:true as const,question:'图 2 说明了什么？',pageIndex:0});
function setup(model:string,replies:string[],protocol='openai-chat'){
 const events:any[]=[],prompts:AiPrompt[]=[],rendered:number[]=[];
 const ports:SurfingRequestPorts={getContext:()=>context,load:async()=>structuredClone(snapshot),profile:()=>({profile:{id:'profile',name:'t',model,protocol:protocol as any,endpoint:'http://localhost/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:100000}),measureInputTokens:()=>2000,
  generate:async(_p,prompt)=>{prompts.push(structuredClone(prompt));return replies.shift()!;},emit:e=>events.push(e),renderPage:async(_c,pageIndex)=>{rendered.push(pageIndex);return{mediaType:'image/jpeg',data:'QUJD'};}};
 return{events,prompts,rendered,service:new SurfingRequests(ports)};
}
const final=JSON.stringify({text:'图 2 显示准确率随上下文变长而下降。',passageIds:['p1']});
describe('Surfing reading agent',()=>{
 it('a vision model looks at the figure page before answering and the answer still cites real passages',async()=>{
  const h=setup('gpt-4o',[JSON.stringify({actions:[{type:'view_page',pageNumber:2}]}),final]);await h.service.ask(ask());
  expect(h.rendered).toEqual([1]);expect(h.prompts).toHaveLength(2);
  expect(h.prompts[0].system).toContain('view_page');expect(JSON.parse(h.prompts[0].user).figures).toEqual([{label:'Figure 2',pageNumber:2,captionPassageId:'p1'}]);
  expect(h.prompts[1].turns![0]).toEqual({role:'assistant',text:JSON.stringify({actions:[{type:'view_page',pageNumber:2}]})});expect(h.prompts[1].turns![1].images).toEqual([{mediaType:'image/jpeg',data:'QUJD'}]);
  expect(h.events).toEqual([{requestId:'ask',type:'step',note:'查看第 2 页'},{requestId:'ask',type:'answer',question:'图 2 说明了什么？',explanation:{text:'图 2 显示准确率随上下文变长而下降。',passageIds:['p1']}}]);
 });
 it('a text-only model is told it cannot see images; asking anyway gets a refusal, not a failed answer',async()=>{
  const h=setup('deepseek-chat',[JSON.stringify({actions:[{type:'view_page',pageNumber:2}]}),final]);await h.service.ask(ask());
  expect(h.prompts[0].system).toContain('You cannot see images');expect(h.prompts[0].system).not.toContain('"view_page"');expect(h.rendered).toEqual([]);
  // asking anyway is answered with a refusal, and the model still gets to answer from the text
  expect(h.prompts[1].turns![1].text).toContain('this model cannot see images');expect(h.prompts[1].turns![1].images).toBeUndefined();expect(h.events.at(-1).type).toBe('answer');
 });
 it('reading and searching feed passages back; the last step must answer',async()=>{
  const h=setup('claude-sonnet-4',[JSON.stringify({actions:[{type:'search',query:'retrieval'},{type:'read_page',pageNumber:3}]}),JSON.stringify({actions:[{type:'read_page',pageNumber:1}]}),JSON.stringify({actions:[{type:'read_page',pageNumber:2}]}),JSON.stringify({actions:[{type:'read_page',pageNumber:1}]}),JSON.stringify({actions:[{type:'read_page',pageNumber:1}]})],'anthropic-messages');
  await h.service.ask(ask());
  // The fourth reply still asks for actions; one correction turn says no steps are left, then the answer fails.
  expect(h.prompts).toHaveLength(5);expect(h.prompts[4].turns!.at(-1)!.text).toContain('no steps are left');expect(h.prompts[1].turns![1].text).toContain('[p2] (p.3) We conclude retrieval helps.');expect(h.prompts[3].turns!.at(-1)!.text).toContain('last step');
  expect(h.events.filter(e=>e.type==='step').map(e=>e.note)).toEqual(['搜索「retrieval」','重读第 3 页','重读第 1 页','重读第 2 页','修正回答格式']);expect(h.events.at(-1)).toMatchObject({type:'error',code:'SURFING_INVALID_ROUTE'});
 });
 it('a protocol without multi-turn support answers in one step',async()=>{
  const h=setup('lite',[final],'spark');await h.service.ask(ask());expect(h.prompts).toHaveLength(1);expect(h.prompts[0].system).not.toContain('"actions"');expect(h.events.at(-1).type).toBe('answer');
 });
 it('rejects invented pages, unknown action types and invented sources',()=>{
  for(const raw of [{actions:[{type:'view_page',pageNumber:9}]},{actions:[{type:'read_page',pageNumber:0}]},{actions:[{type:'go_to_page',pageNumber:1}]},{actions:[]},{actions:[{type:'read_page',pageNumber:1,extra:1}]},{text:'x',passageIds:['made-up']}])
   expect(()=>parseSurfingAgentStep(JSON.stringify(raw),snapshot,true,true)).toThrow('SURFING_INVALID_ROUTE');
  expect(parseSurfingAgentStep(final,snapshot,false,true).kind).toBe('final');
 });
 it('search ranks passages by matched words',()=>{expect(searchSurfingPassages(snapshot,'context length accuracy').map(p=>p.id)).toEqual(['p1']);expect(searchSurfingPassages(snapshot,'nothing here')).toEqual([]);});
});
it('the panel hears once per request that the model is thinking, and test mode keeps waiting for the answer',async()=>{
 const events:any[]=[];const ports:SurfingRequestPorts={getContext:()=>context,load:async()=>structuredClone(snapshot),profile:()=>({profile:{id:'profile',name:'t',model:'deepseek-flash',protocol:'openai-chat',endpoint:'http://localhost/v1',maxOutputTokens:1000,timeoutMs:10000,parameters:{}},contextWindowTokens:100000}),measureInputTokens:()=>2000,
  generate:async(_p,_prompt,o)=>{o.onThinking?.();o.onThinking?.();return final;},emit:e=>events.push(e)};
 await new SurfingRequests(ports).ask(ask());
 expect(events.map(e=>e.type)).toEqual(['thinking','answer']);
});
it('an answer may carry the path to it; each step is checked against the paper',()=>{
 const steps=[{text:'先看图 2 的图注',passageId:'p1',zoom:'in'},{text:'再看结论',passageId:'p2'}];
 const ok=parseSurfingAgentStep(JSON.stringify({text:'准确率随上下文变长而下降。',passageIds:['p1'],steps}),snapshot,false,true,true);
 expect(ok).toEqual({kind:'final',explanation:{text:'准确率随上下文变长而下降。',passageIds:['p1'],steps}});
 // Explanations of route stops are saved with the route and never carry steps.
 expect(()=>parseSurfingAgentStep(JSON.stringify({text:'x',passageIds:['p1'],steps}),snapshot,false,true,false)).toThrow('SURFING_INVALID_ROUTE');
 for(const [bad,why] of [[[{text:'x',passageId:'nope'}],'is not in the supplied passages'],[[{text:'x',passageId:'p1',zoom:'huge'}],'zoom is'],[[],'1 to 6'],[[{text:'',passageId:'p1'}],'short text']] as const)
  expect(()=>parseSurfingAgentStep(JSON.stringify({text:'x',passageIds:['p1'],steps:bad}),snapshot,false,true,true)).toThrow(why);
});
it('the question prompt asks for the path only when the answer draws on several places',async()=>{
 const h=setup('deepseek-flash',[final]);await h.service.ask(ask());
 expect(h.prompts[0].system).toContain('"steps"');expect(h.prompts[0].system).toContain('With one place, leave steps out');
});
