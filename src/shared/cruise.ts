import type{AiTextEvent}from'./ai';
export type CruiseBlock={id:string;documentId:string;fingerprint:string;pageIndex:number;quote:string;quads:number[][]};
export type CruiseSource={profileId:string;name:string;model:string};
export type CruiseResult={text:string;source:CruiseSource};
export type CruiseState={status:'idle'|'loading'|'ready'|'explaining'|'paused'|'error'|'finished';blocks:CruiseBlock[];index:number;text:string;error:string;requestId:string|null;source:CruiseSource|null;results:Record<string,CruiseResult>};
export const initialCruise=():CruiseState=>({status:'idle',blocks:[],index:0,text:'',error:'',requestId:null,source:null,results:{}});
export type CruiseAction={type:'load'}|{type:'loaded';blocks:CruiseBlock[];index:number}|{type:'explain';requestId:string;source:CruiseSource}|{type:'text';event:AiTextEvent}|{type:'pause';reason:string}|{type:'move';index:number}|{type:'finish'}|{type:'stop'}|{type:'failure';code:string}|{type:'restore';session:CruiseSession;blocks:CruiseBlock[]};
export function cruiseReducer(s:CruiseState,a:CruiseAction):CruiseState{
 switch(a.type){
 case'restore':{const index=a.blocks.findIndex(b=>b.id===a.session.block?.id);if(index<0)return{...s,status:'error',error:'CRUISE_SOURCE_CHANGED'};const result=a.session.results[a.blocks[index].id];return{...initialCruise(),status:a.session.mode==='auto'?'paused':a.session.status,blocks:a.blocks,index,results:a.session.results,text:result?.text||'',source:result?.source||null};}
 case'stop':return initialCruise();
 case'load':return{...s,status:'loading',requestId:null,error:'',text:''};
 case'loaded':{const index=Math.max(0,Math.min(a.index,a.blocks.length-1)),result=s.results[a.blocks[index]?.id];return{...s,status:'ready',blocks:a.blocks,index,requestId:null,text:result?.text||'',source:result?.source||null,error:''};}
 case'move':if(!Number.isInteger(a.index)||a.index<0||a.index>=s.blocks.length)return s;return cruiseReducer(s,{type:'loaded',blocks:s.blocks,index:a.index});
 case'pause':return s.status==='idle'||s.status==='finished'?s:{...s,status:'paused',requestId:null,error:a.reason};
 case'finish':return{...s,status:'finished',requestId:null,error:''};
 case'failure':return{...s,status:'error',requestId:null,error:a.code};
 case'explain':if(s.status==='explaining'||s.status==='loading'||!s.blocks[s.index])return s;return{...s,status:'explaining',requestId:a.requestId,source:a.source,text:'',error:''};
 case'text':{const e=a.event;if(s.status!=='explaining'||e.requestId!==s.requestId)return s;if(e.type==='delta')return{...s,text:s.text+(e.text||'')};if(e.type==='error')return{...s,status:'error',requestId:null,error:e.code||'AI_FAILED'};const block=s.blocks[s.index],results={...s.results,[block.id]:{text:s.text,source:s.source!}};while(Object.keys(results).length>64||Object.values(results).reduce((n,r)=>n+r.text.length,0)>524288){const first=Object.keys(results).find(id=>id!==block.id);if(!first)break;delete results[first];}return{...s,status:'ready',requestId:null,results};}
 }
}

// Legacy auto/pace fields stay readable; new sessions are explicitly manual.
export type CruiseSession={documentId:string;fingerprint:string;block:CruiseBlock|null;profileId:string;mode:'manual'|'auto';pace:'slow'|'normal'|'fast';status:'paused'|'finished';results:Record<string,CruiseResult>};
