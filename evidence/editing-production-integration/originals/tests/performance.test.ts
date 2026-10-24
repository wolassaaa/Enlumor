import { it, expect, vi } from 'vitest';
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Workspace } from '../src/main/workspace';

it('reading-position autosave does not re-read an unchanged PDF after full verification', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'enlumor-perf-'));
  const source = path.join(folder, 'large.pdf'); writeFileSync(source, Buffer.alloc(8 * 1024 * 1024, 65));
  const workspace = new Workspace(path.join(folder, 'state.sqlite'));
  try {
    const doc = workspace.register(source, 200); workspace.verified(doc.id);
    vi.mocked(readFileSync).mockClear();
    for (let i = 0; i < 20; i++) workspace.saveReading({ documentId: doc.id, fingerprint: doc.fingerprint, pageIndex: i, offset: .2, zoom: 1, rotation: 0 });
    expect(workspace.reading(doc.id)?.pageIndex).toBe(19);
    expect(vi.mocked(readFileSync).mock.calls.filter(call => call[0] === source)).toHaveLength(0);
    writeFileSync(source, 'changed');
    expect(() => workspace.saveReading({ documentId: doc.id, fingerprint: doc.fingerprint, pageIndex: 0, offset: 0, zoom: 1, rotation: 0 })).toThrow(/SOURCE_CHANGED/);
  } finally { workspace.close(); rmSync(folder, { recursive: true, force: true }); }
});

it('annotation commits still verify complete PDF bytes even when metadata was cached', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'enlumor-perf-'));
  const source = path.join(folder, 'source.pdf'); writeFileSync(source, 'original');
  const workspace = new Workspace(path.join(folder, 'state.sqlite'));
  try {
    const doc = workspace.register(source, 1); workspace.verified(doc.id);
    vi.mocked(readFileSync).mockClear();
    workspace.apply({ documentId: doc.id, upserts: [], deletes: [] });
    expect(vi.mocked(readFileSync).mock.calls.filter(call => call[0] === source)).toHaveLength(1);
  } finally { workspace.close(); rmSync(folder, { recursive: true, force: true }); }
});
