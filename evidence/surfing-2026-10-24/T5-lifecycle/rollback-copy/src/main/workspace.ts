import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync, copyFileSync, statSync, constants } from 'node:fs';
import path from 'node:path';
import type { Annotation, AnnotationChange, CommitResult, DocumentInfo, ReadingState, LayoutPreferences, TabSession } from '../shared/model';
import { validateAnnotation } from '../shared/geometry';

export function fingerprint(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
export class Workspace {
  readonly db: DatabaseSync;
  private closed = false;
  private readingChecks = new Map<string, { path: string; stamp: string }>();
  private sourceStamp(file: string): string {
    try {
      const stat = statSync(file, { bigint: true });
      return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    } catch { throw new Error('SOURCE_MISSING: 原文件已移动，请重新关联'); }
  }
  constructor(file: string, options?: { allowEditingSchema?: boolean }) {
    this.db = new DatabaseSync(file);
    try {
    const version = Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
    if (version > (options?.allowEditingSchema === true ? 5 : 4)) { this.close(); throw new Error('DATABASE_VERSION: 数据来自更新版本的 Enlumor'); }
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000');
    if (version === 0) {
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      if (tables.length) { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); copyFileSync(file, `${file}.pre-v1.bak`); }
      this.db.exec(`BEGIN; CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE, pageCount INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id), payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reading (documentId TEXT PRIMARY KEY REFERENCES documents(id), payload TEXT NOT NULL);
        PRAGMA user_version=1; COMMIT;`);
    }
    if (version < 2) {
      try {
        if (version === 1) {
          const checkpoint = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
          if (Number(checkpoint?.busy)) throw new Error('BACKUP_BUSY: 请关闭其他 Enlumor 窗口后重试升级');
          const backup = existsSync(`${file}.pre-v2.bak`) ? `${file}.pre-v2.${Date.now()}.bak` : `${file}.pre-v2.bak`;
          copyFileSync(file, backup, constants.COPYFILE_EXCL);
        }
        this.db.exec('BEGIN IMMEDIATE; CREATE TABLE preferences(key TEXT PRIMARY KEY,payload TEXT NOT NULL); PRAGMA user_version=2; COMMIT;');
      } catch (error) { this.db.close(); this.closed = true; throw error; }
    }
    if (version < 3) {
      try {
        if (version > 0) {
          const checkpoint=this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
          if(Number(checkpoint?.busy))throw new Error('BACKUP_BUSY: 请关闭其他 Enlumor 窗口后重试升级');
          const backup=existsSync(`${file}.pre-v3.bak`)?`${file}.pre-v3.${Date.now()}.bak`:`${file}.pre-v3.bak`;
          copyFileSync(file,backup,constants.COPYFILE_EXCL);
        }
        this.db.exec('BEGIN IMMEDIATE; CREATE TABLE ai_profiles(id TEXT PRIMARY KEY,payload TEXT NOT NULL,secret BLOB); PRAGMA user_version=3; COMMIT;');
      }catch(error){this.db.close();this.closed=true;throw error;}
    }
    if(version<4){
      try{
        if(version>0){const checkpoint=this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(Number(checkpoint?.busy))throw Error('BACKUP_BUSY: 请关闭其他 Enlumor 窗口后重试升级');const backup=existsSync(`${file}.pre-v4.bak`)?`${file}.pre-v4.${Date.now()}.bak`:`${file}.pre-v4.bak`;copyFileSync(file,backup,constants.COPYFILE_EXCL);}
        this.db.exec('BEGIN IMMEDIATE; CREATE TABLE cruise_sessions(documentId TEXT PRIMARY KEY REFERENCES documents(id),payload TEXT NOT NULL); PRAGMA user_version=4; COMMIT;');
      }catch(error){this.db.close();this.closed=true;throw error;}
    }
    } catch (error) { this.close(); throw error; }
  }

  layout(): LayoutPreferences {
    const row = this.db.prepare("SELECT payload FROM preferences WHERE key='layout'").get();
    return row ? JSON.parse(row.payload as string) : { left: 208, right: 282, spacing: 16 };
  }
  saveLayout(layout: LayoutPreferences) {
    if (!layout || !Number.isFinite(layout.left) || layout.left < 176 || layout.left > 420 || !Number.isFinite(layout.right) || layout.right < 220 || layout.right > 460 || ![12,16,24].includes(layout.spacing)) throw new Error('INVALID_LAYOUT');
    this.preference('layout', { left: layout.left, right: layout.right, spacing: layout.spacing });
  }
  tabs(): TabSession | null {
    const row = this.db.prepare("SELECT payload FROM preferences WHERE key='tabs'").get();
    return row ? JSON.parse(row.payload as string) : null;
  }
  saveTabs(session: TabSession) {
    if (!session || !Array.isArray(session.openIds) || session.openIds.length > 100 || new Set(session.openIds).size !== session.openIds.length || (session.activeId !== null && !session.openIds.includes(session.activeId))) throw new Error('INVALID_TABS');
    for (const id of session.openIds) this.document(id);
    this.preference('tabs', { openIds: session.openIds, activeId: session.activeId });
  }
  private preference(key: string, value: unknown) {
    this.db.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').run(key,JSON.stringify(value));
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
  list(): DocumentInfo[] { return this.db.prepare('SELECT * FROM documents ORDER BY updatedAt DESC').all() as DocumentInfo[]; }
  document(id: string): DocumentInfo {
    if (typeof id !== 'string' || id.length > 100) throw new Error('INVALID_ID');
    const doc = this.db.prepare('SELECT * FROM documents WHERE id=?').get(id) as DocumentInfo | undefined;
    if (!doc) throw new Error('DOCUMENT_NOT_FOUND: 找不到工作区文档');
    return doc;
  }
  verified(id: string): DocumentInfo {
    const doc = this.document(id);
    if (!existsSync(doc.path)) throw new Error('SOURCE_MISSING: 原文件已移动，请重新关联');
    const before = this.sourceStamp(doc.path);
    if (fingerprint(doc.path) !== doc.fingerprint) throw new Error('SOURCE_CHANGED: 文件内容已改变，旧批注未应用；请打开新版本或重新关联原文件');
    if (before !== this.sourceStamp(doc.path)) throw new Error('SOURCE_CHANGED: 校验期间原文件发生变化，请重新打开');
    this.readingChecks.set(id, { path: doc.path, stamp: before });
    return doc;
  }
  register(file: string, pageCount: number): DocumentInfo {
    if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('INVALID_PDF');
    const hash = fingerprint(file);
    const old = this.db.prepare('SELECT * FROM documents WHERE fingerprint=?').get(hash) as DocumentInfo | undefined;
    if (old) return this.rebind(old.id, file);
    const doc: DocumentInfo = { id: randomUUID(), path: path.resolve(file), name: path.basename(file), fingerprint: hash, pageCount, updatedAt: Date.now() };
    this.db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?)').run(doc.id, doc.path, doc.name, hash, pageCount, doc.updatedAt);
    return doc;
  }
  rebind(id: string, file: string): DocumentInfo {
    const doc = this.document(id);
    if (fingerprint(file) !== doc.fingerprint) throw new Error('SOURCE_CHANGED: 请选择与原文档内容相同的 PDF');
    this.db.prepare('UPDATE documents SET path=?, name=?, updatedAt=? WHERE id=?').run(path.resolve(file), path.basename(file), Date.now(), id);
    return this.document(id);
  }
  annotations(id: string): Annotation[] { this.document(id); return this.db.prepare('SELECT payload FROM annotations WHERE documentId=? ORDER BY rowid').all(id).map(row => JSON.parse(row.payload as string)); }
  reading(id: string): ReadingState | null { this.document(id); const row = this.db.prepare('SELECT payload FROM reading WHERE documentId=?').get(id); return row ? JSON.parse(row.payload as string) : null; }
  saveReading(state: ReadingState) {
    let doc = this.document(state.documentId);
    const previous = this.readingChecks.get(doc.id);
    // Only position autosave uses metadata. Annotation/export/open paths still hash full bytes.
    if (!previous || previous.path !== doc.path || previous.stamp !== this.sourceStamp(doc.path)) doc = this.verified(doc.id);
    if (state.fingerprint !== doc.fingerprint || !Number.isInteger(state.pageIndex) || state.pageIndex < 0 || state.pageIndex >= doc.pageCount ||
        !Number.isFinite(state.offset) || state.offset < 0 || state.offset > 1 || !Number.isFinite(state.zoom) || state.zoom < .25 || state.zoom > 4 || ![0, 90, 180, 270].includes(state.rotation) || (state.layout !== undefined && !['continuous','single'].includes(state.layout))) throw new Error('INVALID_READING_STATE');
    this.db.prepare('INSERT INTO reading VALUES (?,?) ON CONFLICT(documentId) DO UPDATE SET payload=excluded.payload').run(state.documentId, JSON.stringify(state));
  }
  apply(change: AnnotationChange): CommitResult {
    if (Number(this.db.prepare('PRAGMA user_version').get()!.user_version) >= 5) throw new Error('LEGACY_READ_ONLY');
    if (!change || !Array.isArray(change.upserts) || !Array.isArray(change.deletes) || change.upserts.length + change.deletes.length > 10000) throw new Error('INVALID_CHANGE');
    const doc = this.verified(change.documentId);
    const seen = new Set<string>();
    for (const a of change.upserts) {
      validateAnnotation(a, doc.pageCount);
      if (a.documentId !== doc.id || a.fingerprint !== doc.fingerprint || seen.has(a.id)) throw new Error('INVALID_CHANGE');
      seen.add(a.id);
    }
    for (const id of change.deletes) { if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id) || seen.has(id)) throw new Error('INVALID_CHANGE'); seen.add(id); }
    const inverse: AnnotationChange = { documentId: doc.id, upserts: [], deletes: [] };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of seen) {
        const row = this.db.prepare('SELECT documentId,payload FROM annotations WHERE id=?').get(id);
        if (row && row.documentId !== doc.id) throw new Error('INVALID_CHANGE: 批注属于其他文档');
        if (row) inverse.upserts.push(JSON.parse(row.payload as string)); else inverse.deletes.push(id);
      }
      for (const a of change.upserts) this.db.prepare('INSERT INTO annotations VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(a.id, doc.id, JSON.stringify(a));
      for (const id of change.deletes) this.db.prepare('DELETE FROM annotations WHERE id=? AND documentId=?').run(id, doc.id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { annotations: this.annotations(doc.id), inverse };
  }
}
