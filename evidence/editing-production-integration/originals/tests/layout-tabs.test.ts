import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { LayoutPreferences } from '../src/shared/model';
import { Workspace } from '../src/main/workspace';
const setup=()=>{const dir=mkdtempSync(path.resolve('.cache/layout-test-'));return {dir,file:path.join(dir,'state.sqlite')};};
it('layout preferences persist in SQLite and reject malformed values without changing saved state',()=>{
 const {file}=setup();const w=new Workspace(file);
 try{const layout={left:280,right:310,spacing:24 as const};w.saveLayout(layout);expect(w.layout()).toEqual(layout);
 for(const bad of [{...layout,left:NaN},{...layout,right:9999},{...layout,spacing:8}]) expect(()=>w.saveLayout(bad as LayoutPreferences)).toThrow(/INVALID_LAYOUT/);
 expect(w.layout()).toEqual(layout);w.close();const restored=new Workspace(file);expect(restored.layout()).toEqual(layout);restored.close();}finally{w.close();}
});
it('v1 migration creates a verified backup and preserves documents, annotations and reading state',()=>{
 const {dir,file}=setup();const old=new DatabaseSync(file);
 old.exec("CREATE TABLE documents(id TEXT PRIMARY KEY,path TEXT,name TEXT,fingerprint TEXT,pageCount INTEGER,updatedAt INTEGER); CREATE TABLE annotations(id TEXT PRIMARY KEY,documentId TEXT,payload TEXT); CREATE TABLE reading(documentId TEXT PRIMARY KEY,payload TEXT); PRAGMA user_version=1;");
 old.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)').run('kept','source.pdf','source.pdf','fingerprint',3,1);old.prepare('INSERT INTO annotations VALUES(?,?,?)').run('a','kept','{"id":"a"}');old.prepare('INSERT INTO reading VALUES(?,?)').run('kept','{"pageIndex":2}');old.close();
 const w=new Workspace(file);try{expect(w.list()[0].id).toBe('kept');expect(w.annotations('kept')).toEqual([{id:'a'}]);expect(w.reading('kept')?.pageIndex).toBe(2);expect(existsSync(file+'.pre-v2.bak')).toBe(true);
 const backup=new DatabaseSync(file+'.pre-v2.bak');expect(backup.prepare('PRAGMA user_version').get()?.user_version).toBe(1);expect(backup.prepare('SELECT COUNT(*) n FROM annotations').get()?.n).toBe(1);backup.close();expect(w.db.prepare('PRAGMA user_version').get()?.user_version).toBe(4);}finally{w.close();}
});
it('tab session persists only registered unique IDs with a valid active member',()=>{
 const {dir,file}=setup();const source=path.join(dir,'source.pdf');writeFileSync(source,'one');const w=new Workspace(file);
 try{const doc=w.register(source,1);const state={openIds:[doc.id],activeId:doc.id};w.saveTabs(state);expect(w.tabs()).toEqual(state);
 for(const bad of [{openIds:[doc.id,doc.id],activeId:doc.id},{openIds:['missing'],activeId:'missing'},{openIds:[],activeId:doc.id}]) expect(()=>w.saveTabs(bad)).toThrow();
 expect(w.tabs()).toEqual(state);w.saveTabs({openIds:[],activeId:null});expect(w.tabs()).toEqual({openIds:[],activeId:null});}finally{w.close();}
});
