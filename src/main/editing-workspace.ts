import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Workspace } from './workspace';
import type { CommandContext } from '../shared/document-commands';
import type { Annotation } from '../shared/model';
import type { EditActor, EditDelta, EditMark, EditSnapshot, VerifiedAnchor } from '../shared/editing-commands';
import type { EditConfirmation, EditOperation, EditReceipt, EditTransaction, HistoryWrite } from './editing-executor';
import type { EditingView, LegacyMarkView } from '../shared/editing-bridge';
import { canonicalDigest } from '../shared/editing-planner';
import { validateGeometry, validateMark, version as validateVersion } from '../shared/editing-marks';
import { validateAnnotation } from '../shared/geometry';

const schema = `
CREATE TABLE edit_marks(documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version>=0 AND version<=9007199254740991),payload TEXT NOT NULL,PRIMARY KEY(documentId,fingerprint,id));
CREATE TABLE edit_versions(documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version>=0 AND version<=9007199254740991),PRIMARY KEY(documentId,fingerprint,id));
CREATE TABLE edit_anchors(documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,id TEXT NOT NULL,pageIndex INTEGER NOT NULL,parserVersion INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(documentId,fingerprint,id));
CREATE TABLE edit_operations(operationId TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,actorKey TEXT NOT NULL,redoOwnerKey TEXT,action TEXT NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX edit_operations_actor ON edit_operations(documentId,fingerprint,actorKey,action,state);
CREATE INDEX edit_operations_redo ON edit_operations(documentId,fingerprint,redoOwnerKey,action,state);
CREATE TABLE edit_receipts(requestKey TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,actorKey TEXT NOT NULL,requestDigest TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE edit_confirmations(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL);
CREATE TABLE edit_legacy_imports(documentId TEXT NOT NULL REFERENCES documents(id),fingerprint TEXT NOT NULL,legacyId TEXT NOT NULL,inputDigest TEXT NOT NULL,state TEXT NOT NULL,markId TEXT,reason TEXT NOT NULL,auditPayload TEXT,PRIMARY KEY(documentId,fingerprint,legacyId));
PRAGMA user_version=5;`;
const userKey='editing-user-id';
const dbVersion=(db:DatabaseSync)=>Number(db.prepare('PRAGMA user_version').get()!.user_version);
const dataVersion=(db:DatabaseSync)=>Number(db.prepare('PRAGMA data_version').get()!.data_version);
const busy=(e:unknown)=>{const x=e as {errcode?:number;code?:string};return x?.errcode===5||x?.errcode===6||x?.code==='SQLITE_BUSY'||x?.code==='SQLITE_LOCKED';};
const actorKey=(actor:EditActor)=>canonicalDigest(actor);

/** Explicit preview opener. VACUUM includes committed WAL pages; no live-file copies. */
export async function openEditingWorkspace(file:string):Promise<{workspace:Workspace;edits:WorkspaceEdits;backupPath:string|null}> {
  const workspace=new Workspace(file,{allowEditingSchema:true}); const db=workspace.db; let transaction=false;
  try {
    let backupPath:string|null=null;
    if(dbVersion(db)===4) {
      db.exec('PRAGMA busy_timeout=0');
      const initial=dataVersion(db);
      const checkpoint=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      if(Number(checkpoint?.busy))throw Error('BACKUP_BUSY');
      backupPath=`${file}.pre-v5.${Date.now()}-${randomUUID()}.bak`;
      db.prepare('VACUUM INTO ?').run(backupPath);
      const backup=new DatabaseSync(backupPath,{readOnly:true});
      try {
        if(dbVersion(backup)!==4||backup.prepare('PRAGMA integrity_check').get()!.integrity_check!=='ok')throw Error('BACKUP_FAILED');
        for(const table of ['documents','annotations','reading','preferences','ai_profiles','cruise_sessions']) {
          const n=(connection:DatabaseSync)=>Number(connection.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n);
          if(n(db)!==n(backup))throw Error('BACKUP_STALE');
          // Never materialize ai_profiles.secret. VACUUM/integrity covers its physical pages.
          const columns=table==='ai_profiles'?'id,payload':'*';
          const order=table==='preferences'?'key':['reading','cruise_sessions'].includes(table)?'documentId':'id';
          const rows=(connection:DatabaseSync)=>connection.prepare(`SELECT ${columns} FROM ${table} ORDER BY ${order}`).all();
          if(canonicalDigest(rows(db))!==canonicalDigest(rows(backup)))throw Error('BACKUP_STALE');
        }
      } finally {backup.close();}
      db.exec('BEGIN IMMEDIATE'); transaction=true;
      if(dataVersion(db)!==initial||dbVersion(db)!==4)throw Error('BACKUP_STALE');
      db.exec(schema);
      db.prepare('INSERT INTO preferences(key,payload) VALUES(?,?)').run(userKey,JSON.stringify(randomUUID()));
      db.exec('COMMIT'); transaction=false;
      db.exec('PRAGMA busy_timeout=5000');
    }
    return {workspace,edits:new WorkspaceEdits(workspace),backupPath};
  } catch(error) {
    if(transaction)try{db.exec('ROLLBACK');}catch{}
    workspace.close();
    if(busy(error))throw Error('BACKUP_BUSY');
    if(error instanceof Error && /^(BACKUP_BUSY|BACKUP_STALE|BACKUP_FAILED|DATABASE_VERSION)/.test(error.message))throw error;
    throw new Error('BACKUP_FAILED', {cause:error});
  }
}
export type LegacyInput={legacyId:string;inputDigest:string;annotation:Annotation|null;reason:string};
/** Persistent command ports on the actual Workspace connection. IPC owns session state. */
export class WorkspaceEdits {
  readonly actor:Extract<EditActor,{kind:'user'}>;
  constructor(readonly workspace:Workspace) {
    if(dbVersion(workspace.db)!==5)throw Error('DATABASE_VERSION');
    const row=workspace.db.prepare('SELECT payload FROM preferences WHERE key=?').get(userKey);
    if(!row)throw Error('DATABASE_VERSION: missing editing identity');
    const id=JSON.parse(row.payload as string); if(typeof id!=='string'||!id.length)throw Error('DATABASE_VERSION: invalid editing identity');
    this.actor=Object.freeze({kind:'user',id});
  }
  private get db(){return this.workspace.db;}
  private context(c:CommandContext) {const d=this.workspace.document(c.documentId);if(d.fingerprint!==c.fingerprint)throw Error('SOURCE_CHANGED');return d;}
  private marks(c:CommandContext):{marks:EditMark[];diagnostics:{legacyId:string;reason:string}[]} {
    const doc=this.context(c); const bounds=Array.from({length:doc.pageCount},()=>[-1e7,-1e7,1e7,1e7] as [number,number,number,number]);
    const marks:EditMark[]=[],diagnostics:{legacyId:string;reason:string}[]=[];
    for(const row of this.db.prepare('SELECT id,version,payload FROM edit_marks WHERE documentId=? AND fingerprint=? ORDER BY rowid').all(c.documentId,c.fingerprint)) {
      try {const m=JSON.parse(row.payload as string);validateMark(m,c,bounds);if(m.id!==row.id||m.version!==row.version)throw Error('version mismatch'); marks.push(m);}
      catch {diagnostics.push({legacyId:String(row.id),reason:'INVALID_EDIT_MARK'});}
    }
    return {marks,diagnostics};
  }
  readSnapshot(c:CommandContext):EditSnapshot {
    const versions:Record<string,number>={};
    for(const r of this.db.prepare('SELECT id,version FROM edit_versions WHERE documentId=? AND fingerprint=?').all(c.documentId,c.fingerprint)){validateVersion(r.version);Object.defineProperty(versions,String(r.id),{value:Number(r.version),enumerable:true,writable:true,configurable:true});}
    return {context:structuredClone(c),marks:this.marks(c).marks,versions};
  }
  readReceipt(key:string):EditReceipt|null {const r=this.db.prepare('SELECT payload FROM edit_receipts WHERE requestKey=?').get(key);return r?JSON.parse(r.payload as string):null;}
  readOperation(c:CommandContext,id:string):EditOperation|null {const r=this.db.prepare('SELECT payload FROM edit_operations WHERE operationId=? AND documentId=? AND fingerprint=?').get(id,c.documentId,c.fingerprint);return r?JSON.parse(r.payload as string):null;}
  history(c:CommandContext,actor:EditActor):{undoIds:string[];redoIds:string[]} {
    this.context(c);const key=actorKey(actor);
    const current=this.db.prepare('SELECT version FROM edit_versions WHERE documentId=? AND fingerprint=? AND id=?');
    const applicable=(o:{currentVersions:Record<string,number>})=>Object.entries(o.currentVersions).every(([id,v])=>v<Number.MAX_SAFE_INTEGER&&Number(current.get(c.documentId,c.fingerprint,id)?.version??0)===v);
    // History buttons need metadata, not megabytes of stroke deltas/inverses.
    // SQLite projects from the same authoritative rows/read transaction; no cache.
    const fields="json_extract(payload,'$.operationId','$.currentVersions','$.redoEligible') AS metadata";
    const decode=(r:Record<string,unknown>)=>{const [operationId,currentVersions,redoEligible]=JSON.parse(r.metadata as string);return{operationId:operationId as string,currentVersions:currentVersions as Record<string,number>,redoEligible:!!redoEligible};};
    const undoIds=this.db.prepare(`SELECT ${fields} FROM edit_operations WHERE documentId=? AND fingerprint=? AND actorKey=? AND action='edit' AND state='applied' ORDER BY rowid DESC`).all(c.documentId,c.fingerprint,key).map(decode).filter(applicable).map(o=>o.operationId);
    const redoIds=this.db.prepare(`SELECT ${fields} FROM edit_operations WHERE documentId=? AND fingerprint=? AND redoOwnerKey=? AND action='edit' AND state='undone' ORDER BY rowid DESC`).all(c.documentId,c.fingerprint,key).map(decode).filter(o=>o.redoEligible&&applicable(o)).map(o=>o.operationId);
    return {undoIds,redoIds};
  }
  /** With legacyId, reads only that row so per-input imports stay linear in the document's legacy count. */
  legacyInputs(documentId:string,legacyId?:string):LegacyInput[] {
    const d=this.workspace.document(documentId);
    const one=legacyId===undefined?'':' AND a.id=?',params=legacyId===undefined?[d.fingerprint,documentId]:[d.fingerprint,documentId,legacyId];
    return this.db.prepare(`SELECT a.id,a.payload,i.state,i.inputDigest,i.reason FROM annotations a LEFT JOIN edit_legacy_imports i ON i.documentId=a.documentId AND i.fingerprint=? AND i.legacyId=a.id WHERE a.documentId=?${one} AND (i.state IS NULL OR i.state!='converted') ORDER BY a.rowid`).all(...params).map(row=>{
      const raw=String(row.payload);let annotation:Annotation|null=null,reason='LEGACY_READ_ONLY';
      try {const parsed=JSON.parse(raw);validateAnnotation(parsed,d.pageCount);validateGeometry({quads:parsed.quads,...(parsed.points?{points:parsed.points}:{})},parsed.type,[-1e7,-1e7,1e7,1e7]);if(parsed.id!==row.id||parsed.documentId!==d.id||parsed.fingerprint!==d.fingerprint)throw Error();annotation=parsed;reason=String(row.reason||'LEGACY_READ_ONLY');}catch{reason='INVALID_LEGACY_PAYLOAD';}
      return {legacyId:String(row.id),inputDigest:canonicalDigest({payload:raw}),annotation,reason};
    });
  }
  legacy(documentId:string,inputs=this.legacyInputs(documentId)):LegacyMarkView[] {return inputs.filter((x):x is LegacyInput & {annotation:Annotation}=>x.annotation!==null).map(x=>({legacyId:x.legacyId,inputDigest:x.inputDigest,annotation:x.annotation,status:'readonly',reason:x.reason}));}
  /** Every committed user edit records an operation; automatic legacy conversion records none. */
  hasUserEdits(c:Pick<CommandContext,'documentId'|'fingerprint'>):boolean {return !!this.db.prepare('SELECT 1 FROM edit_operations WHERE documentId=? AND fingerprint=? LIMIT 1').get(c.documentId,c.fingerprint);}
  view(c:CommandContext,actor:EditActor):EditingView {
    this.db.exec('BEGIN');try {
      const {marks,diagnostics}=this.marks(c);const inputs=this.legacyInputs(c.documentId);
      diagnostics.push(...inputs.filter(x=>!x.annotation).map(x=>({legacyId:x.legacyId,reason:x.reason})));
      const hasEditingState=!!this.db.prepare(`SELECT 1 FROM edit_versions WHERE documentId=? AND fingerprint=? UNION ALL SELECT 1 FROM edit_operations WHERE documentId=? AND fingerprint=? UNION ALL SELECT 1 FROM edit_legacy_imports WHERE documentId=? AND fingerprint=? AND state='converted' LIMIT 1`).get(c.documentId,c.fingerprint,c.documentId,c.fingerprint,c.documentId,c.fingerprint);
      const result={context:structuredClone(c),marks,legacy:this.legacy(c.documentId,inputs),diagnostics,history:this.history(c,actor),hasEditingState};this.db.exec('COMMIT');return result;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  anchors(c:CommandContext):VerifiedAnchor[] {this.context(c);return this.db.prepare('SELECT payload FROM edit_anchors WHERE documentId=? AND fingerprint=? AND parserVersion=1 ORDER BY rowid').all(c.documentId,c.fingerprint).map(r=>JSON.parse(r.payload as string));}
  saveAnchor(c:CommandContext,anchor:VerifiedAnchor) {this.context(c);this.db.prepare('INSERT OR IGNORE INTO edit_anchors VALUES(?,?,?,?,?,?)').run(c.documentId,c.fingerprint,anchor.id,anchor.pageIndex,1,JSON.stringify(anchor));}
  saveConfirmation(value:EditConfirmation) {this.context(value.context);this.db.prepare('INSERT INTO edit_confirmations VALUES(?,?,?,?,?)').run(value.id,value.context.documentId,value.context.fingerprint,Number(value.consumed),JSON.stringify(value));}
  transaction<T>(body:(tx:EditTransaction)=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    let active=true,commitAttempted=false;
    try {
      const ports:EditTransaction={readSnapshot:c=>this.readSnapshot(c),readReceipt:k=>this.readReceipt(k),readOperation:(c,id)=>this.readOperation(c,id),
        readConfirmation:id=>{const r=this.db.prepare('SELECT payload,consumed FROM edit_confirmations WHERE id=?').get(id);return r?{...JSON.parse(r.payload as string),consumed:!!r.consumed}:null;},
        writeDeltas:(c,d)=>this.writeDeltas(c,d),writeHistory:w=>this.writeHistory(w),
        writeReceipt:r=>{const op=this.db.prepare('SELECT actorKey FROM edit_operations WHERE operationId=?').get(r.result.operationId);if(!op)throw Error('missing receipt operation');this.db.prepare('INSERT INTO edit_receipts VALUES(?,?,?,?,?,?)').run(r.requestKey,r.result.documentId,r.result.fingerprint,String(op.actorKey),r.requestDigest,JSON.stringify(r));},
        consumeConfirmation:id=>{if(this.db.prepare('UPDATE edit_confirmations SET consumed=1 WHERE id=? AND consumed=0').run(id).changes!==1)throw Error('confirmation unavailable');}};
      const tx=Object.fromEntries(Object.entries(ports).map(([name,fn])=>[name,(...args:unknown[])=>{if(!active||!this.db.isTransaction)throw Error('transaction ended');return Reflect.apply(fn,undefined,args); }])) as EditTransaction;
      const result=body(tx);
      if(result&&typeof(result as {then?:unknown}).then==='function'){void Promise.resolve(result).catch(()=>{});throw Error('transaction callback must be synchronous');}
      commitAttempted=true;this.db.exec('COMMIT');return result;
    }catch(e){
      const inTransaction=this.db.isTransaction;
      if(inTransaction)try{this.db.exec('ROLLBACK');}catch{throw Object.assign(new Error('COMMIT_UNCERTAIN',{cause:e}),{code:'COMMIT_UNCERTAIN'});}
      if(commitAttempted&&!inTransaction)throw Object.assign(new Error('COMMIT_UNCERTAIN',{cause:e}),{code:'COMMIT_UNCERTAIN'});
      throw e;
    }finally{active=false;}
  }
  private writeDeltas(c:CommandContext,deltas:EditDelta[]) {
    this.context(c);
    for(const d of deltas) {
      validateVersion(d.expectedVersion);validateVersion(d.expectedVersion+1);
      const row=this.db.prepare('SELECT version FROM edit_versions WHERE documentId=? AND fingerprint=? AND id=?').get(c.documentId,c.fingerprint,d.id);
      if(Number(row?.version??0)!==d.expectedVersion)throw Error('VERSION_CONFLICT');
      this.db.prepare('DELETE FROM edit_marks WHERE documentId=? AND fingerprint=? AND id=?').run(c.documentId,c.fingerprint,d.id);
      if(d.after)this.db.prepare('INSERT INTO edit_marks VALUES(?,?,?,?,?)').run(c.documentId,c.fingerprint,d.id,d.after.version,JSON.stringify(d.after));
      this.db.prepare('INSERT INTO edit_versions VALUES(?,?,?,?) ON CONFLICT(documentId,fingerprint,id) DO UPDATE SET version=excluded.version').run(c.documentId,c.fingerprint,d.id,d.expectedVersion+1);
    }
  }
  private writeHistory(w:HistoryWrite) {
    const c=w.operation.context;
    if(w.clearRedoFor)for(const r of this.db.prepare("SELECT payload FROM edit_operations WHERE documentId=? AND fingerprint=? AND redoOwnerKey=? AND action='edit' AND state='undone'").all(c.documentId,c.fingerprint,actorKey(w.clearRedoFor))) {const o=JSON.parse(r.payload as string) as EditOperation;o.redoEligible=false;this.updateOperation(o);}
    if(w.target)this.updateOperation(w.target);
    const o=w.operation;this.db.prepare('INSERT INTO edit_operations VALUES(?,?,?,?,?,?,?,?)').run(o.operationId,c.documentId,c.fingerprint,actorKey(o.actor),o.redoActor?actorKey(o.redoActor):null,o.action,o.state,JSON.stringify(o));
  }
  private updateOperation(o:EditOperation){this.db.prepare('UPDATE edit_operations SET redoOwnerKey=?,state=?,payload=? WHERE operationId=? AND documentId=? AND fingerprint=?').run(o.redoActor?actorKey(o.redoActor):null,o.state,JSON.stringify(o),o.operationId,o.context.documentId,o.context.fingerprint);}
  /** Compatibility audit is distinct from ordinary user undo history. Source work precedes this transaction. */
  importLegacy(c:CommandContext,input:LegacyInput,mark:EditMark|null,anchor:VerifiedAnchor|null,reason:string,audit:unknown=null) {
    this.transaction(()=>{
      const current=this.legacyInputs(c.documentId,input.legacyId)[0];
      if(!current||current.inputDigest!==input.inputDigest)throw Error('LEGACY_CHANGED');
      const existing=this.db.prepare('SELECT 1 FROM edit_versions WHERE documentId=? AND fingerprint=? AND id=?').get(c.documentId,c.fingerprint,input.legacyId);
      if(mark&&existing)return;
      if(anchor&&mark)this.saveAnchor(c,anchor);
      if(mark)this.writeDeltas(c,[{id:mark.id,expectedVersion:0,before:null,after:mark}]);
      this.db.prepare('INSERT INTO edit_legacy_imports VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(documentId,fingerprint,legacyId) DO UPDATE SET inputDigest=excluded.inputDigest,state=excluded.state,markId=excluded.markId,reason=excluded.reason,auditPayload=excluded.auditPayload').run(c.documentId,c.fingerprint,input.legacyId,input.inputDigest,mark?'converted':'readonly',mark?.id??null,reason,audit===null?null:JSON.stringify(audit));
    });
  }
}
