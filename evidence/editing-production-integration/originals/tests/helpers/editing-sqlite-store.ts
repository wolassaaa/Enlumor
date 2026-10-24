import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { canonicalDigest } from '../../src/shared/editing-planner';
import type { CommandContext } from '../../src/shared/document-commands';
import type { EditActor, EditDelta, EditMark, EditSnapshot, VerifiedAnchor } from '../../src/shared/editing-commands';
import type { ConfirmationBinding, EditConfirmation, EditHost, EditOperation, EditReceipt, EditTransaction, HistoryWrite } from '../../src/main/editing-executor';

/** Test-only host: never imported by production and never opens a personal database. */
export class EditingSqliteStore implements EditHost {
  readonly db: DatabaseSync;
  context: CommandContext = { documentId: 'doc', fingerprint: 'a'.repeat(64), revision: 3 };
  actor: EditActor = { kind: 'ai', id: 'assistant', sessionId: 'session' };
  anchors: VerifiedAnchor[] = [{ id: 'source', documentId: 'doc', fingerprint: 'a'.repeat(64), pageIndex: 0, quote: 'source text', quads: [[0,20,30,25,0,2,30,7]] }];
  allocations = 0;
  confirmation: string | null = null;
  candidate: ConfirmationBinding | null = null;
  failAt: 'deltas' | 'history' | 'receipt' | 'confirmation' | null = null;
  beforeTransaction: (() => void) | null = null;
  beforeReceipt: (() => void) | null = null;
  afterCommit: (() => void) | null = null;
  loseReply = false;
  constructor(readonly filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA busy_timeout=0;
      CREATE TABLE IF NOT EXISTS marks(documentId TEXT, fingerprint TEXT, id TEXT, version INTEGER, value TEXT, PRIMARY KEY(documentId,fingerprint,id));
      CREATE TABLE IF NOT EXISTS tombstones(documentId TEXT, fingerprint TEXT, id TEXT, version INTEGER, PRIMARY KEY(documentId,fingerprint,id));
      CREATE TABLE IF NOT EXISTS operations(operationId TEXT PRIMARY KEY, documentId TEXT, fingerprint TEXT, value TEXT);
      CREATE TABLE IF NOT EXISTS receipts(requestKey TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS confirmations(id TEXT PRIMARY KEY, value TEXT, consumed INTEGER NOT NULL DEFAULT 0);`);
  }
  getContext() { return structuredClone(this.context); }
  getActor() { return structuredClone(this.actor); }
  getPageBounds(): [number, number, number, number][] { return [[-10,-20,100,120]]; }
  async resolveAnchors() { return structuredClone(this.anchors); }
  allocateIds(requestKey: string, count: number) {
    this.allocations++;
    return Array.from({ length: count }, (_, i) => 'mark-' + createHash('sha256').update(`${requestKey}:${i}`).digest('hex'));
  }
  readSnapshot(context: CommandContext): EditSnapshot {
    const rows = this.db.prepare('SELECT value FROM marks WHERE documentId=? AND fingerprint=? ORDER BY id').all(context.documentId, context.fingerprint);
    const marks = rows.map(r => JSON.parse(r.value as string) as EditMark);
    const versions = Object.fromEntries(this.db.prepare('SELECT id,version FROM tombstones WHERE documentId=? AND fingerprint=?').all(context.documentId, context.fingerprint).map(r => [r.id, Number(r.version)]));
    for (const m of marks) versions[m.id] = m.version;
    return { context: structuredClone(context), marks, versions };
  }
  readReceipt(key: string): EditReceipt | null { const row = this.db.prepare('SELECT value FROM receipts WHERE requestKey=?').get(key); return row ? JSON.parse(row.value as string) : null; }
  readOperation(context: CommandContext, id: string): EditOperation | null {
    const row = this.db.prepare('SELECT value FROM operations WHERE operationId=? AND documentId=? AND fingerprint=?').get(id, context.documentId, context.fingerprint);
    return row ? JSON.parse(row.value as string) : null;
  }
  getConfirmation(binding: ConfirmationBinding): string | null | Promise<string | null> { this.candidate = structuredClone(binding); return this.confirmation; }
  approve(binding = this.candidate!, id = 'approval') {
    const value: EditConfirmation = { id, ...structuredClone(binding), consumed: false };
    this.db.prepare('INSERT OR REPLACE INTO confirmations(id,value,consumed) VALUES(?,?,0)').run(id, JSON.stringify(value));
    this.confirmation = id;
    return value;
  }
  private fail(stage: typeof this.failAt) { if (this.failAt === stage) throw Error('injected ' + stage); }
  transaction<T>(body: (tx: EditTransaction) => T): T {
    const hook = this.beforeTransaction; this.beforeTransaction = null; hook?.();
    this.db.exec('BEGIN IMMEDIATE');
    let committed = false;
    try {
      const tx: EditTransaction = {
        readSnapshot: c => this.readSnapshot(c), readReceipt: k => this.readReceipt(k), readOperation: (c,id) => this.readOperation(c,id),
        readConfirmation: id => {
          const r = this.db.prepare('SELECT value,consumed FROM confirmations WHERE id=?').get(id);
          return r ? { ...JSON.parse(r.value as string), consumed: !!r.consumed } : null;
        },
        writeDeltas: (c,d) => this.writeDeltas(c,d),
        writeHistory: w => this.writeHistory(w),
        writeReceipt: r => {
          this.beforeReceipt?.(); this.fail('receipt');
          this.db.prepare('INSERT INTO receipts(requestKey,value) VALUES(?,?)').run(r.requestKey, JSON.stringify(r));
        },
        consumeConfirmation: id => {
          this.fail('confirmation');
          if (this.db.prepare('UPDATE confirmations SET consumed=1 WHERE id=? AND consumed=0').run(id).changes !== 1) throw Error('confirmation unavailable');
        }
      };
      const result = body(tx);
      this.db.exec('COMMIT'); committed = true;
      this.afterCommit?.();
      if (this.loseReply) throw Object.assign(Error('reply lost after COMMIT'), { code: 'COMMIT_UNCERTAIN' });
      return result;
    } catch (e) { if (!committed) this.db.exec('ROLLBACK'); throw e; }
  }
  private writeDeltas(c: CommandContext, deltas: EditDelta[]) {
    for (const d of deltas) {
      this.db.prepare('DELETE FROM marks WHERE documentId=? AND fingerprint=? AND id=?').run(c.documentId,c.fingerprint,d.id);
      if (d.after) this.db.prepare('INSERT INTO marks VALUES(?,?,?,?,?)').run(c.documentId,c.fingerprint,d.id,d.after.version,JSON.stringify(d.after));
      this.db.prepare('INSERT OR REPLACE INTO tombstones VALUES(?,?,?,?)').run(c.documentId,c.fingerprint,d.id,d.expectedVersion+1);
      this.fail('deltas');
    }
  }
  private writeHistory(w: HistoryWrite) {
    if (w.clearRedoFor) {
      const rows = this.db.prepare('SELECT operationId,value FROM operations WHERE documentId=? AND fingerprint=?').all(w.operation.context.documentId,w.operation.context.fingerprint);
      for (const r of rows) {
        const op = JSON.parse(r.value as string) as EditOperation;
        if (op.action === 'edit' && op.state === 'undone' && canonicalDigest(op.redoActor) === canonicalDigest(w.clearRedoFor)) {
          op.redoEligible = false;
          this.db.prepare('UPDATE operations SET value=? WHERE operationId=?').run(JSON.stringify(op),op.operationId);
        }
      }
    }
    if (w.target) this.db.prepare('UPDATE operations SET value=? WHERE operationId=?').run(JSON.stringify(w.target),w.target.operationId);
    const o = w.operation;
    this.db.prepare('INSERT INTO operations VALUES(?,?,?,?)').run(o.operationId,o.context.documentId,o.context.fingerprint,JSON.stringify(o));
    this.fail('history');
  }
  seed(mark: EditMark) { this.db.prepare('INSERT INTO marks VALUES(?,?,?,?,?)').run(mark.documentId,mark.fingerprint,mark.id,mark.version,JSON.stringify(mark)); }
  count(table: 'marks'|'tombstones'|'operations'|'receipts'|'confirmations') { return Number(this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n); }
  close() { this.db.close(); }
}
