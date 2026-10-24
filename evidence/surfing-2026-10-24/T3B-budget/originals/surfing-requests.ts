import type {AiProfileInput,AiPrompt} from '../shared/ai';
import type {CommandContext} from '../shared/document-commands';
import type {SurfingContext} from '../shared/surfing-context';
import {buildSurfingRoutePrompt,parseSurfingRoute,type SurfingRoute} from '../shared/surfing-route';
export type SurfingRouteRequest={requestId:string;profileId:string;context:CommandContext;consent:true};
export type SurfingRouteEvent={requestId:string;type:'route';route:SurfingRoute}|{requestId:string;type:'error';code:string};
export type SurfingRequestPorts={
 getContext:()=>CommandContext|null;
 /** Host loads trusted PDF text, never accepts renderer-supplied passages or paths. */
 load:(context:CommandContext,signal:AbortSignal)=>Promise<SurfingContext>;
 profile:(id:string)=>{profile:AiProfileInput;contextWindowTokens:number};
 /** Includes protocol message framing; null means tokenizer/capacity is not established. */
 measureInputTokens:(profile:AiProfileInput,prompt:AiPrompt)=>number|null;
 generate:(profile:AiProfileInput,prompt:AiPrompt,options:{signal:AbortSignal;onDelta:(text:string)=>void})=>Promise<string>;
 emit:(event:SurfingRouteEvent)=>void;
};
const same=(a:CommandContext|null,b:CommandContext)=>!!a&&a.documentId===b.documentId&&a.fingerprint===b.fingerprint&&a.revision===b.revision;
const publicErrors=new Set(['SURFING_SOURCE_INVALID','SURFING_INVALID_ROUTE','SURFING_CAPACITY_UNKNOWN','SURFING_CONTEXT_TOO_LARGE','SURFING_NO_TEXT','AI_TIMEOUT','AI_AUTH','AI_RATE_LIMIT','AI_NETWORK','AI_CANCELED','AI_INCOMPLETE','AI_RESPONSE_TOO_LARGE','AI_HTTP_400','AI_HTTP_401','AI_HTTP_403','AI_HTTP_404','AI_HTTP_408','AI_HTTP_413','AI_HTTP_429','AI_HTTP_500','AI_HTTP_502','AI_HTTP_503','AI_HTTP_504','AI_REQUEST_FAILED','AI_CANCELLED','AI_KEY_REQUIRED','AI_INVALID_CONFIG','AI_INVALID_PROMPT','AI_INVALID_RESPONSE','AI_PROTOCOL_NOT_READY','AI_REMOTE_ERROR','SURFING_UNSUPPORTED_GEOMETRY','SOURCE_CHANGED','SOURCE_MISSING','PASSWORD_REQUIRED']);
/** A bounded route request, not a general-purpose prompt or model-action IPC. */
export class SurfingRequests{
 private active?:{id:string;controller:AbortController};
 constructor(private ports:SurfingRequestPorts){}
 cancel(id?:string){if(this.active&&(!id||this.active.id===id)){this.active.controller.abort();this.active=undefined;}}
 async start(value:SurfingRouteRequest):Promise<void>{
  const c=value?.context;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='consent,context,profileId,requestId'||value.consent!==true||typeof value.requestId!=='string'||! /^[\w-]{1,100}$/.test(value.requestId)||typeof value.profileId!=='string'||! /^[\w-]{1,100}$/.test(value.profileId)||!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!=='documentId,fingerprint,revision'||typeof c.documentId!=='string'||!c.documentId||c.documentId.length>100||typeof c.fingerprint!=='string'||!c.fingerprint||c.fingerprint.length>128||!Number.isSafeInteger(c.revision)||c.revision<0)throw Error('SURFING_INVALID_REQUEST');
  const input=structuredClone(value);this.cancel();const job=this.active={id:input.requestId,controller:new AbortController()};
  const current=()=>this.active===job&&!job.controller.signal.aborted&&same(this.ports.getContext(),input.context);
  try{
   if(!current())return;
   const {profile:resolved,contextWindowTokens}=this.ports.profile(input.profileId);const profile=structuredClone(resolved);
   if(!Number.isSafeInteger(contextWindowTokens)||contextWindowTokens<=0||!Number.isSafeInteger(profile.maxOutputTokens)||profile.maxOutputTokens<=0)throw Error('SURFING_CAPACITY_UNKNOWN');
   const loaded=await this.ports.load({...input.context},job.controller.signal);if(!current())return;
   const snapshot=structuredClone(loaded);if(!same(snapshot.context,input.context))throw Error('SURFING_SOURCE_INVALID');
   const prompt=buildSurfingRoutePrompt(snapshot);
   if(prompt.system.length+prompt.user.length>200000)throw Error('SURFING_CONTEXT_TOO_LARGE');
   const tokens=this.ports.measureInputTokens(profile,prompt);
   if(tokens===null||!Number.isSafeInteger(tokens)||tokens<0)throw Error('SURFING_CAPACITY_UNKNOWN');
   if(tokens+profile.maxOutputTokens>contextWindowTokens)throw Error('SURFING_CONTEXT_TOO_LARGE');
   if(!current())return;let outputSize=0;
   const raw=await this.ports.generate(profile,prompt,{signal:job.controller.signal,onDelta:text=>{if(!current())return;outputSize+=text.length;if(outputSize>32768)throw Error('AI_RESPONSE_TOO_LARGE');}});
   if(!current())return;const route=parseSurfingRoute(raw,snapshot);
   this.ports.emit({requestId:job.id,type:'route',route});
  }catch(error){if(current()){const code=error instanceof Error&&publicErrors.has(error.message)?error.message:'AI_FAILED';this.ports.emit({requestId:job.id,type:'error',code});}}
  finally{if(this.active===job)this.active=undefined;}
 }
}

