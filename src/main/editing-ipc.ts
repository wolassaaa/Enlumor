import {randomUUID} from 'node:crypto';
import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import type {Workspace} from './workspace';
import type {WorkspaceEdits} from './editing-workspace';
import type {EditingSourceService} from './editing-sources';
import type {EditingSession} from '../shared/editing-bridge';
import {copyEditData,identifier,object,validateContext,version} from '../shared/editing-marks';
import {canonicalDigest} from '../shared/editing-planner';
import {deriveEditingIds,queryEditingReceipt,runEditingCommand,type EditHost} from './editing-executor';

// Resolve every existing ancestor before any mkdir/open; lexical checks alone accept junction escapes.
function realDestination(input:string):string {let current=path.resolve(input),tail:string[]=[];while(!existsSync(current)){tail.unshift(path.basename(current));const parent=path.dirname(current);if(parent===current)throw Error('EDITING_PROFILE_REQUIRED');current=parent;}return path.join(realpathSync(current),...tail);}
function within(child:string,parent:string){const r=path.relative(parent,child);return r!==''&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);}
export function validateEditingProfile(input:string,root:string,personal:string):string {
 if(!input||!path.isAbsolute(input))throw Error('EDITING_PROFILE_REQUIRED');
 const target=realDestination(input),personalPath=realDestination(personal),cache=realDestination(path.join(root,'.cache','editing-production-userdata')),temp=realDestination(tmpdir());
 const relative=path.relative(temp,target).split(path.sep);
 const allowed=target===cache||within(target,cache)||within(target,temp)&&/^enlumor-[\w-]+$/.test(relative[0]);
 if(!allowed||target===personalPath||within(target,personalPath)||within(personalPath,target))throw Error('EDITING_PROFILE_REQUIRED');
 return target;
}
type Sources=Pick<EditingSourceService,'resolveEnvironment'|'preparePage'|'convertLegacyPage'|'prepareAnchor'|'reanchorLegacy'>;
export class EditingIpc {
 private session:EditingSession|null=null;
 private revision=0;
 private abort=new AbortController();
 private requests=new Map<string,AbortController>();
 constructor(private workspace:Workspace,private edits:WorkspaceEdits,private sources:Sources){}
 async activate(input:unknown):Promise<EditingSession|null>{
  const id=copyEditData(input);if(id!==null)identifier(id);
  this.abort.abort();for(const c of this.requests.values())c.abort();this.requests.clear();this.abort=new AbortController();this.session=null;this.revision++;
  if(id===null)return null;const doc=this.workspace.verified(id);
  this.session={sessionId:randomUUID(),context:{documentId:doc.id,fingerprint:doc.fingerprint,revision:this.revision}};
  return structuredClone(this.session);
 }
 private current(id:unknown){identifier(id);if(!this.session||id!==this.session.sessionId)throw Error('EDIT_STALE');return this.session;}
 async view(id:unknown){const s=this.current(id);this.workspace.verified(s.context.documentId);return this.edits.view(s.context,this.edits.actor);}
 private async request<T>(input:unknown,keys:string[],body:(value:any,session:EditingSession,signal:AbortSignal)=>Promise<T>):Promise<T>{
  const value=copyEditData(input);object(value,['sessionId','requestId',...keys]);identifier(value.requestId);const session=this.current(value.sessionId),controller=new AbortController(),sessionSignal=this.abort.signal;
  if(this.requests.has(value.requestId))throw Error('EDIT_REQUEST_BUSY');
  const abort=()=>controller.abort();sessionSignal.addEventListener('abort',abort,{once:true});this.requests.set(value.requestId,controller);
  try{return await body(value,session,controller.signal);}finally{sessionSignal.removeEventListener('abort',abort);if(this.requests.get(value.requestId)===controller)this.requests.delete(value.requestId);}
 }
 async page(input:unknown){return this.request(input,['pageIndex'],async(v,s,signal)=>{version(v.pageIndex);if(v.pageIndex>=this.workspace.document(s.context.documentId).pageCount)throw Error('EDIT_INVALID');await this.sources.preparePage(s.context,v.pageIndex,signal);await this.sources.convertLegacyPage(s.context,v.pageIndex,signal);return this.view(s.sessionId);});}
 async anchor(input:unknown){return this.request(input,['candidate'],async(v,s,signal)=>{object(v.candidate,['pageIndex','quote','quads']);version(v.candidate.pageIndex);if(v.candidate.pageIndex>=this.workspace.document(s.context.documentId).pageCount)throw Error('EDIT_INVALID');return this.sources.prepareAnchor(s.context,v.candidate,signal);});}
 private host(session:EditingSession|null,signal:AbortSignal):EditHost {
  let bounds:readonly [number,number,number,number][]=[];
  return {getContext:()=>this.session?.context??null,getActor:()=>this.edits.actor,getPageBounds:()=>bounds,
   resolveAnchors:async context=>{try{const env=await this.sources.resolveEnvironment(context,signal);bounds=env.pageBounds;return env.anchors;}catch(e){if(signal.aborted)return [];throw e;}},allocateIds:deriveEditingIds,
   readSnapshot:(c,ids)=>this.edits.readSnapshot(c,ids),readReceipt:k=>this.edits.readReceipt(k),readOperation:(c,id)=>this.edits.readOperation(c,id),getConfirmation:()=>null,transaction:body=>this.edits.transaction(body)};
 }
 async execute(input:unknown){const v=copyEditData(input);object(v,['sessionId','request']);object(v.request,['requestId','context','command']);validateContext(v.request.context);identifier(v.request.requestId);const s=this.current(v.sessionId);
  if(canonicalDigest(s.context)!==canonicalDigest(v.request.context))throw Error('EDIT_STALE');
  return this.request({sessionId:v.sessionId,requestId:v.request.requestId,request:v.request},['request'],async(value,session,signal)=>runEditingCommand(value.request,this.host(session,signal),signal));
 }
 async cancel(input:unknown){const v=copyEditData(input);object(v,['sessionId','requestId']);this.current(v.sessionId);identifier(v.requestId);this.requests.get(v.requestId)?.abort();}
 async receipt(input:unknown){return queryEditingReceipt(copyEditData(input),this.host(null,this.abort.signal));}
 async reanchor(input:unknown){return this.request(input,['legacyId','anchorId','expectedInputDigest'],async(v,s,signal)=>{identifier(v.legacyId);identifier(v.anchorId);identifier(v.expectedInputDigest);await this.sources.reanchorLegacy(s.context,v.legacyId,v.anchorId,v.expectedInputDigest,signal);return this.view(s.sessionId);});}
 hasEditingState(documentId:string){const doc=this.workspace.verified(documentId);return this.edits.view({documentId,fingerprint:doc.fingerprint,revision:0},this.edits.actor).hasEditingState;}
 close(){this.abort.abort();this.session=null;}
}
export function registerEditingIpc(handle:(name:string,fn:(input:any)=>unknown)=>void,service:EditingIpc|null){
 handle('editing:capabilities',v=>{if(v!==undefined)throw Error('EDIT_INVALID');return{enabled:!!service};});if(!service)return;
 handle('editing:activate',v=>service.activate(v));handle('editing:view',v=>service.view(v));handle('editing:page',v=>service.page(v));handle('editing:anchor',v=>service.anchor(v));handle('editing:execute',v=>service.execute(v));handle('editing:cancel',v=>service.cancel(v));handle('editing:receipt',v=>service.receipt(v));handle('editing:legacy-reanchor',v=>service.reanchor(v));
}



