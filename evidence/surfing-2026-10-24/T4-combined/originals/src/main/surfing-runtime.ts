import type {AiProfileInput} from '../shared/ai';
import type {CommandContext} from '../shared/document-commands';
import type {SurfingContext} from '../shared/surfing-context';
import {createSurfingSourceLoader,type SurfingSourcePorts} from './surfing-source';
import {SurfingRequests,type SurfingRouteRequest,type SurfingExplainRequest,type SurfingRequestPorts} from './surfing-requests';
export type SurfingSubmission<T>={request:T;contextWindowTokens:number};
export type SurfingRuntimePorts=Pick<SurfingSourcePorts,'verified'|'extract'>&Pick<SurfingRequestPorts,'generate'|'measureInputTokens'|'emit'>&{profile:(id:string)=>AiProfileInput};
const same=(a:CommandContext|null,b:CommandContext|null)=>!!a&&!!b&&a.documentId===b.documentId&&a.fingerprint===b.fingerprint&&a.revision===b.revision;
export class SurfingRuntime{
 private context:CommandContext|null=null;private snapshot:SurfingContext|null=null;private revision=0;private preparation?:AbortController;private budgets=new Map<string,number>();private requests:SurfingRequests;
 constructor(private ports:SurfingRuntimePorts){
  this.requests=new SurfingRequests({getContext:()=>this.getContext(),load:async context=>{if(!this.snapshot||!same(this.context,context))throw Error('SURFING_SOURCE_INVALID');const d=this.ports.verified(context.documentId);if(d.fingerprint!==context.fingerprint||d.pageCount!==this.snapshot.pageCount)throw Error('SURFING_SOURCE_INVALID');return structuredClone(this.snapshot);},profile:id=>({profile:this.ports.profile(id),contextWindowTokens:this.budgets.get(id)||0}),measureInputTokens:ports.measureInputTokens,generate:ports.generate,emit:ports.emit});
 }
 getContext(){return this.context?{...this.context}:null;}
 invalidate(){this.requests.reset();this.preparation?.abort();this.preparation=undefined;this.context=null;this.snapshot=null;this.budgets.clear();}
 deactivate(context:CommandContext|null){if(same(this.context,context))this.invalidate();}
 cancel(context?:CommandContext){if(context&&!same(this.context,context))return;this.requests.cancel();this.preparation?.abort();}
 async prepare(documentId:string):Promise<SurfingContext>{
  if(typeof documentId!=='string'||! /^[\w-]{1,100}$/.test(documentId))throw Error('SURFING_INVALID_REQUEST');
  const d=this.ports.verified(documentId);this.invalidate();const context=this.context={documentId:d.id,fingerprint:d.fingerprint,revision:++this.revision},job=this.preparation=new AbortController();
  const load=createSurfingSourceLoader({...this.ports,getContext:()=>this.getContext()});
  try{const snapshot=await load(context,job.signal);if(this.preparation!==job||!same(this.context,context))throw Error('SURFING_STALE');this.snapshot=structuredClone(snapshot);return structuredClone(snapshot);}
  catch(error){if(this.preparation===job){this.context=null;this.snapshot=null;}throw error;}
  finally{if(this.preparation===job)this.preparation=undefined;}
 }
 private configure<T extends SurfingRouteRequest>(input:SurfingSubmission<T>):T{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='contextWindowTokens,request'||!input.request||typeof input.request.profileId!=='string')throw Error('SURFING_INVALID_REQUEST');
  if(!Number.isSafeInteger(input.contextWindowTokens)||input.contextWindowTokens<1||input.contextWindowTokens>10000000)throw Error('SURFING_CAPACITY_UNKNOWN');
  if(!this.snapshot||!same(this.context,input.request.context))throw Error('SURFING_STALE');
  this.budgets.set(input.request.profileId,input.contextWindowTokens);return input.request;
 }
 route(input:SurfingSubmission<SurfingRouteRequest>){return Promise.resolve().then(()=>this.requests.start(this.configure(input)));}
 explain(input:SurfingSubmission<SurfingExplainRequest>){return Promise.resolve().then(()=>this.requests.explain(this.configure(input)));}
}
