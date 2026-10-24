import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EditingSourceService } from '../src/main/editing-sources';
import { openEditingWorkspace } from '../src/main/editing-workspace';
import type { Workspace } from '../src/main/workspace';
import type { Annotation } from '../src/shared/model';
import type { AnchorCandidate } from '../src/shared/editing-bridge';
import type { VerifiedAnchor } from '../src/shared/editing-commands';
import { editingFixture, editingHost } from './helpers/editing-fixtures';
import { runEditingCommand } from '../src/main/editing-executor';
const fixtures: ReturnType<typeof editingFixture>[] = [], workspaces:Workspace[]=[];
const python=resolve('.venv/Scripts/python.exe');
const signal=()=>new AbortController().signal;
function run<T>(request:object,abort?:AbortSignal):Promise<T> {return new Promise((res,rej)=>{
  const child=spawn(python,['python/export_pdf.py'],{windowsHide:true});let out='';child.stdout.on('data',d=>out+=d);child.on('error',rej);child.on('close',()=>{try{const r=JSON.parse(out);if(!r.ok)throw Error(r.error);res(r.value);}catch(e){rej(e);}});abort?.addEventListener('abort',()=>{child.kill();rej(Error('PDF_CANCELED'));},{once:true});child.stdin.end(JSON.stringify(request));
});}
async function fixture(rotation=0,scan=false) {
  const f=editingFixture();fixtures.push(f);
  execFileSync(python,['-c',`import pymupdf as f,sys;d=f.open();p=d.new_page(width=400,height=500);${scan?'':"p.insert_text((60,90),'Repeated sentence');p.insert_text((220,90),'Right column');p.insert_text((60,130),'Repeated sentence');p.insert_text((60,170),'Second line');p.insert_text((140,280),'Diagonal',morph=(f.Point(140,280),f.Matrix(25)));"}p.set_cropbox(f.Rect(20,30,380,470));p.set_rotation(${rotation});d.save(sys.argv[1]);d.close()`,f.source],{windowsHide:true});
  const opened=await openEditingWorkspace(f.file);workspaces.push(opened.workspace); const fp=createHash('sha256').update(readFileSync(f.source)).digest('hex');
  opened.workspace.db.prepare('UPDATE documents SET fingerprint=? WHERE id=?').run(fp,f.doc.id);f.doc.fingerprint=fp;f.context.fingerprint=fp;
  const calls:object[]=[];const runner=async<T>(req:object,s?:AbortSignal)=>{calls.push(req);return run<T>(req,s);};
  return {...f,...opened,calls,service:new EditingSourceService(opened.workspace,opened.edits,runner)};
}
const selected:AnchorCandidate={pageIndex:0,quote:'Repeated sentence',quads:[[60,423,160,423,60,406,160,406]]};
function legacy(f:Awaited<ReturnType<typeof fixture>>,id='old',patch:Partial<Annotation>={}):Annotation {const a:Annotation={id,documentId:f.doc.id,fingerprint:f.doc.fingerprint,author:'user',type:'highlight',pageIndex:0,color:'#123456',note:'original note',quote:selected.quote,quads:selected.quads,...patch};f.workspace.db.prepare('INSERT INTO annotations VALUES(?,?,?)').run(id,f.doc.id,JSON.stringify(a));return a;}
afterEach(()=>{for(const w of workspaces.splice(0))w.close();for(const f of fixtures.splice(0))f.cleanup();});
describe('trusted source and atomic legacy conversion',()=>{
  it.each([0,90,180,270])('locates actual repeated sentence by native position at rotation %i; caches page without reparse',async rotation=>{
    const f=await fixture(rotation);const before=readFileSync(f.source);const a=await f.service.prepareAnchor(f.context,selected,signal());
    expect(a.quote).toBe(selected.quote);expect(a.quads).not.toEqual(selected.quads);expect(a.quads[0][0]).toBeCloseTo(60);
    const second=await f.service.prepareAnchor(f.context,{...selected,quads:[[60,383,160,383,60,366,160,366]]},signal());expect(second.id).not.toBe(a.id);
    const env=await f.service.resolveEnvironment(f.context,signal());expect(env.pageBounds).toEqual([[20,30,380,470]]);expect(env.anchors).toEqual(expect.arrayContaining([a,second]));
    await f.service.preparePage(f.context,0,signal());await f.service.resolveEnvironment(f.context,signal());
    expect(f.calls.filter((r:any)=>r.operation==='editing-document')).toHaveLength(1);expect(f.calls.filter((r:any)=>r.operation==='editing-page')).toHaveLength(1);expect(readFileSync(f.source)).toEqual(before);
  });
  it('orders multiline by source lines, deduplicates overlapping quads, rejects crossed columns, quote mismatch and empty text',async()=>{
    const f=await fixture();const page=await run<any>({operation:'editing-page',source:f.source,fingerprint:f.doc.fingerprint,pageIndex:0});
    const lineQuad=(i:number)=>{const chars=page.lines[i].chars;const first=chars[0].quad,last=chars.at(-1).quad;return [first[0],first[1],last[2],last[3],first[4],first[5],last[6],last[7]];};
    const candidate={pageIndex:0,quote:'Repeated sentence\nSecond line',quads:[lineQuad(2),lineQuad(3),lineQuad(2)]};
    const a=await f.service.prepareAnchor(f.context,candidate,signal());expect(a.quote).toBe(candidate.quote);
    const diagonal=await f.service.prepareAnchor(f.context,{pageIndex:0,quote:'Diagonal',quads:[lineQuad(4)]},signal());expect(diagonal.quads[0][1]).not.toBe(diagonal.quads[0][3]);
    for(const c of [{...selected,quote:'wrong'}, {...selected,quads:[[220,423,300,423,220,406,300,406]]},{...selected,quads:[[60,423,300,423,60,406,300,406]],quote:'Repeated sentenceRight column'}])await expect(f.service.prepareAnchor(f.context,c,signal())).rejects.toThrow('ANCHOR_NOT_FOUND');
    const scan=await fixture(0,true);await expect(scan.service.prepareAnchor(scan.context,selected,signal())).rejects.toThrow('ANCHOR_NOT_FOUND');
  });
  it('rejects malformed/overlimit candidates explicitly without parsing',async()=>{
    const f=await fixture();for(const c of [{...selected,quote:'x'.repeat(100001)},{...selected,quads:Array(10001).fill(selected.quads[0])}])await expect(f.service.prepareAnchor(f.context,c,signal())).rejects.toThrow('EDIT_TOO_LARGE');
    await expect(f.service.prepareAnchor(f.context,{...selected,quads:[[1,2,3]]},signal())).rejects.toThrow('ANCHOR_NOT_FOUND');expect(f.calls).toEqual([]);
  });
  it('converts verified legacy preserving content, keeps failed text and unknown JSON readonly, and never resurrects deleted mark',async()=>{
    const f=await fixture();const original=legacy(f);legacy(f,'bad',{quote:'not source'});legacy(f,'free',{type:'note',quote:'',quads:[[30,60,50,60,30,40,50,40]]});
    f.workspace.db.prepare('INSERT INTO annotations VALUES(?,?,?)').run('corrupt',f.doc.id,'{broken');const originalRows=f.workspace.db.prepare('SELECT * FROM annotations').all();
    await f.service.convertLegacyPage(f.context,0,signal());const view=f.edits.view(f.context,f.edits.actor);expect(view.marks).toHaveLength(2);expect(view.legacy.map(x=>x.legacyId)).toEqual(['bad']);expect(view.diagnostics).toContainEqual({legacyId:'corrupt',reason:'INVALID_LEGACY_PAYLOAD'});
    expect(view.marks.find(x=>x.id==='old')).toMatchObject({quote:original.quote,quads:original.quads,color:original.color,note:original.note,origin:f.edits.actor,retained:true,visible:true,version:1,placement:{dx:0,dy:0}});
    expect(f.workspace.db.prepare('SELECT * FROM annotations').all()).toEqual(originalRows);expect(view.history).toEqual({undoIds:[],redoIds:[]});
    const env=await f.service.resolveEnvironment(f.context,signal());const h=editingHost(f.edits,f.context);h.getPageBounds=()=>env.pageBounds;h.resolveAnchors=async()=>env.anchors;
    expect(await runEditingCommand({context:f.context,requestId:'delete',command:{type:'delete_marks',targets:[{id:'old',expectedVersion:1}]}},h,signal())).toMatchObject({status:'committed'});
    f.workspace.close();const reopened=await openEditingWorkspace(f.file);workspaces.push(reopened.workspace);const svc=new EditingSourceService(reopened.workspace,reopened.edits,run);await svc.convertLegacyPage(f.context,0,signal());expect(reopened.edits.readSnapshot(f.context).marks.some(x=>x.id==='old')).toBe(false);expect(reopened.edits.readSnapshot(f.context).versions.old).toBe(2);expect(reopened.edits.view(f.context,reopened.edits.actor).hasEditingState).toBe(true);
  });
  it('reanchor rejects stale preview digest and atomically records independent compatibility audit',async()=>{
    const f=await fixture();legacy(f,'bad',{quote:'obsolete text'});const a=await f.service.prepareAnchor(f.context,selected,signal());const old=f.edits.legacy(f.doc.id)[0];
    f.workspace.db.prepare("UPDATE annotations SET payload=replace(payload,'obsolete','changed') WHERE id='bad'").run();await expect(f.service.reanchorLegacy(f.context,'bad',a.id,old.inputDigest,signal())).rejects.toThrow('LEGACY_CHANGED');expect(f.edits.readSnapshot(f.context).marks).toEqual([]);
    const current=f.edits.legacy(f.doc.id)[0];await f.service.reanchorLegacy(f.context,'bad',a.id,current.inputDigest,signal());expect(f.edits.readSnapshot(f.context).marks[0]).toMatchObject({id:'bad',quote:selected.quote,anchorId:a.id});
    const audit=JSON.parse(String(f.workspace.db.prepare("SELECT auditPayload FROM edit_legacy_imports WHERE legacyId='bad'").get()!.auditPayload));expect(audit).toMatchObject({actor:f.edits.actor,before:{quote:'changed text'},after:a});expect(typeof audit.at).toBe('number');expect(f.edits.history(f.context,f.edits.actor)).toEqual({undoIds:[],redoIds:[]});
  });
  it('cancel during parsing commits no mark/import; changed/missing source invalidates cached environment and leaves old rows',async()=>{
    const f=await fixture();const original=legacy(f);const c=new AbortController();const delayed=async<T>(req:object,s?:AbortSignal)=>{const value=await run<T>(req,s);if((req as any).operation==='editing-page')c.abort();return value;};const svc=new EditingSourceService(f.workspace,f.edits,delayed);
    await expect(svc.convertLegacyPage(f.context,0,c.signal)).rejects.toThrow('PDF_CANCELED');expect(f.edits.readSnapshot(f.context).marks).toEqual([]);expect(f.workspace.db.prepare('SELECT * FROM edit_legacy_imports').all()).toEqual([]);expect(f.workspace.annotations(f.doc.id)).toEqual([original]);
    await f.service.resolveEnvironment(f.context,signal());writeFileSync(f.source,Buffer.concat([readFileSync(f.source),Buffer.from('\n% replaced')]));await expect(f.service.resolveEnvironment(f.context,signal())).rejects.toThrow('SOURCE_CHANGED');expect(f.workspace.annotations(f.doc.id)).toEqual([original]);unlinkSync(f.source);await expect(f.service.preparePage(f.context,0,signal())).rejects.toThrow('SOURCE_MISSING');
  });
  it('normalizes only NFKC/Unicode whitespace for comparison while preserving exact requested quote',async()=>{
    const f=await fixture();const quote='Ｒｅｐｅａｔｅｄ\u0085ｓｅｎｔｅｎｃｅ';const a=await f.service.prepareAnchor(f.context,{...selected,quote},signal());expect(a.quote).toBe(quote);
    await expect(f.service.prepareAnchor(f.context,{...selected,quote:'repeated sentence'},signal())).rejects.toThrow('ANCHOR_NOT_FOUND');
  });
  it('converts all text/path/note types with exact old geometry and stable user without parsing free-only scanned pages',async()=>{
    const f=await fixture();for(const type of ['highlight','underline','strikeout','note'] as const)legacy(f,type,{type});
    for(const type of ['line','arrow','ink'] as const)legacy(f,type,{type,quote:'',quads:[[30,60,90,60,30,40,90,40]],points:type==='ink'?[35,45,50,55,85,45]:[35,45,85,55]});
    await f.service.convertLegacyPage(f.context,0,signal());expect(f.edits.readSnapshot(f.context).marks).toHaveLength(7);expect(f.edits.legacy(f.doc.id)).toEqual([]);
    const scan=await fixture(0,true);legacy(scan,'free-note',{type:'note',quote:'',quads:[[30,60,50,60,30,40,50,40]]});await scan.service.convertLegacyPage(scan.context,0,signal());expect(scan.edits.readSnapshot(scan.context).marks).toHaveLength(1);expect(scan.calls.filter((r:any)=>r.operation==='editing-page')).toEqual([]);
  });
  it('import mapping failure rolls back prepared source anchor, mark and version together',async()=>{
    const f=await fixture();const old=legacy(f);f.workspace.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON edit_legacy_imports BEGIN SELECT RAISE(ABORT,'import fixture'); END");
    await expect(f.service.convertLegacyPage(f.context,0,signal())).rejects.toThrow('import fixture');
    for(const t of ['edit_marks','edit_versions','edit_anchors','edit_legacy_imports'])expect(f.workspace.db.prepare(`SELECT * FROM ${t}`).all()).toEqual([]);expect(f.workspace.annotations(f.doc.id)).toEqual([old]);
  });
  it('legacy content changed during real page parse rejects conversion without committing prepared data',async()=>{
    const f=await fixture();legacy(f);const runner=async<T>(r:object,s?:AbortSignal)=>{const result=await run<T>(r,s);if((r as any).operation==='editing-page')f.workspace.db.prepare("UPDATE annotations SET payload=replace(payload,'original note','new note')").run();return result;};
    const svc=new EditingSourceService(f.workspace,f.edits,runner);await expect(svc.convertLegacyPage(f.context,0,signal())).rejects.toThrow('LEGACY_CHANGED');expect(f.edits.readSnapshot(f.context).marks).toEqual([]);expect(f.edits.anchors(f.context)).toEqual([]);expect(f.workspace.annotations(f.doc.id)[0].note).toBe('new note');
  });
  it('malformed convex geometry is diagnosed, and out-of-page legacy geometry stays readonly without fake anchor',async()=>{
    const f=await fixture();legacy(f,'bad-convex',{quads:[[60,423,160,423,160,406,60,406]]});legacy(f,'outside',{type:'note',quote:'',quads:[[0,20,10,20,0,0,10,0]]});await f.service.convertLegacyPage(f.context,0,signal());
    const view=f.edits.view(f.context,f.edits.actor);expect(view.diagnostics).toContainEqual({legacyId:'bad-convex',reason:'INVALID_LEGACY_PAYLOAD'});expect(view.legacy.map(x=>x.legacyId)).toEqual(['outside']);expect(view.marks).toEqual([]);expect(f.edits.anchors(f.context)).toEqual([]);
  });
  it('200-page environment uses metadata once and never extracts book text for ordinary edits',async()=>{
    const f=await fixture();const source=join(f.dir,'200.pdf');execFileSync(python,['-c',"import pymupdf as f,sys;d=f.open();[d.new_page(width=400,height=500) for _ in range(200)];d.save(sys.argv[1]);d.close()",source],{windowsHide:true});
    const fp=createHash('sha256').update(readFileSync(source)).digest('hex');f.workspace.db.prepare('UPDATE documents SET path=?,fingerprint=?,pageCount=200 WHERE id=?').run(source,fp,f.doc.id);const context={...f.context,fingerprint:fp};
    const env=await f.service.resolveEnvironment(context,signal());expect(env.pageBounds).toHaveLength(200);await f.service.resolveEnvironment(context,signal());expect(f.calls).toHaveLength(1);expect(f.calls[0]).toMatchObject({operation:'editing-document'});
  });
  it('retains native tall glyph vertices when one source line has mixed font heights',async()=>{
    const f=await fixture();const source=join(f.dir,'mixed.pdf');execFileSync(python,['-c',"import pymupdf as f,sys;d=f.open();p=d.new_page(width=400,height=500);p.insert_text((60,210),'a',fontsize=11);p.insert_text((66.116,210),'B',fontsize=20);p.insert_text((79.456,210),'c',fontsize=11);d.save(sys.argv[1]);d.close()",source],{windowsHide:true});
    const fp=createHash('sha256').update(readFileSync(source)).digest('hex');f.workspace.db.prepare('UPDATE documents SET path=?,fingerprint=? WHERE id=?').run(source,fp,f.doc.id);const context={...f.context,fingerprint:fp};
    const page=await run<any>({operation:'editing-page',source,fingerprint:fp,pageIndex:0});expect(page.lines).toHaveLength(1);const chars=page.lines[0].chars;const quote=chars.map((c:any)=>c.text).join('');expect(quote).toBe('aBc');
    const anchor=await f.service.prepareAnchor(context,{pageIndex:0,quote,quads:[[55,315,90,315,55,280,90,280]]},signal());const top=Math.max(...chars.map((c:any)=>c.quad[1]));expect(Math.max(...anchor.quads.map(q=>q[1]))).toBeCloseTo(top);
  });
});
