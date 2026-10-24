import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prepareEdit, canonicalDigest } from '../src/shared/editing-planner';
import type { EditEnvironment, EditMark, EditSnapshot, PreparedEdit } from '../src/shared/editing-commands';
import {copyEditData} from '../src/shared/editing-marks';

const context = { documentId: 'doc', fingerprint: 'a'.repeat(64), revision: 3 };
const quad = [-8, 20, 30, 20, -8, 2, 30, 2];
const geometry = () => ({ quads: [[...quad]], points: [-5, 5, 20, 15] });
function env(): EditEnvironment {
  return { actor: { kind: 'ai', id: 'assistant', sessionId: 'session' }, pageBounds: [[-10, -20, 100, 120], [-10, -20, 100, 120]], anchors: [
    { id: 'source', documentId: 'doc', fingerprint: context.fingerprint, pageIndex: 0, quote: '真实原文', quads: [[...quad]] },
    { id: 'next', documentId: 'doc', fingerprint: context.fingerprint, pageIndex: 1, quote: '第二页', quads: [[...quad]] }
  ], newIds: ['new-1', 'new-2'] };
}
function mark(type: EditMark['type'] = 'highlight', id = 'mark'): EditMark {
  const free = ['line', 'arrow', 'ink'].includes(type);
  return { id, documentId: 'doc', fingerprint: context.fingerprint, type, pageIndex: 0, quote: free ? '' : '真实原文', quads: [[...quad]], ...(free ? { points: [-5, 5, 20, 15] } : {}), color: '#aabbcc', note: '', origin: { kind: 'ai', id: 'assistant', sessionId: 'session' }, retained: false, visible: true, version: 4, anchorId: free ? null : 'source', placement: { dx: 0, dy: 0 } };
}
function snapshot(marks: EditMark[] = []): EditSnapshot { return { context: { ...context }, marks, versions: Object.fromEntries(marks.map(m => [m.id, m.version])) }; }
function request(command: unknown) { return { requestId: 'request', context: { ...context }, command }; }
function run(command: unknown, marks: EditMark[] = [], environment = env()) { return prepareEdit(request(command), snapshot(marks), environment); }
function prepared(result: PreparedEdit) { expect(result.ok).toBe(true); if (!result.ok || result.kind !== 'prepared') throw Error(JSON.stringify(result)); return result; }
function error(command: unknown, code = 'EDIT_INVALID', marks: EditMark[] = [], environment = env()) { expect(run(command, marks, environment)).toEqual({ ok: false, error: { code, message: expect.any(String) } }); }
const update = { type: 'update_mark', id: 'mark', expectedVersion: 4, patch: { note: 'changed' } };

describe('dense geometry copy compatibility and hostile arrays',()=>{
 it('preserves digest array edge cases and left-to-right getter effects exactly',()=>{const reference=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(reference).join(',')}]`:`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+reference(v[k])).join(',')}}`;for(const value of [[1,2.5,-0,1e-9,1e30],[NaN,Infinity,-Infinity],[1,'x',NaN,undefined],[,2,,],[[0,-1],[2,3]]])expect(canonicalDigest(value)).toBe(createHash('sha256').update(reference(value)).digest('hex'));const a={v:1},array:any[]=[a];let hits=0;Object.defineProperty(array,'1',{get(){hits++;a.v=2;return 2;},enumerable:true});expect(canonicalDigest(array)).toBe(createHash('sha256').update('[{"v":1},2]').digest('hex'));expect(hits).toBe(1);});
 it('retains canonical digest bytes and detached dense numeric content including negative zero',()=>{const value={z:Object.freeze([0,-0,1.25,-1e7,1e7]),a:[null,true,'文字',[2,3]]};const before=canonicalDigest(value),copy=copyEditData(value);expect(copy).toEqual({z:[0,0,1.25,-1e7,1e7],a:[null,true,'文字',[2,3]]});expect(Object.is(copy.z[1],-0)).toBe(false);expect(canonicalDigest(copy)).toBe(before);expect(copy.z).not.toBe(value.z);expect(before).toBe(createHash('sha256').update('{"a":[null,true,"文字",[2,3]],"z":[0,0,1.25,-10000000,10000000]}').digest('hex'));});
 it('rejects sparse, nonfinite, symbols, nonenumerable extra keys and non-array prototypes',()=>{const extra=[1,2];Object.defineProperty(extra,'extra',{value:3,enumerable:false});const symbol=[1,2];Object.defineProperty(symbol,Symbol('x'),{value:3});const proto=[1,2];Object.setPrototypeOf(proto,null);for(const input of [[1,,3],[NaN],[Infinity],[-Infinity],extra,symbol,proto])expect(()=>copyEditData(input)).toThrow();});
 it('never invokes indexed accessors, including accessor replacing a hole plus an extra key',()=>{let hits=0;const array=[1,2];Object.defineProperty(array,'1',{get(){hits++;return 2;}});const sparse:any[]=[1,,3];Object.defineProperty(sparse,'extra',{value:2});expect(()=>copyEditData(array)).toThrow();expect(()=>copyEditData(sparse)).toThrow();expect(hits).toBe(0);});
 it('rejects cyclic and aliased nested arrays, array overlimit and excessive depth',()=>{const cycle:any[]=[];cycle.push(cycle);const alias=[1,2];let deep:any=0;for(let i=0;i<34;i++)deep=[deep];for(const input of [cycle,[alias,alias],new Array(100001),deep])expect(()=>copyEditData(input)).toThrow();});
 it('copies the actual 1000 by 256-point workload without mutation or digest drift',()=>{const points=Array.from({length:1000},(_,i)=>Array.from({length:512},(_,j)=>i+j*.25)),before=canonicalDigest(points),start=performance.now(),copy=copyEditData(points);console.log('COPY_PROFILE '+JSON.stringify({arrays:1000,points:256,ms:performance.now()-start}));expect(canonicalDigest(copy)).toBe(before);expect(copy).toEqual(points);copy[0][0]=999;expect(points[0][0]).toBe(0);});
});

describe('pure editing contract', () => {
  it.each(['highlight', 'underline', 'strikeout', 'note', 'line', 'arrow', 'ink'] as const)('creates %s with trusted source/defaults and inverse', type => {
    const free = ['line', 'arrow', 'ink'].includes(type);
    const result = prepared(run({ type: 'create_mark', markType: type, pageIndex: 0, color: '#ABCDEF', note: '内容', ...(free ? { geometry: geometry() } : { anchorId: 'source' }) }));
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0]).toMatchObject({ id: 'new-1', expectedVersion: 0, before: null, after: { id: 'new-1', type, origin: env().actor, retained: false, visible: true, version: 1, placement: { dx: 0, dy: 0 }, quote: free ? '' : '真实原文', anchorId: free ? null : 'source' } });
    expect(result.inverse[0]).toMatchObject({ id: 'new-1', before: result.deltas[0].after, after: null });
    expect(result.requiresConfirmation).toBe(false);
  });
  it('creates a free note without inventing a source quote', () => {
    expect(prepared(run({ type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: '', geometry: { quads: [[...quad]] } })).deltas[0].after).toMatchObject({ quote: '', anchorId: null });
  });
  it.each(['origin', 'version', 'id', 'retained', 'quote', 'confirmed'])('rejects model-forged creation %s', key => {
    error({ type: 'create_mark', markType: 'highlight', pageIndex: 0, color: '#123456', note: '', anchorId: 'source', [key]: true });
  });
  it('requires real same-document source anchors and matching page', () => {
    const command = { type: 'create_mark', markType: 'highlight', pageIndex: 0, color: '#123456', note: '', anchorId: 'missing' };
    error(command, 'ANCHOR_NOT_FOUND'); error({ ...command, anchorId: 'next' });
    const e = env(); e.anchors[0].documentId = 'other'; error({ ...command, anchorId: 'source' }, 'EDIT_INVALID', [], e);
    error({ ...command, anchorId: undefined });
  });
  it.each(['highlight', 'underline', 'strikeout', 'note', 'line', 'arrow', 'ink'] as const)('updates content/style of %s without touching ownership', type => {
    const before = mark(type); const result = prepared(run(update, [before]));
    expect(result.deltas[0]).toEqual({ id: 'mark', expectedVersion: 4, before, after: { ...before, note: 'changed', version: 5 } });
    expect(result.inverse[0].after).toEqual(before);
  });
  it.each([{}, { origin: { kind: 'user', id: 'x' } }, { quote: 'fake' }, { retained: true }, { color: '#fff' }, { note: 'n'.repeat(100001) }])('rejects invalid content patch %j', patch => error({ ...update, patch }, 'EDIT_INVALID', [mark()]));
  it('checks object versions, tombstones, and context before planning', () => {
    error(update, 'MARK_NOT_FOUND'); error({ ...update, expectedVersion: 3 }, 'VERSION_CONFLICT', [mark()]);
    const s = snapshot(); s.versions['new-1'] = 8;
    expect(prepareEdit(request({ type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: '', geometry: { quads: [[...quad]] } }), s, env())).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });
    expect(prepareEdit({ ...request(update), context: { ...context, revision: 2 } }, snapshot([mark()]), env())).toMatchObject({ ok: false, error: { code: 'EDIT_STALE' } });
  });
  it.each(['line', 'arrow', 'ink'] as const)('edits %s endpoints/path using page-native geometry', type => {
    const g = { quads: [[...quad]], points: [-6, 4, 25, 18] };
    expect(prepared(run({ type: 'set_mark_geometry', id: 'mark', expectedVersion: 4, geometry: g }, [mark(type)])).deltas[0].after).toMatchObject(g);
  });
  it('edits free-note geometry but rejects moving source-anchored geometry', () => {
    const m = mark('note'); m.anchorId = null; m.quote = '';
    expect(prepared(run({ type: 'set_mark_geometry', id: 'mark', expectedVersion: 4, geometry: { quads: [[-7, 20, 30, 20, -7, 2, 30, 2]] } }, [m])).deltas).toHaveLength(1);
    for (const type of ['highlight', 'underline', 'strikeout', 'note'] as const) error({ type: 'set_mark_geometry', id: 'mark', expectedVersion: 4, geometry: geometry() }, 'EDIT_INVALID', [mark(type)]);
  });
  it('moves note placement while preserving original anchor and quote', () => {
    const before = mark('note');
    expect(prepared(run({ type: 'set_mark_placement', id: 'mark', expectedVersion: 4, placement: { dx: 2, dy: -3 } }, [before])).deltas[0].after).toEqual({ ...before, placement: { dx: 2, dy: -3 }, version: 5 });
    error({ type: 'set_mark_placement', id: 'mark', expectedVersion: 4, placement: { dx: 2, dy: -3 } }, 'UNSUPPORTED_PLACEMENT', [mark()]);
    error({ type: 'set_mark_placement', id: 'mark', expectedVersion: 4, placement: { dx: 101, dy: 0 } }, 'EDIT_INVALID', [before]);
  });
  it.each(['highlight', 'underline', 'strikeout', 'note'] as const)('replaces %s anchor with real page and quote', type => {
    expect(prepared(run({ type: 'replace_mark_anchor', id: 'mark', expectedVersion: 4, anchorId: 'next' }, [mark(type)])).deltas[0].after).toMatchObject({ anchorId: 'next', pageIndex: 1, quote: '第二页', quads: [quad], version: 5 });
  });
  it.each(['line', 'arrow', 'ink'] as const)('rejects anchoring free %s as quoted text', type => error({ type: 'replace_mark_anchor', id: 'mark', expectedVersion: 4, anchorId: 'next' }, 'EDIT_INVALID', [mark(type)]));
  it.each([
    { quads: [[-11, 20, 30, 20, -11, 2, 30, 2]], points: [-5, 5, 20, 15] },
    { quads: [[...quad]], points: [-5, 5, -5, 5] }, { quads: [[...quad]], points: [-5, 5, 50, 15] },
    { quads: [[...quad]], points: [NaN, 5, 20, 15] }, { quads: [[...quad]], points: [0, 1, 2] },
    { quads: [[0, 0, 0, 0, 0, 0, 0, 0]], points: [0, 0, 1, 1] },
    { quads: [[-8, 20, 30, 21, -8, 2, 30, 2]], points: [-5, 5, 20, 15] },
    { quads: [new Array(8)], points: [-5, 5, 20, 15] }, { quads: [[...quad]], points: new Array(4) }
  ])('rejects invalid/degenerate/out-of-crop geometry %j', g => error({ type: 'set_mark_geometry', id: 'mark', expectedVersion: 4, geometry: g }, 'EDIT_INVALID', [mark('arrow')]));
  it('keeps invisible and retained states independent and preserves inverse contents', () => {
    const before = mark(); before.retained = true;
    const result = prepared(run({ type: 'set_marks_visibility', targets: [{ id: 'mark', expectedVersion: 4 }], visible: false }, [before]));
    expect(result.deltas[0].after).toMatchObject({ visible: false, retained: true, origin: before.origin });
    expect(result.inverse[0].after).toEqual(before);
    expect(prepared(run({ type: 'set_marks_retention', targets: [{ id: 'mark', expectedVersion: 4 }], retained: false }, [before])).deltas[0].after).toMatchObject({ retained: false, visible: true });
    expect(prepared(run({ type: 'delete_marks', targets: [{ id: 'mark', expectedVersion: 4 }] }, [before])).deltas[0].after).toBeNull();
  });
  it.each(['user', 'other-session', 'retained'] as const)('requires confirmation for AI editing protected %s marks', protection => {
    const m = mark(); if (protection === 'user') m.origin = { kind: 'user', id: 'owner' }; else if (protection === 'other-session') m.origin = { kind: 'ai', id: 'assistant', sessionId: 'old' }; else m.retained = true;
    expect(prepared(run(update, [m])).requiresConfirmation).toBe(true);
    const e = env(); e.actor = { kind: 'user', id: 'owner' }; expect(prepared(run(update, [m], e)).requiresConfirmation).toBe(false);
  });
  it('erases whole intersecting visible strokes only and checks protected hits', () => {
    const visible = mark('ink', 'visible'), hidden = mark('ink', 'hidden'), otherPage = mark('ink', 'page'); hidden.visible = false; otherPage.pageIndex = 1; visible.retained = true;
    const result = prepared(run({ type: 'erase_ink', pageIndex: 0, from: [0, 0], to: [0, 20], radius: 1 }, [visible, hidden, otherPage]));
    expect(result.deltas.map(d => d.id)).toEqual(['visible']); expect(result.deltas[0].after).toBeNull(); expect(result.requiresConfirmation).toBe(true);
    expect(prepared(run({ type: 'erase_ink', pageIndex: 0, from: [90, 90], to: [90, 100], radius: 1 }, [visible])).deltas).toEqual([]);
  });
  it('plans atomic batches with creation-order IDs and refuses duplicate targets', () => {
    const create = { type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: '', geometry: { quads: [[...quad]] } };
    const result = prepared(run({ type: 'apply_edit_batch', operations: [create, structuredClone(create), update] }, [mark()]));
    expect(result.deltas.map(d => d.id)).toEqual(['new-1', 'new-2', 'mark']);
    error({ type: 'apply_edit_batch', operations: [update, structuredClone(update)] }, 'BATCH_CONFLICT', [mark()]);
    error({ type: 'apply_edit_batch', operations: [update, { type: 'delete_marks', targets: [{ id: 'missing', expectedVersion: 0 }] }] }, 'MARK_NOT_FOUND', [mark()]);
    error({ type: 'apply_edit_batch', operations: [{ type: 'list_marks' }] });
    error({ type: 'apply_edit_batch', operations: [] });
    error({ type: 'apply_edit_batch', operations: Array.from({ length: 65 }, () => structuredClone(create)) }, 'EDIT_TOO_LARGE');
  });
  it('rejects duplicate targets even when a first target is a no-op', () => {
    const noOp = { ...update, patch: { note: '' } };
    expect(prepared(run(noOp, [mark()])).deltas).toEqual([]);
    error({ type: 'apply_edit_batch', operations: [noOp, update] }, 'BATCH_CONFLICT', [mark()]);
    error({ type: 'delete_marks', targets: [{ id: 'mark', expectedVersion: 4 }, { id: 'mark', expectedVersion: 4 }] }, 'EDIT_INVALID', [mark()]);
  });
  it('identifies batch repeated targets before a second lookup/version check', () => {
    error({ type: 'apply_edit_batch', operations: [update, { ...structuredClone(update), expectedVersion: 99 }] }, 'BATCH_CONFLICT', [mark()]);
    const create = { type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: '', geometry: { quads: [[...quad]] } };
    error({ type: 'apply_edit_batch', operations: [create, { ...update, id: 'new-1', expectedVersion: 1 }] }, 'BATCH_CONFLICT');
  });
  it('binds eraser dependencies to hidden and non-hit page strokes', () => {
    const hidden = mark('ink'); hidden.visible = false;
    const result = prepared(run({ type: 'erase_ink', pageIndex: 0, from: [90, 90], to: [90, 100], radius: 1 }, [hidden]));
    expect(result.dependencies).toEqual({ mark: 4 }); expect(result.deltas).toEqual([]);
  });
  it.each([
    { type: 'delete_marks', targets: [] },
    { type: 'set_marks_visibility', targets: [{ id: 'mark', expectedVersion: 4 }], visible: 1 },
    { type: 'set_marks_retention', targets: [{ id: 'mark', expectedVersion: 4 }], retained: 'yes' },
    { type: 'erase_ink', pageIndex: 0, from: [0, 0], to: [1, 1], radius: 0 },
    { type: 'erase_ink', pageIndex: 0, from: [-11, 0], to: [1, 1], radius: 1 },
    { type: 'set_mark_geometry', id: 'mark', expectedVersion: 4, geometry: { quads: [quad], points: Array(8194).fill(1) } },
    { type: 'get_mark', id: '' }, { type: 'export_marked_pdf', snapshotId: 'x', path: '/fake' },
    { type: 'apply_edit_batch', operations: [{ type: 'apply_edit_batch', operations: [update] }] },
    { type: 'apply_edit_batch', operations: [{ type: 'undo_edit', operationId: 'op' }] },
    { type: 'apply_edit_batch', operations: [{ type: 'prepare_mark_export', selection: { origins: ['user'], ids: null, includeHidden: true } }] }
  ])('rejects invalid parameters and unsupported nested operations: %j', command => error(command, 'EDIT_INVALID', [mark('ink')]));
  it('rejects targets and export selections above their explicit limit', () => {
    const targets = Array.from({ length: 1001 }, (_, i) => ({ id: `m-${i}`, expectedVersion: 0 }));
    error({ type: 'delete_marks', targets }, 'EDIT_TOO_LARGE');
    error({ type: 'prepare_mark_export', selection: { origins: ['user'], ids: targets.map(t => t.id), includeHidden: true } }, 'EDIT_TOO_LARGE');
  });
  it('rejects hostile trusted mark/page-bound/anchor accessors without evaluating them', () => {
    let calls = 0;
    const s = snapshot([mark()]); Object.defineProperty(s.marks[0], 'quote', { get() { calls++; return 'fake'; } });
    expect(prepareEdit(request({ type: 'list_marks' }), s, env())).toMatchObject({ ok: false, error: { code: 'EDIT_INVALID' } });
    const e = env(); Object.defineProperty(e.pageBounds[0], 0, { get() { calls++; return 0; } }); error({ type: 'list_marks' }, 'EDIT_INVALID', [], e);
    const a = env(); Object.defineProperty(a.anchors[0], 'quote', { get() { calls++; return 'fake'; } }); error({ type: 'list_marks' }, 'EDIT_INVALID', [], a);
    expect(calls).toBe(0);
  });
  it('queries without writing deltas and generates only owned history/export requests', () => {
    expect(run({ type: 'list_marks' }, [mark()])).toMatchObject({ ok: true, kind: 'read', read: [mark()] });
    expect(run({ type: 'get_mark', id: 'mark' }, [mark()])).toMatchObject({ ok: true, kind: 'read', read: mark() });
    for (const type of ['undo_edit', 'redo_edit']) expect(run({ type, operationId: 'op' })).toMatchObject({ ok: true, kind: 'history', context, actor: env().actor, history: { type, operationId: 'op' } });
    expect(run({ type: 'export_marked_pdf', snapshotId: 'snapshot' })).toMatchObject({ ok: true, kind: 'export_request', exportRequest: { snapshotId: 'snapshot' } });
    expect(run({ type: 'list_marks' })).not.toHaveProperty('deltas');
  });
  it('exports explicit hidden/unretained selections in page/id order without changing them', () => {
    const a = mark('note', 'a'), z = mark('note', 'z'), user = mark('note', 'user'); a.visible = false; z.pageIndex = 1; z.anchorId = 'next'; z.quote = '第二页'; user.origin = { kind: 'user', id: 'owner' };
    const marks = [z, user, a]; const before = structuredClone(marks);
    const r = run({ type: 'prepare_mark_export', selection: { origins: ['ai'], ids: ['z', 'a'], includeHidden: true } }, marks);
    expect(r).toMatchObject({ ok: true, kind: 'export_snapshot', exportSnapshot: { marks: [a, z], versions: { a: 4, z: 4 } } });
    expect(run({ type: 'prepare_mark_export', selection: { origins: ['ai'], ids: null, includeHidden: false } }, marks)).toMatchObject({ ok: true, exportSnapshot: { marks: [z] } });
    expect(marks).toEqual(before);
    error({ type: 'prepare_mark_export', selection: { origins: [], ids: null, includeHidden: true } });
    error({ type: 'prepare_mark_export', selection: { origins: ['ai'], ids: ['a', 'a'], includeHidden: true } }, 'EDIT_INVALID', marks);
  });
  it('canonical digest is SHA256, key-order insensitive, and version-sensitive', () => {
    expect(canonicalDigest({ b: 2, a: '你好😀' })).toBe(createHash('sha256').update('{"a":"你好😀","b":2}').digest('hex'));
    const a = prepared(run(update, [mark()]));
    const b = prepared(run({ patch: { note: 'changed' }, expectedVersion: 4, id: 'mark', type: 'update_mark' }, [mark()]));
    expect(a.digest).toBe(b.digest); expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
    const m = mark(); m.version = 5; expect(prepared(run({ ...update, expectedVersion: 5 }, [m])).digest).not.toBe(a.digest);
    const c = { type: 'set_marks_visibility', targets: [{ id: 'b', expectedVersion: 4 }, { id: 'a', expectedVersion: 4 }], visible: false };
    expect(prepared(run(c, [mark('note', 'a'), mark('note', 'b')])).digest).toBe(prepared(run({ ...c, targets: [...c.targets].reverse() }, [mark('note', 'b'), mark('note', 'a')])).digest);
  });
  it('includes dependencies for zero-change operations and list/export snapshots', () => {
    const m = mark(); const a = prepared(run({ ...update, patch: { note: '' } }, [m])); m.version = 5;
    const b = prepared(run({ ...update, expectedVersion: 5, patch: { note: '' } }, [m])); expect(a.digest).not.toBe(b.digest);
    expect(a.dependencies).toEqual({ mark: 4 });
  });
  it('returns no input references and keeps result branches isolated', () => {
    const m = mark('note'); const e = env(); const input = request({ type: 'replace_mark_anchor', id: 'mark', expectedVersion: 4, anchorId: 'next' });
    const result = prepared(prepareEdit(input, snapshot([m]), e)); const copy = structuredClone(result);
    m.quads[0][0] = 90; e.anchors[1].quads[0][0] = 90; input.context.revision = 9;
    expect(result).toEqual(copy);
    result.deltas[0].after!.quads[0][0] = 80; expect(result.inverse[0].before!.quads[0][0]).toBe(-8); expect(result.deltas[0].before!.quads[0][0]).toBe(-8);
    expect(result).not.toHaveProperty('read'); expect(result).not.toHaveProperty('history');
  });
  it('rejects accessors without invoking them, inherited properties, aliases and symbols', () => {
    let calls = 0;
    const input = request({ type: 'list_marks' }); Object.defineProperty(input, 'context', { get() { calls++; throw Error('getter'); } });
    expect(prepareEdit(input, snapshot(), env())).toMatchObject({ ok: false, error: { code: 'EDIT_INVALID' } }); expect(calls).toBe(0);
    error(Object.assign(Object.create({ confirmed: true }), { type: 'list_marks' }));
    error({ type: 'list_marks', [Symbol('extra')]: 1 });
    const q = [...quad]; error({ type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: '', geometry: { quads: [q, q] } });
    const e = env(); Object.defineProperty(e.actor, 'id', { get() { calls++; return 'x'; } }); error({ type: 'list_marks' }, 'EDIT_INVALID', [], e); expect(calls).toBe(0);
  });
  it('validates trusted snapshots, anchors, versions, IDs, bounds and finite values', () => {
    const m = mark(); m.version = Number.MAX_SAFE_INTEGER + 1; error(update, 'EDIT_INVALID', [m]);
    const s = snapshot([mark()]); s.versions.mark = 3; expect(prepareEdit(request(update), s, env())).toMatchObject({ ok: false, error: { code: 'EDIT_INVALID' } });
    for (const change of [(e: EditEnvironment) => { e.pageBounds = [[0, 0, 0, 0]]; }, (e: EditEnvironment) => { e.newIds = ['x', 'x']; }, (e: EditEnvironment) => { e.anchors[0].quads[0][0] = Infinity; }]) { const e = env(); change(e); error({ type: 'list_marks' }, 'EDIT_INVALID', [], e); }
    expect(prepareEdit({ ...request({ type: 'list_marks' }), extra: true }, snapshot(), env())).toMatchObject({ ok: false, error: { code: 'EDIT_INVALID' } });
    expect(prepareEdit({ ...request({ type: 'list_marks' }), requestId: 'x'.repeat(101) }, snapshot(), env())).toMatchObject({ ok: false, error: { code: 'EDIT_INVALID' } });
  });
  it('reads the highest safe version but rejects an increment that would overflow', () => {
    const m = mark(); m.version = Number.MAX_SAFE_INTEGER;
    expect(run({ type: 'get_mark', id: 'mark' }, [m])).toMatchObject({ ok: true, kind: 'read', read: { version: Number.MAX_SAFE_INTEGER } });
    error({ ...update, expectedVersion: Number.MAX_SAFE_INTEGER }, 'VERSION_CONFLICT', [m]);
  });
  it('accepts explicit zero for an ID that has never existed, not a positive tombstone', () => {
    const s = snapshot(); s.versions['new-1'] = 0;
    const r = prepared(prepareEdit(request({ type: 'create_mark', markType: 'note', pageIndex: 0, color: '#123456', note: '', geometry: { quads: [[...quad]] } }), s, env()));
    expect(r.deltas[0]).toMatchObject({ expectedVersion: 0, after: { version: 1 } });
  });
  it.each(['highlight', 'underline', 'strikeout', 'note'] as const)('preserves trusted skewed source vertices when creating %s', markType => {
    const e = env(); e.anchors[0].quads = [[0, 20, 30, 25, 0, 2, 30, 7]];
    const result = prepared(run({ type: 'create_mark', markType, pageIndex: 0, color: '#123456', note: '', anchorId: 'source' }, [], e));
    expect(result.deltas[0].after).toMatchObject({ quads: [[0, 20, 30, 25, 0, 2, 30, 7]], quote: '真实原文', anchorId: 'source' });
    e.anchors[0].quads[0][0] = 4;
    expect(result.deltas[0].after!.quads[0][0]).toBe(0);
  });
  it.each(['list_marks', 'get_mark'] as const)('reads existing skewed source marks using %s', type => {
    const m = mark(); m.quads = [[0, 20, 30, 25, 0, 2, 30, 7]];
    const result = run(type === 'get_mark' ? { type, id: 'mark' } : { type }, [m]);
    expect(result).toMatchObject({ ok: true, kind: 'read', read: type === 'get_mark' ? m : [m] });
  });
  it.each(['highlight', 'underline', 'strikeout', 'note'] as const)('replaces %s anchor without rectifying its real source vertices', type => {
    const e = env(); e.anchors[1].quads = [[0, 20, 30, 25, 0, 2, 30, 7]];
    const result = prepared(run({ type: 'replace_mark_anchor', id: 'mark', expectedVersion: 4, anchorId: 'next' }, [mark(type)], e));
    expect(result.deltas[0].after).toMatchObject({ quads: [[0, 20, 30, 25, 0, 2, 30, 7]], pageIndex: 1, quote: '第二页', anchorId: 'next' });
    error({ type: 'set_mark_geometry', id: 'mark', expectedVersion: 4, geometry: { quads: [[0, 20, 30, 25, 0, 2, 30, 7]] } }, 'EDIT_INVALID', [mark(type)], e);
  });
  it('does not reject unrelated requests because an unused verified anchor is skewed', () => {
    const e = env(); e.anchors[1].quads = [[0, 20, 30, 25, 0, 2, 30, 7]];
    expect(run({ type: 'list_marks' }, [], e)).toMatchObject({ ok: true, kind: 'read', read: [] });
  });
  it.each([
    [0, 20, 10, 15, 20, 10, 30, 5], // collinear
    [0, 20, 30, 25, 30, 7, 0, 2], // self-crossing in PDF quad perimeter order
    [0, 20, 30, 25, 0, 2, 5, 18], // concave
    [-11, 20, 30, 25, 0, 2, 30, 7], // outside trusted crop
  ])('rejects degenerate/nonconvex/out-of-page source vertices: %j', (...q) => {
    const e = env(); e.anchors[0].quads = [q];
    error({ type: 'create_mark', markType: 'highlight', pageIndex: 0, color: '#123456', note: '', anchorId: 'source' }, 'EDIT_INVALID', [], e);
  });
});
