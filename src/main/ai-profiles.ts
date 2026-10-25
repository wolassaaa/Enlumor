import type {DatabaseSync} from 'node:sqlite';
import type {AiProfileInput,AiProfileView,AiCredential} from '../shared/ai';
import {validateAiProfile} from './ai-client';
type SecretBox={available:()=>boolean;encrypt:(text:string)=>Uint8Array;decrypt:(data:Uint8Array)=>string};
export class AiProfiles {
 private session=new Map<string,AiCredential>();
 constructor(private db:DatabaseSync,private box:SecretBox){}
 private row(id:string){if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))throw new Error('AI_INVALID_CONFIG');const row=this.db.prepare('SELECT * FROM ai_profiles WHERE id=?').get(id);if(!row)throw new Error('AI_PROFILE_MISSING');return row;}
 private view(row:Record<string,unknown>):AiProfileView {const secret=row.secret as Uint8Array|null,temporary=this.session.has(row.id as string);return{...JSON.parse(row.payload as string),hasCredential:temporary||!!secret,credentialStorage:temporary?'session':secret?'encrypted':'none',verification:'configured'};}
 list():AiProfileView[]{return this.db.prepare('SELECT * FROM ai_profiles ORDER BY rowid').all().map(row=>this.view(row));}
 save(input:AiProfileInput):AiProfileView {
  validateAiProfile(input);const{credential}=input;
  const metadata={id:input.id,name:input.name,protocol:input.protocol,endpoint:input.endpoint,model:input.model,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,parameters:input.parameters,...(input.contextWindowTokens!==undefined?{contextWindowTokens:input.contextWindowTokens}:{}),...(input.vision!==undefined?{vision:input.vision}:{})};
  const old=this.db.prepare('SELECT secret,payload FROM ai_profiles WHERE id=?').get(input.id);
  const prior=old?JSON.parse(old.payload as string):null;
  const changedOrigin=!!prior&&(new URL(prior.endpoint).origin!==new URL(input.endpoint).origin||prior.protocol!==input.protocol);
  let secret=(old?.secret as Uint8Array|null)||null;
  if(changedOrigin&&!credential)secret=null;
  let temporary:AiCredential|undefined;
  if(credential){if(this.box.available())secret=this.box.encrypt(JSON.stringify(credential));else{secret=null;temporary=structuredClone(credential);}}
  this.db.prepare('INSERT INTO ai_profiles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,secret=excluded.secret').run(input.id,JSON.stringify(metadata),secret);
  if(changedOrigin&&!credential)this.session.delete(input.id);
  if(credential){if(temporary)this.session.set(input.id,temporary);else this.session.delete(input.id);}
  return this.view(this.row(input.id));
 }
 resolve(id:string):AiProfileInput {
  const row=this.row(id),metadata=JSON.parse(row.payload as string);let credential=this.session.get(id);
  if(!credential&&row.secret){try{if(!this.box.available())throw Error();credential=JSON.parse(this.box.decrypt(row.secret as Uint8Array));}catch{throw new Error('AI_CREDENTIAL_UNAVAILABLE');}}
  const result={...metadata,credential};validateAiProfile(result);return result;
 }
 /** An unsaved draft ready for model discovery. A missing key reuses the saved one only for the same service origin and protocol. */
 discoveryProfile(draft:AiProfileInput,savedId?:string):AiProfileInput {
  const profile={...draft,model:typeof draft?.model==='string'&&draft.model.trim()?draft.model:'model-discovery'};
  validateAiProfile(profile);
  if(!profile.credential&&typeof savedId==='string'&&savedId){const saved=this.resolve(savedId);if(saved.protocol===profile.protocol&&new URL(saved.endpoint).origin===new URL(profile.endpoint).origin)profile.credential=saved.credential;}
  validateAiProfile(profile);return profile;
 }
 delete(id:string){this.row(id);this.db.prepare('DELETE FROM ai_profiles WHERE id=?').run(id);this.session.delete(id);}
}
