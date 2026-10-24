import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Workspace } from '../../src/main/workspace';
import type { EditHost } from '../../src/main/editing-executor';
import { deriveEditingIds } from '../../src/main/editing-executor';
import type { WorkspaceEdits } from '../../src/main/editing-workspace';
import type { CommandContext } from '../../src/shared/document-commands';
export function editingFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'enlumor-production-'));
  const source = join(dir, '中文 source.pdf'); writeFileSync(source, '%PDF synthetic fixture bytes');
  const file = join(dir, 'workspace.sqlite'); const w = new Workspace(file); const doc = w.register(source, 1);
  w.saveLayout({ left: 208, right: 282, spacing: 16 });
  w.db.prepare('INSERT INTO ai_profiles VALUES(?,?,?)').run('untouched', '{"provider":"fixture"}', Buffer.from('synthetic secret'));
  w.close();
  return { dir, source, file, doc, context: { documentId: doc.id, fingerprint: doc.fingerprint, revision: 1 } as CommandContext,
    cleanup: () => {if(dirname(resolve(dir))!==resolve(tmpdir())||!basename(dir).startsWith('enlumor-production-'))throw Error('unexpected fixture cleanup path');rmSync(dir, { recursive: true, force: true });} };
}
export function editingHost(edits: WorkspaceEdits, context: CommandContext): EditHost {
  return { getContext: () => context, getActor: () => edits.actor, getPageBounds: () => [[0,0,400,500]], resolveAnchors: async () => [],
    allocateIds: deriveEditingIds, readSnapshot: c => edits.readSnapshot(c), readReceipt: k => edits.readReceipt(k),
    readOperation: (c,id) => edits.readOperation(c,id), getConfirmation: () => null, transaction: b => edits.transaction(b) };
}
export const freeNote = { type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: 'saved', geometry: { quads: [[10,30,30,30,10,10,30,10]] } } as const;
