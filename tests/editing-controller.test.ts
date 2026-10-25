import {it,expect} from 'vitest';
import {EditingController} from '../src/renderer/editing-controller';
const session={sessionId:'s1',context:{documentId:'doc',fingerprint:'hash',revision:1}};
function controller(result:unknown){
 const bridge:any={activateEditingDocument:async()=>({ok:true,value:session}),getEditingView:async()=>({ok:true,value:{context:session.context}}),executeUserEdit:async()=>({ok:true,value:result}),getUserEditReceipt:async()=>({ok:true,value:null}),cancelUserEdit:async()=>({ok:true,value:undefined})};
 return new EditingController(bridge,()=>{});
}
const command={type:'delete_mark',markId:'m1'} as any;
it.each(['conflict','canceled','unsupported','error'])('a definite %s result releases the draft so later edits, tab switches and flush proceed',async status=>{
 const c=controller({status,error:{code:'VERSION_CONFLICT',message:'stale'}});await c.activate('doc');
 expect((await c.submit(command)).status).toBe(status);expect(c.hasDraft).toBe(false);await expect(c.flush()).resolves.toBeUndefined();
});
it.each(['STORE_BUSY','EDIT_FAILED'])('a transient %s failure keeps the draft so the same request can be retried',async code=>{
 const c=controller({status:'error',error:{code,message:'busy'}});await c.activate('doc');
 await c.submit(command);expect(c.hasDraft).toBe(true);
});
it('an uncertain commit keeps the draft for receipt reconciliation',async()=>{
 const c=controller({status:'error',error:{code:'COMMIT_UNCERTAIN',message:'unknown'}});await c.activate('doc');
 await c.submit(command);expect(c.hasDraft).toBe(true);await expect(c.flush()).rejects.toThrow('UNSAVED_CHANGE');
});
