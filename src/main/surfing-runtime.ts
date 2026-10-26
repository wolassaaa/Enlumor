import {AI_MAX_IMAGE_BASE64,type AiImage} from '../shared/ai';
import type {AiProfileInput,AiProfileView} from '../shared/ai';
import type {CommandContext} from '../shared/document-commands';
import type {SurfingContext} from '../shared/surfing-context';
import type {SurfingSession} from '../shared/surfing-session';
import {createSurfingSourceLoader,type SurfingSourcePorts} from './surfing-source';
import {SurfingRequests,type SurfingRouteRequest,type SurfingAskRequest,type SurfingExplainRequest,type SurfingRequestPorts,type SurfingRouteEvent} from './surfing-requests';
import {surfingProfileSignature,validateSurfingSession} from './surfing-sessions';
import {thinkingParameters,withThinking} from '../shared/ai-thinking';
/** thinking: one of the configured model's own thinking levels (see ai-thinking); absent means the model's default. */
export type SurfingSubmission<T>={request:T;contextWindowTokens:number;thinking?:string};
export type SurfingSaveInput={context:CommandContext;routeRevision:number;selected:number|null};
export type SurfingRestoredProgress={session:SurfingSession;routeRevision:number};
export type SurfingRuntimeEvent=Exclude<SurfingRouteEvent,{type:'route'}>|(Extract<SurfingRouteEvent,{type:'route'}>&{routeRevision:number});
export type SurfingRuntimePorts=Pick<SurfingSourcePorts,'verified'|'extract'>&Pick<SurfingRequestPorts,'generate'|'measureInputTokens'>&{renderPage?:(request:{operation:'render-page';source:string;fingerprint:string;pageIndex:number},signal:AbortSignal)=>Promise<unknown>;profile:(id:string)=>AiProfileInput;profileView?:(id:string)=>AiProfileView|AiProfileInput|null;sessions?:{get:(documentId:string)=>SurfingSession|null;save:(session:SurfingSession)=>void};emit:(event:SurfingRuntimeEvent)=>void};
const same=(a:CommandContext|null,b:CommandContext|null)=>!!a&&!!b&&a.documentId===b.documentId&&a.fingerprint===b.fingerprint&&a.revision===b.revision;
export class SurfingRuntime{
 private context:CommandContext|null=null;private snapshot:SurfingContext|null=null;private revision=0;private preparation?:AbortController;private budgets=new Map<string,number>();private thinking=new Map<string,string|undefined>();private requests:SurfingRequests;
 private progress:SurfingSession|null=null;private routeRevision=0;private activeSource:SurfingSession['source']|null=null;
 constructor(private ports:SurfingRuntimePorts){
  this.requests=new SurfingRequests({getContext:()=>this.getContext(),load:async context=>{if(!this.snapshot||!same(this.context,context))throw Error('SURFING_SOURCE_INVALID');const d=this.ports.verified(context.documentId);if(d.fingerprint!==context.fingerprint||d.pageCount!==this.snapshot.pageCount)throw Error('SURFING_SOURCE_INVALID');return structuredClone(this.snapshot);},profile:id=>{const p=this.ports.profile(id);this.activeSource={profileId:id,name:p.name,model:p.model,signature:surfingProfileSignature(p)};return{profile:{...p,parameters:withThinking(p,this.thinking.get(id))},contextWindowTokens:this.budgets.get(id)||0};},measureInputTokens:(profile,prompt,signal)=>this.ports.measureInputTokens(profile,prompt,signal),generate:(profile,prompt,options)=>this.ports.generate(profile,prompt,options),emit:event=>this.emit(event),...(this.ports.renderPage?{renderPage:(context,pageIndex,signal)=>this.renderPage(context,pageIndex,signal)}:{})});
 }
 private emit(event:SurfingRouteEvent){
  if(event.type==='route'){
   if(!this.context||!this.activeSource)return;this.routeRevision++;
   this.progress={version:1,documentId:this.context.documentId,fingerprint:this.context.fingerprint,source:{...this.activeSource},route:structuredClone(event.route),selected:null,answers:{},contextWindowTokens:this.budgets.get(this.activeSource.profileId)!,status:'paused'};
   this.ports.emit({...event,routeRevision:this.routeRevision});return;
  }
  if(event.type==='explanation'&&this.progress)this.progress.answers[String(event.stopIndex)]=structuredClone(event.explanation);
  this.ports.emit(event);
 }
 /** One page image of the verified original; the worker's reply is shape-checked before it can reach a model. */
 private async renderPage(context:CommandContext,pageIndex:number,signal:AbortSignal):Promise<AiImage>{
  if(!this.snapshot||!same(this.context,context)||!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=this.snapshot.pageCount)throw Error('SURFING_SOURCE_INVALID');
  const d=this.ports.verified(context.documentId);if(d.fingerprint!==context.fingerprint)throw Error('SURFING_SOURCE_INVALID');
  const raw:any=await this.ports.renderPage!({operation:'render-page',source:d.path,fingerprint:d.fingerprint,pageIndex},signal);
  if(!raw||raw.pageIndex!==pageIndex||raw.mediaType!=='image/jpeg'||typeof raw.data!=='string'||!raw.data||raw.data.length>AI_MAX_IMAGE_BASE64||!/^[A-Za-z0-9+/]+=*$/.test(raw.data))throw Error('SURFING_SOURCE_INVALID');
  return{mediaType:'image/jpeg',data:raw.data};
 }
 getContext(){return this.context?{...this.context}:null;}
 invalidate(){this.requests.reset();this.preparation?.abort();this.preparation=undefined;this.context=null;this.snapshot=null;this.progress=null;this.activeSource=null;this.budgets.clear();}
 deactivate(context:CommandContext|null){if(same(this.context,context))this.invalidate();}
 /** Pauses model requests. Local, network-free preparation keeps running; invalidate() abandons it. */
 cancel(context?:CommandContext){if(context&&!same(this.context,context))return;this.requests.cancel();}
 async prepare(documentId:string):Promise<SurfingContext>{
  if(typeof documentId!=='string'||! /^[\w-]{1,100}$/.test(documentId))throw Error('SURFING_INVALID_REQUEST');
  const d=this.ports.verified(documentId);this.invalidate();const context=this.context={documentId:d.id,fingerprint:d.fingerprint,revision:++this.revision},job=this.preparation=new AbortController();
  const load=createSurfingSourceLoader({...this.ports,getContext:()=>this.getContext()});
  try{const snapshot=await load(context,job.signal);if(this.preparation!==job||!same(this.context,context))throw Error('SURFING_STALE');this.snapshot=structuredClone(snapshot);return structuredClone(snapshot);}
  catch(error){if(this.preparation===job){this.context=null;this.snapshot=null;}throw error;}
  finally{if(this.preparation===job)this.preparation=undefined;}
 }
 getSavedProgress(context:CommandContext):SurfingRestoredProgress|null{
  if(!this.snapshot||!same(this.context,context))throw Error('SURFING_STALE');
  const saved=this.ports.sessions?.get(context.documentId);if(!saved)return null;
  const clean=validateSurfingSession(saved,this.snapshot),view=this.ports.profileView?.(clean.source.profileId);
  if(!view||surfingProfileSignature(view)!==clean.source.signature)throw Error('SURFING_PROFILE_CHANGED');
  this.requests.restoreRoute(context,clean.source.profileId,clean.route,this.snapshot);this.progress=clean;this.activeSource={...clean.source};this.budgets.set(clean.source.profileId,clean.contextWindowTokens);this.routeRevision++;
  return{session:structuredClone(clean),routeRevision:this.routeRevision};
 }
 saveProgress(input:SurfingSaveInput):void{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='context,routeRevision,selected')throw Error('SURFING_INVALID_REQUEST');
  if(!this.progress||!this.snapshot||!same(this.context,input.context)||input.routeRevision!==this.routeRevision)throw Error('SURFING_STALE');
  if(!this.ports.sessions)throw Error('SURFING_STORAGE_UNAVAILABLE');
  const clean=validateSurfingSession({...this.progress,selected:input.selected},this.snapshot);this.ports.sessions.save(clean);this.progress=clean;
 }
 private configure<T extends SurfingRouteRequest>(input:SurfingSubmission<T>):T{
  if(!input||typeof input!=='object'||Array.isArray(input)||!['contextWindowTokens,request','contextWindowTokens,request,thinking'].includes(Object.keys(input).sort().join(','))||!input.request||typeof input.request.profileId!=='string')throw Error('SURFING_INVALID_REQUEST');
  if(input.thinking!==undefined&&(typeof input.thinking!=='string'||input.thinking.length>20))throw Error('SURFING_INVALID_REQUEST');
  if(!Number.isSafeInteger(input.contextWindowTokens)||input.contextWindowTokens<1||input.contextWindowTokens>10000000)throw Error('SURFING_CAPACITY_UNKNOWN');
  if(!this.snapshot||!same(this.context,input.request.context))throw Error('SURFING_STALE');
  if(input.thinking!==undefined)thinkingParameters(this.ports.profile(input.request.profileId),input.thinking);
  this.budgets.set(input.request.profileId,input.contextWindowTokens);this.thinking.set(input.request.profileId,input.thinking);return input.request;
 }
 ask(input:SurfingSubmission<SurfingAskRequest>){return Promise.resolve().then(()=>{
  const request=this.configure(input);
  if(this.activeSource&&this.activeSource.profileId!==request.profileId){this.requests.reset();this.progress=null;this.activeSource=null;}
  if(this.activeSource&&this.ports.profileView){const view=this.ports.profileView(request.profileId);if(!view||surfingProfileSignature(view)!==this.activeSource.signature){this.requests.reset();throw Error('SURFING_PROFILE_CHANGED');}}
  return this.requests.ask(request);
 });}
 route(input:SurfingSubmission<SurfingRouteRequest>){return Promise.resolve().then(()=>this.requests.start(this.configure(input)));}
 explain(input:SurfingSubmission<SurfingExplainRequest>){return Promise.resolve().then(()=>{
  const request=this.configure(input);
  if(this.progress&&this.ports.profileView){const view=this.ports.profileView(request.profileId);if(!view||surfingProfileSignature(view)!==this.progress.source.signature)throw Error('SURFING_PROFILE_CHANGED');}
  return this.requests.explain(request);
 });}
}

