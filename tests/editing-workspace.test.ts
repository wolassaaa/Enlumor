import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Workspace } from '../src/main/workspace';
import { openEditingWorkspace } from '../src/main/editing-workspace';
import { runEditingCommand } from '../src/main/editing-executor';
import type { EditHost, EditResult } from '../src/main/editing-executor';
import { editingFixture, editingHost, freeNote } from './helpers/editing-fixtures';
const fixtures: ReturnType<typeof editingFixture>[] = [], workspaces: Workspace[] = [];
function fixture() { const f=editingFixture(); fixtures.push(f); return f; }
async function open(file: string) { const x=await openEditingWorkspace(file); workspaces.push(x.workspace); return x; }
const version=(db: DatabaseSync)=>Number(db.prepare('PRAGMA user_version').get()!.user_version);
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const signal=()=>new AbortController().signal;
function committed(r:EditResult) { expect(r.status).toBe('committed'); if(r.status!=='committed')throw Error(JSON.stringify(r)); return r; }
afterEach(()=>{vi.restoreAllMocks(); for(const w of workspaces.splice(0))w.close(); for(const f of fixtures.splice(0))f.cleanup();});
describe('production Workspace schema5 and editing transactions',()=>{
  it('backs up v4 with integrity and untouched old rows, atomically creates seven tables and stable user',async()=>{
    const f=fixture(); const {workspace:w,edits,backupPath}=await open(f.file);
    expect(version(w.db)).toBe(5); expect(backupPath).toMatch(/\.pre-v5\..+\.bak$/);
    const b=new DatabaseSync(backupPath!,{readOnly:true});
    try { expect(version(b)).toBe(4); expect(b.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
      for(const t of ['documents','annotations','preferences','ai_profiles','reading','cruise_sessions']) {
        const before=b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
        const after=w.db.prepare(`SELECT * FROM ${t} ${t==='preferences'?"WHERE key!='editing-user-id'":''} ORDER BY rowid`).all(); expect(after).toEqual(before);
      }
    } finally {b.close();}
    expect(w.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'edit_%'").all()).toHaveLength(7);
    expect(edits.actor.kind).toBe('user'); const actor=edits.actor; w.close(); const next=await open(f.file);
    expect(next.backupPath).toBeNull(); expect(next.edits.actor).toEqual(actor);
    expect(()=>new Workspace(f.file)).toThrow(/DATABASE_VERSION/);
  });
  it('reopens v5 without resetting receipts, versions, history or deleted tombstones; backup restores independently',async()=>{
    const f=fixture(); const a=await open(f.file); const h=editingHost(a.edits,f.context); const input={context:f.context,requestId:'create',command:freeNote};
    const first=committed(await runEditingCommand(input,h,signal())); const id=Object.keys(first.versions)[0];
    const receipt=a.workspace.db.prepare('SELECT payload FROM edit_receipts').get()!.payload;
    const backupHash=hash(a.backupPath!); a.workspace.close(); const b=await open(f.file);
    expect(b.edits.readSnapshot(f.context).versions[id]).toBe(1); expect(b.workspace.db.prepare('SELECT payload FROM edit_receipts').get()!.payload).toBe(receipt);
    expect(await runEditingCommand(input,editingHost(b.edits,{...f.context,revision:2}),signal())).toEqual(first);
    const undone=committed(await runEditingCommand({context:f.context,requestId:'undo',command:{type:'undo_edit',operationId:first.operationId}},editingHost(b.edits,f.context),signal()));
    expect(undone.versions[id]).toBe(2); expect(b.edits.view(f.context,b.edits.actor).hasEditingState).toBe(true);
    expect(b.edits.history(f.context,b.edits.actor)).toEqual({undoIds:[],redoIds:[first.operationId]});
    const redone=committed(await runEditingCommand({context:f.context,requestId:'redo',command:{type:'redo_edit',operationId:first.operationId}},editingHost(b.edits,f.context),signal())); expect(redone.versions[id]).toBe(3);
    b.workspace.close(); copyFileSync(a.backupPath!,f.file+'.restored'); const restored=new Workspace(f.file+'.restored'); expect(version(restored.db)).toBe(4); expect(restored.annotations(f.doc.id)).toEqual([]); restored.close(); expect(hash(a.backupPath!)).toBe(backupHash);
  });
  it.each(['backup','ddl','busy','stale'] as const)('leaves old v4 intact on %s failure',async(stage)=>{
    const f=fixture(); const other=new DatabaseSync(f.file); const prepare=DatabaseSync.prototype.prepare, exec=DatabaseSync.prototype.exec;let backupDone=false,staleWindowReached=false;
    if(stage==='busy')other.exec('BEGIN IMMEDIATE');
    if(stage==='backup'||stage==='stale')vi.spyOn(DatabaseSync.prototype,'prepare').mockImplementation(function(this:DatabaseSync,sql:string){
      const st=prepare.call(this,sql); if(sql.startsWith('VACUUM INTO')) {const run=st.run.bind(st); st.run=((...args:unknown[])=>{if(stage==='backup')throw Error('disk fixture'); const r=Reflect.apply(run,st,args);backupDone=true;return r;}) as typeof st.run;} return st;
    });
    if(stage==='stale')vi.spyOn(DatabaseSync.prototype,'exec').mockImplementation(function(this:DatabaseSync,sql:string){if(backupDone&&sql==='BEGIN IMMEDIATE'){other.prepare("UPDATE preferences SET payload=payload||' '").run();staleWindowReached=true;}return exec.call(this,sql);});
    if(stage==='ddl')vi.spyOn(DatabaseSync.prototype,'exec').mockImplementation(function(this:DatabaseSync,sql:string){if(sql.includes('CREATE TABLE edit_marks')){exec.call(this,sql.split(';')[0]+';');throw Error('DDL fixture');} return exec.call(this,sql);});
    try {await expect(openEditingWorkspace(f.file)).rejects.toThrow(stage==='busy'?'BACKUP_BUSY':stage==='stale'?'BACKUP_STALE':'BACKUP_FAILED');}
    finally {vi.restoreAllMocks(); if(stage==='busy')other.exec('ROLLBACK'); other.close();}
    if(stage==='stale')expect(staleWindowReached).toBe(true);
    const old=new Workspace(f.file); expect(version(old.db)).toBe(4); expect(old.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'edit_%'").all()).toEqual([]); old.close();
  },15000);
  it('does not mutate a newer database',async()=>{const f=fixture(); const db=new DatabaseSync(f.file);db.exec('PRAGMA user_version=6; PRAGMA wal_checkpoint(TRUNCATE)');db.close(); const before=hash(f.file);await expect(openEditingWorkspace(f.file)).rejects.toThrow('DATABASE_VERSION');expect(hash(f.file)).toBe(before);});
  it('rolls back partial deltas/history/receipt and rejects async callbacks',async()=>{
    const f=fixture(); const {workspace:w,edits}=await open(f.file); const h=editingHost(edits,f.context);
    w.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON edit_receipts BEGIN SELECT RAISE(ABORT,'receipt fixture'); END");
    expect(await runEditingCommand({context:f.context,requestId:'a',command:freeNote},h,signal())).toMatchObject({status:'error'});
    for(const t of ['edit_marks','edit_versions','edit_operations','edit_receipts'])expect(w.db.prepare(`SELECT count(*) n FROM ${t}`).get()!.n).toBe(0);
    expect(()=>edits.transaction((()=>Promise.resolve()) as never)).toThrow(/synchronous/);
  });
  it('two real connections racing the same version commit once',async()=>{
    const f=fixture();const a=await open(f.file), b=await open(f.file);const h=editingHost(a.edits,f.context);
    const first=committed(await runEditingCommand({context:f.context,requestId:'create',command:freeNote},h,signal())); const id=Object.keys(first.versions)[0];
    const command={type:'update_mark',id,expectedVersion:1,patch:{note:'winner'}};
    const results=await Promise.all([runEditingCommand({context:f.context,requestId:'a',command},h,signal()),runEditingCommand({context:f.context,requestId:'b',command},editingHost(b.edits,f.context),signal())]);
    expect(results.filter(r=>r.status==='committed')).toHaveLength(1); expect(results.find(r=>r.status!=='committed')).toMatchObject({error:{code:'VERSION_CONFLICT'}});expect(a.edits.readSnapshot(f.context).versions[id]).toBe(2);
  });
  it('last precommit cancel rolls back, while postcommit cancel preserves durable receipt',async()=>{
    const f=fixture();const {edits}=await open(f.file); const h=editingHost(edits,f.context); const c=new AbortController();const transaction=h.transaction;
    h.transaction=body=>transaction(tx=>body({...tx,writeReceipt:r=>{tx.writeReceipt(r);c.abort();}}));
    const input={context:f.context,requestId:'cancel',command:freeNote}; expect(await runEditingCommand(input,h,c.signal)).toMatchObject({error:{code:'EDIT_CANCELED'}});expect(edits.readSnapshot(f.context).marks).toEqual([]);
    const d=new AbortController(); h.transaction=body=>{const result=transaction(body); d.abort();return result;};committed(await runEditingCommand(input,h,d.signal));committed(await runEditingCommand(input,h,d.signal));expect(edits.readSnapshot(f.context).marks).toHaveLength(1);
  });
  it('history lists only version-applicable groups and clears redo for its actual owner',async()=>{
    const f=fixture();const {edits}=await open(f.file);const h=editingHost(edits,f.context);
    const create=committed(await runEditingCommand({context:f.context,requestId:'c',command:freeNote},h,signal()));const id=Object.keys(create.versions)[0];
    const update=committed(await runEditingCommand({context:f.context,requestId:'u',command:{type:'update_mark',id,expectedVersion:1,patch:{note:'new'}}},h,signal()));
    expect(edits.history(f.context,edits.actor)).toEqual({undoIds:[update.operationId],redoIds:[]});
    committed(await runEditingCommand({context:f.context,requestId:'undo',command:{type:'undo_edit',operationId:update.operationId}},h,signal()));
    expect(edits.history(f.context,edits.actor)).toEqual({undoIds:[],redoIds:[update.operationId]});
    committed(await runEditingCommand({context:f.context,requestId:'branch',command:{type:'update_mark',id,expectedVersion:3,patch:{color:'#456789'}}},h,signal()));
    expect(edits.history(f.context,edits.actor).redoIds).toEqual([]);expect(edits.history(f.context,{kind:'user',id:'other'})).toEqual({undoIds:[],redoIds:[]});
  });
  it('revokes transaction ports after return or rejected async callback; late continuations cannot write',async()=>{
    const f=fixture();const {edits,workspace:w}=await open(f.file);let saved:Parameters<Parameters<typeof edits.transaction>[0]>[0]|null=null;
    edits.transaction(tx=>{saved=tx;});expect(()=>saved!.consumeConfirmation('x')).toThrow('transaction ended');
    let later:Promise<unknown>|undefined;
    expect(()=>edits.transaction(tx=>{later=Promise.resolve().then(()=>tx.writeDeltas(f.context,[{id:'late',expectedVersion:0,before:null,after:null}]));return later;})).toThrow('synchronous');
    await expect(later).rejects.toThrow('transaction ended');expect(w.db.prepare('SELECT * FROM edit_versions').all()).toEqual([]);
  });
  it('confirmation consume failure rolls back all changes and zero consumption; successful approval survives reopen',async()=>{
    const f=fixture();const {edits,workspace:w}=await open(f.file);const h=editingHost(edits,f.context);
    const created=committed(await runEditingCommand({context:f.context,requestId:'user',command:freeNote},h,signal()));const id=Object.keys(created.versions)[0];
    h.getActor=()=>({kind:'ai',id:'fixture-agent',sessionId:'fixture-session'});const input={context:f.context,requestId:'ai',command:{type:'update_mark',id,expectedVersion:1,patch:{note:'proposed'}}};
    const preview=await runEditingCommand(input,h,signal());expect(preview.status).toBe('confirmation_required');if(preview.status!=='confirmation_required')throw Error('preview');
    edits.saveConfirmation({id:'approved',...preview.confirmation,consumed:false});h.getConfirmation=()=> 'approved';
    w.db.exec("CREATE TRIGGER consume_fail BEFORE UPDATE OF consumed ON edit_confirmations BEGIN SELECT RAISE(ABORT,'consume fixture'); END");
    expect(await runEditingCommand(input,h,signal())).toMatchObject({status:'error'});expect(edits.readSnapshot(f.context).marks[0]).toMatchObject({version:1,note:'saved'});expect(w.db.prepare('SELECT consumed FROM edit_confirmations').get()!.consumed).toBe(0);expect(w.db.prepare('SELECT count(*) n FROM edit_operations').get()!.n).toBe(1);
    w.db.exec('DROP TRIGGER consume_fail');committed(await runEditingCommand(input,h,signal()));expect(w.db.prepare('SELECT consumed FROM edit_confirmations').get()!.consumed).toBe(1);w.close();const next=await open(f.file);expect(next.edits.readSnapshot(f.context).marks[0]).toMatchObject({version:2,note:'proposed'});
  });
  it('recovers real committed receipt if connection reports an error after COMMIT without retry',async()=>{
    const f=fixture();const {edits,workspace:w}=await open(f.file);const exec=w.db.exec.bind(w.db);let commits=0;
    vi.spyOn(w.db,'exec').mockImplementation(sql=>{exec(sql);if(sql==='COMMIT'){commits++;throw Error('reply lost after commit');}});
    committed(await runEditingCommand({context:f.context,requestId:'lost',command:freeNote},editingHost(edits,f.context),signal()));expect(commits).toBe(1);expect(edits.readSnapshot(f.context).marks).toHaveLength(1);
  });
  it('explicitly allowing schema5 does not itself migrate v4; migrated legacy write port is readonly',async()=>{
    const f=fixture();const before=new Workspace(f.file,{allowEditingSchema:true});expect(version(before.db)).toBe(4);before.close();
    const {workspace:w}=await open(f.file);expect(()=>w.apply({documentId:f.doc.id,upserts:[],deletes:[]})).toThrow('LEGACY_READ_ONLY');
  });
  it('closes newly opened candidate connection if initial connection configuration throws',()=>{
    const f=fixture();const exec=DatabaseSync.prototype.exec;let candidate:DatabaseSync|undefined;
    vi.spyOn(DatabaseSync.prototype,'exec').mockImplementation(function(this:DatabaseSync,sql:string){if(sql.startsWith('PRAGMA foreign_keys')){candidate=this;throw Error('configuration fixture');}return exec.call(this,sql);});
    try {expect(()=>new Workspace(f.file,{allowEditingSchema:true})).toThrow('configuration fixture');expect(candidate?.isOpen).toBe(false);}finally{if(candidate?.isOpen)candidate.close();}
  });
  it('schema enforces nonnegative safe integer versions even at the SQL boundary',async()=>{
    const f=fixture();const {workspace:w}=await open(f.file);
    for(const v of [-1,1.5,Number.MAX_SAFE_INTEGER+1])expect(()=>w.db.prepare('INSERT INTO edit_versions VALUES(?,?,?,?)').run(f.doc.id,f.doc.fingerprint,'bad',v)).toThrow();
  });
  it('view reads marks, legacy diagnostics and history from one real WAL read snapshot',async()=>{
    const f=fixture();const a=await open(f.file),b=await open(f.file);const first=committed(await runEditingCommand({context:f.context,requestId:'c',command:freeNote},editingHost(a.edits,f.context),signal()));const id=Object.keys(first.versions)[0];
    const original=a.edits.legacyInputs.bind(a.edits);
    vi.spyOn(a.edits,'legacyInputs').mockImplementationOnce(doc=>{
      b.edits.transaction(tx=>{const before=b.edits.readSnapshot(f.context).marks[0];tx.writeDeltas(f.context,[{id,expectedVersion:1,before,after:{...before,note:'other connection',version:2}}]);b.workspace.db.prepare('INSERT INTO annotations VALUES(?,?,?)').run('new-broken',doc,'{}');});
      return original(doc);
    });
    const view=a.edits.view(f.context,a.edits.actor);expect(view.marks[0]).toMatchObject({version:1,note:'saved'});expect(view.diagnostics).toEqual([]);expect(view.history.undoIds).toEqual([first.operationId]);
    const fresh=a.edits.view(f.context,a.edits.actor);expect(fresh.marks[0]).toMatchObject({version:2,note:'other connection'});expect(fresh.diagnostics).toEqual([{legacyId:'new-broken',reason:'INVALID_LEGACY_PAYLOAD'}]);expect(fresh.history.undoIds).toEqual([]);
  });
});
