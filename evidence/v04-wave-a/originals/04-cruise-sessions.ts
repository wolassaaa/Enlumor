import type{CruiseSession}from'../shared/cruise';
import{validateAnnotation}from'../shared/geometry';
import type{Workspace}from'./workspace';
const fail=()=>{throw Error('CRUISE_INVALID_SESSION');};
export class CruiseSessions{
 constructor(private workspace:Workspace){}
 private validate(value:CruiseSession):CruiseSession{
  const s=value;if(!s||typeof s.documentId!=='string'||typeof s.fingerprint!=='string'||typeof s.profileId!=='string'||s.profileId.length>100||!['manual','auto'].includes(s.mode)||!['slow','normal','fast'].includes(s.pace)||!['paused','finished'].includes(s.status)||!s.results||typeof s.results!=='object'||Array.isArray(s.results))return fail();
  const doc=this.workspace.verified(s.documentId);if(doc.fingerprint!==s.fingerprint)return fail();
  if(s.block){if(s.block.documentId!==s.documentId||s.block.fingerprint!==s.fingerprint||!s.block.quote||s.block.quote.length>1200||s.block.quads.length>100)return fail();try{validateAnnotation({...s.block,type:'highlight',author:'user',color:'#f4cf58',note:''},doc.pageCount);}catch{return fail();}}
  const results:Record<string,any>={};const entries=Object.entries(s.results);if(entries.length>64)return fail();for(const[id,result]of entries){if(!/^[\w-]{1,100}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||!result||typeof result.text!=='string'||result.text.length>65536||!result.source||['profileId','name','model'].some(k=>typeof(result.source as any)[k]!=='string'||(result.source as any)[k].length>500))return fail();results[id]={text:result.text,source:{profileId:result.source.profileId,name:result.source.name,model:result.source.model}};}
  const clean:CruiseSession={documentId:s.documentId,fingerprint:s.fingerprint,block:s.block?{id:s.block.id,documentId:s.block.documentId,fingerprint:s.block.fingerprint,pageIndex:s.block.pageIndex,quote:s.block.quote,quads:s.block.quads.map(q=>q.slice())}:null,profileId:s.profileId,mode:s.mode,pace:s.pace,status:s.status,results};if(JSON.stringify(clean).length>1024*1024)return fail();return clean;
 }
 get(id:string):CruiseSession|null{this.workspace.verified(id);const row=this.workspace.db.prepare('SELECT payload FROM cruise_sessions WHERE documentId=?').get(id);return row?this.validate(JSON.parse(row.payload as string)):null;}
 save(session:CruiseSession){const clean=this.validate(session);this.workspace.db.prepare('INSERT INTO cruise_sessions VALUES(?,?) ON CONFLICT(documentId) DO UPDATE SET payload=excluded.payload').run(clean.documentId,JSON.stringify(clean));}
}
