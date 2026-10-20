import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runEditingCommand, queryEditingReceipt } from '../src/main/editing-executor';
import type { EditResult } from '../src/main/editing-executor';
import type { EditMark } from '../src/shared/editing-commands';
import { EditingSqliteStore } from './helpers/editing-sqlite-store';

/** A real one-page PDF structure; the editing host never receives an output file port. */
function sourcePdf() {
  const stream='BT /F1 12 Tf 10 40 Td (source text) Tj ET\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [-10 -20 100 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`
  ];
  let pdf='%PDF-1.7\n'; const offsets=[0];
  objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(pdf)); pdf+=`${i+1} 0 obj\n${value}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf); pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('');
  return pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
const directories: string[] = [], stores: EditingSqliteStore[] = [];
function fixture() { const dir = mkdtempSync(join(tmpdir(),'enlumor-edit-')); directories.push(dir); const host = open(join(dir,'isolated.sqlite')); return { dir, host }; }
function open(path: string) { const h = new EditingSqliteStore(path); stores.push(h); return h; }
afterEach(() => { for (const h of stores.splice(0)) { try { h.close(); } catch {} } for (const d of directories.splice(0)) rmSync(d,{ recursive: true, force: true }); });
const signal = () => new AbortController().signal;
function request(h: EditingSqliteStore, command: unknown, requestId = 'request') { return { requestId, context: h.getContext(), command }; }
const create = { type: 'create_mark', markType: 'highlight', pageIndex: 0, color: '#123456', note: '', anchorId: 'source' };
function mark(id = 'mark', origin: EditMark['origin'] = { kind: 'ai', id: 'assistant', sessionId: 'session' }): EditMark {
  return { id, documentId: 'doc', fingerprint: 'a'.repeat(64), type: 'highlight', pageIndex: 0, quote: 'source text', quads: [[0,20,30,25,0,2,30,7]], color: '#123456', note: '', origin, retained: false, visible: true, version: 1, anchorId: 'source', placement: { dx: 0, dy: 0 } };
}
const update = (id='mark', expectedVersion=1, note='changed') => ({ type:'update_mark',id,expectedVersion,patch:{ note } });
function committed(r: EditResult) { expect(r.status).toBe('committed'); if (r.status !== 'committed') throw Error(JSON.stringify(r)); return r; }
function code(r: EditResult, expected: string) { expect(r).toMatchObject({ error: { code: expected } }); }
async function edit(h: EditingSqliteStore, command: unknown, id='request') { return runEditingCommand(request(h,command,id),h,signal()); }

// Removing the executor's durable checks must fail these SQL-state assertions, not just port counters.
describe('atomic editing executor against real temporary SQLite', () => {
  it('commits a trusted source mark with atomic versions/history/receipt and leaves source PDF unchanged', async () => {
    const {dir,host:h} = fixture(); const pdf = join(dir,'source.pdf'); writeFileSync(pdf,sourcePdf());
    const hash = () => createHash('sha256').update(readFileSync(pdf)).digest('hex'); const before = hash();
    const control=fixture().host; control.seed(mark('untouched')); const controlHash=createHash('sha256').update(readFileSync(control.filename)).digest('hex');
    const r = committed(await edit(h,create));
    expect(r).toMatchObject({documentId:'doc',fingerprint:h.context.fingerprint,versions:{[Object.keys(r.versions)[0]]:1}});
    expect(h.readSnapshot(h.context).marks[0]).toMatchObject({origin:h.actor,retained:false,visible:true,quads:h.anchors[0].quads});
    expect([h.count('marks'),h.count('tombstones'),h.count('operations'),h.count('receipts')]).toEqual([1,1,1,1]);
    expect(hash()).toBe(before);
    expect(createHash('sha256').update(readFileSync(control.filename)).digest('hex')).toBe(controlHash);
    console.info('ISOLATION',JSON.stringify({sourcePdf:pdf,beforeHash:before,afterHash:hash(),selectedDatabase:h.filename,untouchedDatabase:control.filename,untouchedDatabaseHash:controlHash}));
  });
  it('replays durable receipt before allocation despite page revision change, abort, and close/reopen', async () => {
    const {host:h} = fixture(); const input = request(h,create); const first = committed(await runEditingCommand(input,h,signal()));
    const path=h.filename; h.close(); stores.splice(stores.indexOf(h),1); const next=open(path); next.context.revision++;
    const abort=new AbortController(); abort.abort();
    expect(await runEditingCommand({...input,context:next.context},next,abort.signal)).toEqual(first);
    expect(next.allocations).toBe(0); expect(next.count('marks')).toBe(1); expect(next.count('operations')).toBe(1);
    expect(await queryEditingReceipt({...input,context:next.context},next)).toEqual(first);
  });
  it('rejects same id changed canonical command or expected version', async () => {
    const {host:h}=fixture(); h.seed(mark()); committed(await edit(h,update()));
    code(await edit(h,update('mark',1,'other')),'REQUEST_ID_REUSED');
    code(await edit(h,update('mark',2)),'REQUEST_ID_REUSED'); expect(h.count('operations')).toBe(1);
  });
  it('two actual connections racing the same object version commit only one operation', async () => {
    const {host:a}=fixture(); a.seed(mark()); const b=open(a.filename);
    a.beforeTransaction=() => { b.transaction(tx => { const m=b.readSnapshot(b.context).marks[0]; tx.writeDeltas(b.context,[{id:m.id,expectedVersion:1,before:m,after:{...m,note:'other connection',version:2}}]); }); };
    code(await edit(a,update()),'VERSION_CONFLICT');
    expect(a.readSnapshot(a.context).marks[0]).toMatchObject({version:2,note:'other connection'}); expect(a.count('operations')).toBe(0);
    committed(await edit(a,update('mark',2),'new')); expect(b.count('operations')).toBe(1); expect(b.readSnapshot(b.context).marks[0].version).toBe(3);
  });
  it('reports real SQLITE_BUSY and retries the original request after the other connection releases lock', async () => {
    const {host:a}=fixture(); const b=open(a.filename); b.db.exec('BEGIN IMMEDIATE');
    code(await edit(a,create),'STORE_BUSY'); expect(a.count('marks')).toBe(0);
    b.db.exec('ROLLBACK'); committed(await edit(a,create)); expect(b.count('receipts')).toBe(1);
  });
  it.each(['deltas','history','receipt','confirmation'] as const)('rolls back every table and approval when %s write fails', async stage => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'}));
    expect((await edit(h,update())).status).toBe('confirmation_required'); h.approve(); h.failAt=stage;
    code(await edit(h,update()),'EDIT_FAILED');
    expect(h.readSnapshot(h.context).marks[0]).toMatchObject({version:1,note:''});
    expect([h.count('operations'),h.count('receipts'),h.count('tombstones')]).toEqual([0,0,0]);
    expect(h.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(0);
    h.failAt=null; committed(await edit(h,update())); expect(h.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(1);
  });
  it('recovers a commit whose reply is lost without applying deltas again', async () => {
    const {host:h}=fixture(); h.loseReply=true;
    const first=committed(await edit(h,create)); expect(await edit(h,create)).toEqual(first);
    expect([h.count('marks'),h.count('operations'),h.count('receipts')]).toEqual([1,1,1]);
  });
  it('returns COMMIT_UNCERTAIN if a host cannot establish durable commit status, without automatic redo', async () => {
    const {host:h}=fixture(); let transactions=0;
    h.transaction=() => { transactions++; throw Object.assign(Error('unknown'),{code:'COMMIT_UNCERTAIN'}); };
    code(await edit(h,create),'COMMIT_UNCERTAIN'); expect(transactions).toBe(1); expect(h.count('marks')).toBe(0);
  });
  it('cancels before preparation and at the last write, rolling back all tables', async () => {
    const {host:h}=fixture(); const c=new AbortController(); c.abort();
    code(await runEditingCommand(request(h,create),h,c.signal),'EDIT_CANCELED'); expect(h.allocations).toBe(0);
    const d=new AbortController(); h.beforeReceipt=()=>d.abort();
    code(await runEditingCommand(request(h,create),h,d.signal),'EDIT_CANCELED');
    expect([h.count('marks'),h.count('operations'),h.count('receipts'),h.count('tombstones')]).toEqual([0,0,0,0]);
  });
  it('preserves committed attribution when cancellation and document switch happen after COMMIT', async () => {
    const {host:h}=fixture(); const c=new AbortController(); const original=request(h,create);
    h.afterCommit=()=>{ c.abort(); h.context={documentId:'other',fingerprint:'b'.repeat(64),revision:4}; };
    const r=committed(await runEditingCommand(original,h,c.signal)); expect(r.documentId).toBe('doc');
    expect(await queryEditingReceipt(original,h)).toEqual(r); expect(h.readSnapshot(h.context).marks).toEqual([]);
  });
  it.each(['abort','context','actor'] as const)('checks %s after asynchronous anchor resolution', async mode => {
    const {host:h}=fixture(); const c=new AbortController(); h.resolveAnchors=async()=>{
      if(mode==='abort') c.abort(); if(mode==='context') h.context.revision++; if(mode==='actor') h.actor={kind:'ai',id:'assistant',sessionId:'other'}; return h.anchors;
    };
    code(await runEditingCommand(request(h,create),h,c.signal),mode==='abort'?'EDIT_CANCELED':'EDIT_STALE'); expect(h.count('marks')).toBe(0);
  });
  it('requires specific differences for user, retained, and other-session AI marks', async () => {
    for (const m of [mark('mark',{kind:'user',id:'reader'}),{...mark(),retained:true},mark('mark',{kind:'ai',id:'assistant',sessionId:'other'})]) {
      const {host:h}=fixture(); h.seed(m); const preview=await edit(h,update()); expect(preview.status).toBe('confirmation_required');
      const binding=structuredClone(h.candidate!); h.approve(); committed(await edit(h,update())); expect(h.candidate).toEqual(binding);
    }
  });
  it('rejects stale differences and credentials bound to another actor/document', async () => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'})); await edit(h,update()); h.approve();
    code(await edit(h,update('mark',1,'different')),'CONFIRMATION_INVALID');
    h.actor={kind:'ai',id:'assistant',sessionId:'other'}; code(await edit(h,update()),'CONFIRMATION_INVALID');
    expect(h.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(0); expect(h.count('operations')).toBe(0);
  });
  it('does not consume approval when a concurrent protected edit changes the preview base', async () => {
    const {host:a}=fixture(); a.seed(mark('mark',{kind:'user',id:'reader'})); await edit(a,update()); a.approve(); const b=open(a.filename);
    a.beforeTransaction=()=>b.transaction(tx=>{ const m=b.readSnapshot(b.context).marks[0]; tx.writeDeltas(b.context,[{id:m.id,before:m,after:{...m,note:'raced',version:2},expectedVersion:1}]); });
    code(await edit(a,update()),'VERSION_CONFLICT'); expect(a.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(0); expect(a.count('receipts')).toBe(0);
  });
  it('normalizes identifier sets for receipt replay without sorting operation order', async () => {
    const {host:h}=fixture(); h.seed(mark('a')); h.seed(mark('b'));
    const cmd={type:'set_marks_visibility',targets:[{id:'b',expectedVersion:1},{id:'a',expectedVersion:1}],visible:false}; const first=committed(await edit(h,cmd));
    expect(await edit(h,{...cmd,targets:[...cmd.targets].reverse()})).toEqual(first); expect(h.count('operations')).toBe(1);
  });
  it('rejects batch with one invalid target without any write', async () => {
    const {host:h}=fixture(); h.seed(mark()); code(await edit(h,{type:'apply_edit_batch',operations:[update(),update('missing')]}),'MARK_NOT_FOUND');
    expect(h.readSnapshot(h.context).marks[0].version).toBe(1); expect(h.count('operations')).toBe(0);
  });
  it('rejects model identity/confirmation fields and accessor input without invoking it', async () => {
    const {host:h}=fixture(); let getter=0; const input={requestId:'r',context:h.context,get command(){getter++; return create;}};
    code(await runEditingCommand(input,h,signal()),'EDIT_INVALID'); expect(getter).toBe(0);
    code(await edit(h,{...create,confirmed:true}),'EDIT_INVALID'); code(await edit(h,{...create,origin:{kind:'user',id:'x'}}),'EDIT_INVALID'); expect(h.count('marks')).toBe(0);
  });
  it('keeps reads and explicit hidden-unretained export snapshots out of durable history', async () => {
    const {host:h}=fixture(); h.seed({...mark(),visible:false,retained:false});
    expect((await edit(h,{type:'list_marks'})).status).toBe('read'); expect((await edit(h,{type:'get_mark',id:'mark'})).status).toBe('read');
    const r=await edit(h,{type:'prepare_mark_export',selection:{origins:['ai'],ids:['mark'],includeHidden:true}});
    expect(r).toMatchObject({status:'prepared',exportSnapshot:{marks:[{id:'mark',visible:false,retained:false}]}});
    code(await edit(h,{type:'export_marked_pdf',snapshotId:'snapshot'}),'UNSUPPORTED'); expect(h.count('operations')).toBe(0); expect(h.count('receipts')).toBe(0);
  });
  it('treats a no-op as prepared, not a saved operation', async () => {
    const {host:h}=fixture(); h.seed(mark()); expect((await edit(h,update('mark',1,''))).status).toBe('prepared'); expect(h.count('receipts')).toBe(0);
  });
});

describe('targeted durable history', () => {
  it('undoes and redoes a named group with strictly increasing versions and retained audit records', async () => {
    const {host:h}=fixture(); h.seed(mark()); const first=committed(await edit(h,update()));
    const undone=committed(await edit(h,{type:'undo_edit',operationId:first.operationId},'undo'));
    expect(h.readSnapshot(h.context).marks[0]).toMatchObject({note:'',version:3}); expect(h.readOperation(h.context,first.operationId)).toMatchObject({state:'undone',currentVersions:{mark:3}});
    expect(h.readOperation(h.context,undone.operationId)).toMatchObject({action:'undo',targetOperationId:first.operationId,actor:h.actor});
    committed(await edit(h,{type:'redo_edit',operationId:first.operationId},'redo'));
    expect(h.readSnapshot(h.context).marks[0]).toMatchObject({note:'changed',version:4}); expect(h.count('operations')).toBe(3);
  });
  it('restores deleted content with a newer tombstone version and prevents ABA creation reuse', async () => {
    const {host:h}=fixture(); const created=committed(await edit(h,create)); const id=Object.keys(created.versions)[0];
    const deleted=committed(await edit(h,{type:'delete_marks',targets:[{id,expectedVersion:1}]},'delete'));
    expect(h.readSnapshot(h.context).versions[id]).toBe(2); expect(h.count('marks')).toBe(0);
    committed(await edit(h,{type:'undo_edit',operationId:deleted.operationId},'undo-delete')); expect(h.readSnapshot(h.context).marks[0].version).toBe(3);
    code(await edit(h,{type:'undo_edit',operationId:created.operationId},'undo-create'),'VERSION_CONFLICT');
    expect(h.readOperation(h.context,created.operationId)?.state).toBe('applied');
  });
  it('does not overwrite another source edit or move history on a conflict', async () => {
    const {host:h}=fixture(); h.seed(mark()); const ai=committed(await edit(h,update())); h.actor={kind:'user',id:'reader'};
    committed(await edit(h,update('mark',2,'user change'),'user-edit'));
    h.actor={kind:'ai',id:'assistant',sessionId:'session'};
    code(await edit(h,{type:'undo_edit',operationId:ai.operationId},'undo'),'VERSION_CONFLICT');
    expect(h.readSnapshot(h.context).marks[0]).toMatchObject({version:3,note:'user change'}); expect(h.readOperation(h.context,ai.operationId)?.state).toBe('applied'); expect(h.count('operations')).toBe(2);
  });
  it('allows explicit user undo of AI groups; AI undo of user groups requires bound confirmation', async () => {
    const {host:h}=fixture(); h.seed(mark()); const ai=committed(await edit(h,update())); h.actor={kind:'user',id:'reader'};
    committed(await edit(h,{type:'undo_edit',operationId:ai.operationId},'user-undo'));
    const user=committed(await edit(h,update('mark',3,'by user'),'user-edit')); h.actor={kind:'ai',id:'assistant',sessionId:'session'};
    expect((await edit(h,{type:'undo_edit',operationId:user.operationId},'ai-undo')).status).toBe('confirmation_required'); h.approve();
    committed(await edit(h,{type:'undo_edit',operationId:user.operationId},'ai-undo')); expect(h.readSnapshot(h.context).marks[0].version).toBe(5);
  });
  it('clears only the executing actor redo branch on new edits, including durable reopen', async () => {
    const {host:h}=fixture(); h.seed(mark('a')); h.seed(mark('b')); const ai=committed(await edit(h,update('a'),'ai-edit'));
    committed(await edit(h,{type:'undo_edit',operationId:ai.operationId},'undo'));
    h.actor={kind:'user',id:'reader'}; committed(await edit(h,update('b'),'user-edit'));
    expect(h.readOperation(h.context,ai.operationId)?.redoEligible).toBe(true);
    h.actor={kind:'ai',id:'assistant',sessionId:'session'}; committed(await edit(h,update('b',2,'new branch'),'ai-new'));
    expect(h.readOperation(h.context,ai.operationId)?.redoEligible).toBe(false);
    code(await edit(h,{type:'redo_edit',operationId:ai.operationId},'redo'),'VERSION_CONFLICT'); expect(h.readSnapshot(h.context).marks.find(m=>m.id==='a')?.version).toBe(3);
  });
  it('rejects cross-document target histories without altering either document', async () => {
    const {host:h}=fixture(); const first=committed(await edit(h,create)); h.context={...h.context,documentId:'other'}; h.anchors=[];
    code(await edit(h,{type:'undo_edit',operationId:first.operationId},'undo'),'MARK_NOT_FOUND'); expect(h.count('marks')).toBe(1); expect(h.count('operations')).toBe(1);
  });
  it('rolls back targeted history state when the history write fails', async () => {
    const {host:h}=fixture(); h.seed(mark()); const first=committed(await edit(h,update())); h.failAt='history';
    code(await edit(h,{type:'undo_edit',operationId:first.operationId},'undo'),'EDIT_FAILED');
    expect(h.readOperation(h.context,first.operationId)?.state).toBe('applied'); expect(h.readSnapshot(h.context).marks[0].version).toBe(2); expect(h.count('receipts')).toBe(1);
  });
});


describe('executor race and authorization edges', () => {
  it('two executor connections competing for one expected version persist exactly one receipt/history', async () => {
    const {host:a}=fixture(); a.seed(mark('mark',{kind:'user',id:'reader'})); const b=open(a.filename);
    const first=await edit(a,update(),'a'); const second=await edit(b,update('mark',1,'competitor'),'b');
    expect([first.status,second.status]).toEqual(['confirmation_required','confirmation_required']); a.approve(); b.approve(undefined,'approval-b');
    const results=await Promise.all([edit(a,update(),'a'),edit(b,update('mark',1,'competitor'),'b')]);
    expect(results.filter(r=>r.status==='committed')).toHaveLength(1); code(results.find(r=>r.status!=='committed')!,'VERSION_CONFLICT');
    expect([a.count('marks'),a.count('operations'),a.count('receipts')]).toEqual([1,1,1]); expect(b.readSnapshot(b.context).marks[0].version).toBe(2);
    expect(a.db.prepare('SELECT sum(consumed) AS n FROM confirmations').get()!.n).toBe(1);
  });
  it('leaves approval reusable through real writer lock contention', async () => {
    const {host:a}=fixture(); a.seed(mark('mark',{kind:'user',id:'reader'})); await edit(a,update()); a.approve(); const b=open(a.filename); b.db.exec('BEGIN IMMEDIATE');
    code(await edit(a,update()),'STORE_BUSY'); expect(a.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(0);
    b.db.exec('ROLLBACK'); committed(await edit(a,update())); expect(a.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(1);
  });
  it('binds deterministic create IDs throughout a protected batch preview and confirmation retry', async () => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'})); const batch={type:'apply_edit_batch',operations:[create,update()]};
    await edit(h,batch); const candidate=structuredClone(h.candidate!); h.approve(); committed(await edit(h,batch));
    expect(h.candidate).toEqual(candidate); expect(h.count('marks')).toBe(2); expect(h.allocations).toBe(2);
    expect((await edit(h,batch)).status).toBe('committed'); expect(h.allocations).toBe(2);
  });
  it('detects collection phantoms by replanning under BEGIN IMMEDIATE', async () => {
    const {host:a}=fixture(); const b=open(a.filename);
    const ink: EditMark={...mark('ink-a'),type:'ink',quote:'',anchorId:null,quads:[[0,20,30,20,0,0,30,0]],points:[1,1,20,15]}; a.seed(ink);
    a.beforeTransaction=()=>b.seed({...ink,id:'ink-b'});
    code(await edit(a,{type:'erase_ink',pageIndex:0,from:[1,1],to:[20,15],radius:2}),'VERSION_CONFLICT');
    expect([a.count('marks'),a.count('operations'),a.count('receipts')]).toEqual([2,0,0]);
  });
  it('rejects deterministic creation IDs occupied by a live mark or tombstone, never overwriting', async () => {
    for (const tombstone of [false,true]) {
      const {host:h}=fixture(); const allocate=h.allocateIds.bind(h);
      h.allocateIds=(key,count)=>{const ids=allocate(key,count); if(tombstone) h.db.prepare('INSERT INTO tombstones VALUES(?,?,?,?)').run(h.context.documentId,h.context.fingerprint,ids[0],7); else h.seed(mark(ids[0])); return ids;};
      code(await edit(h,create),'VERSION_CONFLICT'); expect(h.count('operations')).toBe(0); expect(h.count('receipts')).toBe(0); expect(h.readSnapshot(h.context).versions[Object.keys(h.readSnapshot(h.context).versions)[0]]).toBe(tombstone?7:1);
    }
  });
  it('separates same request ID across actor sessions without returning another actor receipt', async () => {
    const {host:h}=fixture(); const first=committed(await edit(h,create)); h.actor={kind:'ai',id:'assistant',sessionId:'next'};
    expect(await queryEditingReceipt(request(h,create),h)).toBeNull(); const second=committed(await edit(h,create)); expect(second.operationId).not.toBe(first.operationId); expect(h.count('marks')).toBe(2);
  });
  it('rejects a forged cross-document confirmation even when host returns its ID', async () => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'})); await edit(h,update()); const c=structuredClone(h.candidate!); c.context.documentId='other'; h.approve(c);
    code(await edit(h,update()),'CONFIRMATION_INVALID'); expect(h.count('receipts')).toBe(0); expect(h.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(0);
  });
  it('rolls back a document switch at the last transactional write', async () => {
    const {host:h}=fixture(); h.beforeReceipt=()=>h.context.revision++;
    code(await edit(h,create),'EDIT_STALE'); expect([h.count('marks'),h.count('operations'),h.count('receipts')]).toEqual([0,0,0]);
  });
  it('does not reuse an already consumed confirmation for another request', async () => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'})); await edit(h,update()); h.approve(); committed(await edit(h,update()));
    code(await edit(h,update('mark',2,'new'),'different-request'),'CONFIRMATION_INVALID'); expect(h.count('operations')).toBe(1);
  });
  it('recovers undo/redo audit receipts and branch eligibility after closing and reopening SQLite', async () => {
    const {host:h}=fixture(); h.seed(mark()); const first=committed(await edit(h,update()));
    const cmd={type:'undo_edit',operationId:first.operationId}; const undone=committed(await edit(h,cmd,'undo')); const path=h.filename;
    h.close(); stores.splice(stores.indexOf(h),1); const next=open(path); next.context.revision++;
    expect(await edit(next,cmd,'undo')).toEqual(undone); expect(next.readOperation(next.context,first.operationId)).toMatchObject({state:'undone',redoEligible:true,currentVersions:{mark:3}});
    committed(await edit(next,{type:'redo_edit',operationId:first.operationId},'redo')); expect(next.readSnapshot(next.context).marks[0]).toMatchObject({note:'changed',version:4});
  });
});


describe('confirmation await gates', () => {
  it.each(['abort','actor','context'] as const)('checks %s after host awaits confirmation', async mode => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'})); await edit(h,update()); h.approve(); const c=new AbortController();
    const original=h.getConfirmation.bind(h); h.getConfirmation=async binding=>{const token=original(binding); if(mode==='abort')c.abort(); if(mode==='actor')h.actor={kind:'user',id:'reader'}; if(mode==='context')h.context.revision++; return token;};
    code(await runEditingCommand(request(h,update()),h,c.signal),mode==='abort'?'EDIT_CANCELED':'EDIT_STALE');
    expect([h.count('operations'),h.count('receipts')]).toEqual([0,0]); expect(h.db.prepare('SELECT consumed FROM confirmations').get()!.consumed).toBe(0);
  });
  it('invalidates confirmation when a new reading revision changes the concrete prepared digest', async () => {
    const {host:h}=fixture(); h.seed(mark('mark',{kind:'user',id:'reader'})); await edit(h,update()); h.approve(); h.context.revision++;
    code(await edit(h,update()),'CONFIRMATION_INVALID'); expect(h.count('receipts')).toBe(0);
  });
});


describe('redo branch belongs to the undo executor, not group provenance', () => {
  it.each(['user','ai'] as const)('a new %s edit clears only that executor redo branch after user undoes an AI group', async next => {
    const {host:h}=fixture(); h.seed(mark('a')); h.seed(mark('b')); const aiActor=h.getActor();
    const group=committed(await edit(h,update('a'),'ai-group'));
    h.actor={kind:'user',id:'reader'}; const userActor=h.getActor(); committed(await edit(h,{type:'undo_edit',operationId:group.operationId},'user-undo'));
    h.actor=next === 'user' ? userActor : aiActor;
    committed(await edit(h,update('b',1,'branch edit'),'branch'));
    const target=h.readOperation(h.context,group.operationId);
    expect(target).toMatchObject({actor:aiActor,redoActor:userActor,redoEligible:next === 'ai',state:'undone'});
    h.actor=userActor;
    if(next === 'ai') committed(await edit(h,{type:'redo_edit',operationId:group.operationId},'user-redo'));
    else code(await edit(h,{type:'redo_edit',operationId:group.operationId},'user-redo'),'VERSION_CONFLICT');
    expect(h.readSnapshot(h.context).marks.find(m=>m.id==='a')?.version).toBe(next === 'ai'?4:3);
  });
});

describe('redo authorization preserves user undo intent', () => {
  it('requires confirmation when AI redoes its original group after a user executed its undo', async () => {
    const {host:h}=fixture(); h.seed(mark()); const ai=h.getActor(); const group=committed(await edit(h,update()));
    h.actor={kind:'user',id:'reader'}; committed(await edit(h,{type:'undo_edit',operationId:group.operationId},'user-undo'));
    h.actor=ai; expect((await edit(h,{type:'redo_edit',operationId:group.operationId},'ai-redo')).status).toBe('confirmation_required');
    h.approve(); committed(await edit(h,{type:'redo_edit',operationId:group.operationId},'ai-redo')); expect(h.readSnapshot(h.context).marks[0].version).toBe(4);
  });
});

describe('command-by-command SQLite execution acceptance', () => {
  it.each(['highlight','underline','strikeout','note','line','arrow','ink'] as const)('durably creates %s with trusted defaults', async markType => {
    const {host:h}=fixture(); const free=['line','arrow','ink'].includes(markType);
    const command={...create,markType,...(free?{geometry:{quads:[[0,20,30,20,0,0,30,0]],points:[1,1,20,15]}}:{})}; if(free) delete (command as {anchorId?:string}).anchorId;
    committed(await edit(h,command)); expect(h.readSnapshot(h.context).marks[0]).toMatchObject({type:markType,origin:h.actor,visible:true,retained:false,version:1}); expect(h.count('receipts')).toBe(1);
  });
  it('commits free geometry separately from anchored-note placement and source-anchor replacement', async () => {
    const {host:h}=fixture(); const arrow: EditMark={...mark('arrow'),type:'arrow',anchorId:null,quote:'',quads:[[0,20,30,20,0,0,30,0]],points:[1,1,20,15]}; h.seed(arrow);
    committed(await edit(h,{type:'set_mark_geometry',id:'arrow',expectedVersion:1,geometry:{quads:[[0,30,40,30,0,0,40,0]],points:[2,2,35,25]}},'geometry'));
    expect(h.readSnapshot(h.context).marks[0]).toMatchObject({version:2,points:[2,2,35,25]});
    h.seed({...mark('note'),type:'note'}); committed(await edit(h,{type:'set_mark_placement',id:'note',expectedVersion:1,placement:{dx:2,dy:-3}},'placement'));
    expect(h.readSnapshot(h.context).marks.find(m=>m.id==='note')).toMatchObject({version:2,anchorId:'source',quote:'source text',quads:h.anchors[0].quads,placement:{dx:2,dy:-3}});
    h.anchors.push({...h.anchors[0],id:'next',quote:'next source text',quads:[[10,30,40,35,10,12,40,17]]});
    committed(await edit(h,{type:'replace_mark_anchor',id:'note',expectedVersion:2,anchorId:'next'},'anchor'));
    expect(h.readSnapshot(h.context).marks.find(m=>m.id==='note')).toMatchObject({version:3,anchorId:'next',quote:'next source text',quads:h.anchors[1].quads,placement:{dx:2,dy:-3}});
    expect(h.count('operations')).toBe(3);
  });
  it('commits visibility and retention independently and restores the hidden unfixed state after reopening', async () => {
    const {host:h}=fixture(); h.seed(mark()); committed(await edit(h,{type:'set_marks_visibility',targets:[{id:'mark',expectedVersion:1}],visible:false},'hide'));
    committed(await edit(h,{type:'set_marks_retention',targets:[{id:'mark',expectedVersion:2}],retained:true},'retain'));
    h.actor={kind:'user',id:'reader'}; committed(await edit(h,{type:'set_marks_retention',targets:[{id:'mark',expectedVersion:3}],retained:false},'unretain'));
    const next=open(h.filename); expect(next.readSnapshot(next.context).marks[0]).toMatchObject({version:4,visible:false,retained:false,origin:{kind:'ai',id:'assistant',sessionId:'session'}}); expect(next.count('operations')).toBe(3);
  });
  it('erases a whole visible ink stroke but not hidden ink and retains tombstone versions', async () => {
    const {host:h}=fixture(); const ink: EditMark={...mark('ink'),type:'ink',anchorId:null,quote:'',quads:[[0,20,30,20,0,0,30,0]],points:[1,1,20,15]}; h.seed(ink); h.seed({...ink,id:'hidden',visible:false});
    committed(await edit(h,{type:'erase_ink',pageIndex:0,from:[1,1],to:[20,15],radius:2}));
    expect(h.readSnapshot(h.context)).toMatchObject({marks:[{id:'hidden',visible:false}],versions:{hidden:1,ink:2}}); expect(h.count('operations')).toBe(1);
  });
});

describe('failed new branches preserve redo eligibility', () => {
  it('rolls back redo-branch cleanup when a new edit fails after history writes', async () => {
    const {host:h}=fixture(); h.seed(mark('a')); h.seed(mark('b')); const group=committed(await edit(h,update('a'),'group'));
    committed(await edit(h,{type:'undo_edit',operationId:group.operationId},'undo')); h.failAt='receipt';
    code(await edit(h,update('b'),'new-branch'),'EDIT_FAILED');
    expect(h.readOperation(h.context,group.operationId)).toMatchObject({state:'undone',redoEligible:true,redoActor:h.actor}); expect(h.readSnapshot(h.context).marks.find(m=>m.id==='b')?.version).toBe(1);
    h.failAt=null; committed(await edit(h,{type:'redo_edit',operationId:group.operationId},'redo')); expect(h.count('operations')).toBe(3);
  });
});
