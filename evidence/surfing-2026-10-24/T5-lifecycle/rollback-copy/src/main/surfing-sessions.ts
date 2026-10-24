import {createHash} from 'node:crypto';
import type {AiProfileInput,AiProfileView} from '../shared/ai';
import type {SurfingContext} from '../shared/surfing-context';
import type {SurfingSession} from '../shared/surfing-session';
import {parseSurfingRoute} from '../shared/surfing-route';
import type {Workspace} from './workspace';
const fail=():never=>{throw Error('SURFING_INVALID_SESSION');};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).sort().join(',')!==[...keys].sort().join(','))fail();};
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
export function surfingProfileSignature(p:AiProfileInput|AiProfileView){return createHash('sha256').update(JSON.stringify([p.id,p.protocol,p.endpoint,p.model,p.maxOutputTokens,p.timeoutMs,Object.entries(p.parameters).sort(([a],[b])=>a.localeCompare(b))])).digest('hex');}
/** Structural validation at storage; fresh-source evidence validation again at restore. */
export function validateSurfingSession(value:unknown,snapshot?:SurfingContext):SurfingSession{
 try{
  if(!record(value))return fail();if(Buffer.byteLength(JSON.stringify(value),'utf8')>262144)fail();const s=value as SurfingSession;
  exact(value,['version','documentId','fingerprint','source','route','selected','answers','contextWindowTokens','status']);
  if(s.version!==1||s.status!=='paused'||!identifier(s.documentId)||typeof s.fingerprint!=='string'||! /^[a-f0-9]{64}$/i.test(s.fingerprint)||!Number.isSafeInteger(s.contextWindowTokens)||s.contextWindowTokens<1||s.contextWindowTokens>10000000||!record(s.source)||!record(s.answers)||!record(s.route)||!Array.isArray(s.route.stops))fail();
  exact(s.source,['profileId','name','model','signature']);
  if(!identifier(s.source.profileId)||typeof s.source.name!=='string'||!s.source.name.trim()||s.source.name.length>100||typeof s.source.model!=='string'||!s.source.model.trim()||s.source.model.length>200||typeof s.source.signature!=='string'||! /^[a-f0-9]{64}$/.test(s.source.signature))fail();
  const ids=new Set<string>();const add=(v:unknown)=>{if(!identifier(v))return fail();ids.add(v);};
  for(const stop of s.route.stops){if(!record(stop)||!Array.isArray(stop.passageIds))fail();for(const id of stop.passageIds)add(id);}
  if(Object.keys(s.answers).length>5)fail();
  for(const [index,a] of Object.entries(s.answers)){
   if(!/^[0-4]$/.test(index)||Number(index)>=s.route.stops.length||!record(a))fail();exact(a,['text','passageIds']);
   if(typeof a.text!=='string'||!a.text.trim()||a.text.length>8192||!Array.isArray(a.passageIds)||!a.passageIds.length||a.passageIds.length>8||new Set(a.passageIds).size!==a.passageIds.length)fail();for(const id of a.passageIds)add(id);
  }
  if(snapshot&&(snapshot.context.documentId!==s.documentId||snapshot.context.fingerprint!==s.fingerprint))fail();
  const known=snapshot||{context:{documentId:s.documentId,fingerprint:s.fingerprint,revision:0},pageCount:1,passages:[...ids].map(id=>({id,documentId:s.documentId,fingerprint:s.fingerprint,pageIndex:0,quote:'Structural reference only',quads:[[0,1,1,1,0,0,1,0]]})),emptyPages:[],characterCount:0,coverage:'all-pages-have-text' as const};
  parseSurfingRoute(JSON.stringify(s.route),known);
  if(snapshot)for(const a of Object.values(s.answers))if(a.passageIds.some(id=>!snapshot.passages.some(p=>p.id===id)))fail();
  if(s.selected!==null&&(!Number.isInteger(s.selected)||s.selected<0||s.selected>=s.route.stops.length))fail();
  return structuredClone(s);
 }catch{return fail();}
}
export class SurfingSessions{
 constructor(private workspace:Pick<Workspace,'db'|'verified'>){}
 get(documentId:string):SurfingSession|null{
  const doc=this.workspace.verified(documentId);
  if(!this.workspace.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='surfing_sessions'").get())return null;
  const row=this.workspace.db.prepare('SELECT payload FROM surfing_sessions WHERE documentId=?').get(documentId);if(!row)return null;
  const payload=row.payload;if(typeof payload!=='string')return fail();if(Buffer.byteLength(payload,'utf8')>262144)fail();let value:unknown;try{value=JSON.parse(payload);}catch{return fail();}
  const clean=validateSurfingSession(value);if(clean.documentId!==documentId||clean.fingerprint!==doc.fingerprint)fail();return clean;
 }
 save(value:SurfingSession):void{
  const clean=validateSurfingSession(value),doc=this.workspace.verified(clean.documentId);if(doc.fingerprint!==clean.fingerprint)fail();
  this.workspace.db.exec('CREATE TABLE IF NOT EXISTS surfing_sessions (documentId TEXT PRIMARY KEY REFERENCES documents(id),payload TEXT NOT NULL CHECK(length(payload)<=262144))');
  this.workspace.db.prepare('INSERT INTO surfing_sessions(documentId,payload) VALUES(?,?) ON CONFLICT(documentId) DO UPDATE SET payload=excluded.payload').run(clean.documentId,JSON.stringify(clean));
 }
}
