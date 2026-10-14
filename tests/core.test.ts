import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Workspace } from '../src/main/workspace';
import { screenRectToQuad, quadToScreen, validateAnnotation } from '../src/shared/geometry';

const q = [10, 90, 80, 90, 10, 70, 80, 70] as const;
const mark = (documentId: string, fingerprint: string, id = 'mark-1') => ({ id, documentId, fingerprint, type: 'highlight' as const, pageIndex: 0, quote: 'Evidence', quads: [[...q]], color: '#f4cf58', note: '', author: 'user' as const });

describe('canonical PDF geometry', () => {
  it.each([
    { matrix: [1, 0, 0, -1, 0, 100], rect: [10, 10, 80, 30] },
    { matrix: [0, 1, 1, 0, 0, 0], rect: [70, 10, 90, 80] },
    { matrix: [-1, 0, 0, 1, 100, 0], rect: [20, 70, 90, 90] },
    { matrix: [0, -1, -1, 0, 100, 100], rect: [10, 20, 30, 90] },
    { matrix: [2, 0, 0, -2, -40, 240], rect: [-20, 60, 120, 100] },
  ])('converts rotated/cropped view without persisting screen pixels: $matrix', ({ matrix, rect }) => {
    expect(screenRectToQuad(rect as [number, number, number, number], matrix)).toEqual([...q]);
    expect(quadToScreen([...q], matrix)).toEqual(rect);
  });
  it('rejects malformed coordinates and unsupported annotation types', () => {
    expect(() => validateAnnotation({ ...mark('d', 'f'), quads: [[NaN, 0]] }, 1)).toThrow();
    expect(() => validateAnnotation({ ...mark('d', 'f'), pageIndex: 1 }, 1)).toThrow();
    expect(() => validateAnnotation({ ...mark('d', 'f'), type: 'script' }, 1)).toThrow();
    expect(() => validateAnnotation({ ...mark('d', 'f'), color: 'url(x)' }, 1)).toThrow();
  });
});

describe('durable workspace', () => {
  const setup = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'enlumor-'));
    const file = path.join(dir, '中文 source.pdf'); writeFileSync(file, 'pdf-v1');
    const db = new Workspace(path.join(dir, 'workspace.sqlite'));
    const doc = db.register(file, 2);
    return { dir, file, db, doc, clean: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
  };
  it('deduplicates opens and restores committed annotations after restart', () => {
    const s = setup(); try {
      expect(s.db.register(s.file, 2).id).toBe(s.doc.id);
      s.db.apply({ documentId: s.doc.id, upserts: [mark(s.doc.id, s.doc.fingerprint)], deletes: [] });
      s.db.saveReading({ documentId: s.doc.id, fingerprint: s.doc.fingerprint, pageIndex: 1, offset: .25, zoom: 1.5, rotation: 90 });
      s.db.close();
      const reopened = new Workspace(path.join(s.dir, 'workspace.sqlite'));
      try { expect(reopened.annotations(s.doc.id)).toHaveLength(1); expect(reopened.reading(s.doc.id)?.pageIndex).toBe(1); } finally { reopened.close(); }
    } finally { s.clean(); }
  });
  it('rejects a whole cross-page operation if one annotation is invalid', () => {
    const s = setup(); try {
      const first = mark(s.doc.id, s.doc.fingerprint);
      expect(() => s.db.apply({ documentId: s.doc.id, upserts: [first, { ...first, id: 'bad', pageIndex: 100 }], deletes: [] })).toThrow();
      expect(s.db.annotations(s.doc.id)).toEqual([]);
    } finally { s.clean(); }
  });
  it('blocks stale source on read, edit and reading-state save, then rebinds identical bytes', () => {
    const s = setup(); try {
      writeFileSync(s.file, 'pdf-v2');
      expect(() => s.db.verified(s.doc.id)).toThrow(/SOURCE_CHANGED/);
      expect(() => s.db.apply({ documentId: s.doc.id, upserts: [mark(s.doc.id, s.doc.fingerprint)], deletes: [] })).toThrow();
      expect(() => s.db.saveReading({ documentId: s.doc.id, fingerprint: s.doc.fingerprint, pageIndex: 0, offset: 0, zoom: 1, rotation: 0 })).toThrow();
      const moved = path.join(s.dir, 'moved.pdf'); writeFileSync(moved, 'pdf-v1');
      expect(s.db.rebind(s.doc.id, moved).id).toBe(s.doc.id);
      expect(s.db.verified(s.doc.id).path).toBe(moved);
    } finally { s.clean(); }
  });
  it('does not acknowledge a failed database write or partially mutate marks', () => {
    const s = setup(); try {
      s.db.db.exec('PRAGMA query_only=ON');
      expect(() => s.db.apply({ documentId: s.doc.id, upserts: [mark(s.doc.id, s.doc.fingerprint)], deletes: [] })).toThrow();
      expect(s.db.annotations(s.doc.id)).toEqual([]);
    } finally { s.clean(); }
  });
  it('returns inverse changes for committed undo/redo, including deletes', () => {
    const s = setup(); try {
      const result = s.db.apply({ documentId: s.doc.id, upserts: [mark(s.doc.id, s.doc.fingerprint)], deletes: [] });
      const undo = s.db.apply(result.inverse);
      expect(s.db.annotations(s.doc.id)).toEqual([]);
      s.db.apply(undo.inverse);
      expect(s.db.annotations(s.doc.id)[0].quote).toBe('Evidence');
    } finally { s.clean(); }
  });
});
