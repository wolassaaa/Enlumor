import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ReadingState, Annotation } from '../src/shared/model';
import { Workspace } from '../src/main/workspace';
it('reading mode persists per document and invalid modes do not overwrite saved reading state',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'enlumor-reading-mode-')),file=path.join(dir,'source.pdf');writeFileSync(file,'source');const w=new Workspace(path.join(dir,'state.sqlite'));
 try{const doc=w.register(file,2);const state={documentId:doc.id,fingerprint:doc.fingerprint,pageIndex:1,offset:.2,zoom:1,rotation:0,layout:'single'} as ReadingState;
 w.saveReading(state);expect(w.reading(doc.id)).toEqual(state);expect(()=>w.saveReading({...state,layout:'wrong'} as unknown as ReadingState)).toThrow(/INVALID_READING_STATE/);expect(w.reading(doc.id)).toEqual(state);
 }finally{w.close();}
});
it('underline uses existing annotation transaction and inverse operations',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'enlumor-underline-unit-')),file=path.join(dir,'source.pdf');writeFileSync(file,'source');const w=new Workspace(path.join(dir,'state.sqlite'));
 try{const doc=w.register(file,1);const a={id:'underline-test',documentId:doc.id,fingerprint:doc.fingerprint,pageIndex:0,type:'underline',author:'user',color:'#335588',quote:'Evidence',note:'',quads:[[10,90,80,90,10,70,80,70]]} as Annotation;
 const result=w.apply({documentId:doc.id,upserts:[a],deletes:[]});expect(w.annotations(doc.id)).toEqual([a]);w.apply(result.inverse);expect(w.annotations(doc.id)).toEqual([]);
 }finally{w.close();}
});
