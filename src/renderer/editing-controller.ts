import type {EditingBridge,EditingSession,EditingViewWire,EditResult} from '../shared/editing-bridge';
import type {EditCommand,EditRequest} from '../shared/editing-commands';
import {unwrap} from '../shared/model';
/** Coordinates drafts and receipts, never predicts a commit or manufactures an inverse. */
export class EditingController {
 private session:EditingSession|null=null;
 private epoch=0;
 private draft:{sessionId:string;request:EditRequest;uncertain:boolean}|null=null;
 private flight:Promise<EditResult>|null=null;
 constructor(private bridge:EditingBridge,private onView:(view:EditingViewWire)=>void){}
 get currentSession(){return this.session?structuredClone(this.session):null;}
 get hasDraft(){return this.draft!==null;}
 async activate(documentId:string|null){const epoch=++this.epoch;this.session=null;const s=unwrap(await this.bridge.activateEditingDocument(documentId));if(epoch!==this.epoch)return;this.session=s;if(s)await this.refresh(s,epoch);}
 private async refresh(s:EditingSession,epoch:number){const v=unwrap(await this.bridge.getEditingView(s.sessionId));if(epoch===this.epoch&&this.session?.sessionId===s.sessionId&&v.context.documentId===s.context.documentId&&v.context.fingerprint===s.context.fingerprint)this.onView(v);}
 async submit(command:EditCommand):Promise<EditResult>{if(this.draft||this.flight)throw Error('UNSAVED_CHANGE');const s=this.session;if(!s)throw Error('EDIT_STALE');this.draft={sessionId:s.sessionId,request:{requestId:crypto.randomUUID(),context:structuredClone(s.context),command:structuredClone(command)},uncertain:false};return this.send();}
 private async accept(result:EditResult,draft:NonNullable<EditingController['draft']>,epoch:number){if(result.status==='committed'){if(this.draft===draft)this.draft=null;const s=this.session;if(s&&epoch===this.epoch&&result.documentId===s.context.documentId&&result.fingerprint===s.context.fingerprint)await this.refresh(s,epoch);}else if('error'in result&&result.error.code==='COMMIT_UNCERTAIN')draft.uncertain=true;return result;}
 private async send():Promise<EditResult>{const draft=this.draft!,epoch=this.epoch;const job=(async()=>{try{return await this.accept(unwrap(await this.bridge.executeUserEdit({sessionId:draft.sessionId,request:draft.request})),draft,epoch);}catch(e){draft.uncertain=true;throw e;}})();this.flight=job;try{return await job;}finally{if(this.flight===job)this.flight=null;}}
 async retry():Promise<EditResult|null>{if(this.flight)return this.flight;const d=this.draft;if(!d)return null;const receipt=unwrap(await this.bridge.getUserEditReceipt(d.request));if(receipt)return this.accept(receipt,d,this.epoch);if(d.uncertain)return null;if(this.session?.sessionId!==d.sessionId)throw Error('EDIT_STALE');return this.send();}
 async cancel(){const d=this.draft;if(d)unwrap(await this.bridge.cancelUserEdit({sessionId:d.sessionId,requestId:d.request.requestId}));}
 async discard(){await this.cancel();await this.flight?.catch(()=>{});this.draft=null;}
 async flush(){await this.flight;if(this.draft)throw Error('UNSAVED_CHANGE');}
}
