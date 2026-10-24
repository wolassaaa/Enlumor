import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('pdfjs-dist', () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({ EventBus: class {}, PDFViewer: class {}, PDFLinkService: class {}, PDFFindController: class {}, ScrollMode: {} }));
import { PdfReader } from '../src/renderer/pdf-reader';
import { createReaderCommandHost } from '../src/renderer/document-command-reader';
import { runDocumentCommand } from '../src/renderer/reading-commands';
import type { CommandContext, DocumentCommand, DocumentCommandPorts } from '../src/shared/document-commands';
import type { CruiseBlock } from '../src/shared/cruise';

const context: CommandContext = { documentId: 'doc', fingerprint: 'a'.repeat(64), revision: 3 };
const block: CruiseBlock = { id: 'passage-1', documentId: 'doc', fingerprint: 'a'.repeat(64), pageIndex: 0, quote: 'Original text', quads: [[1, 10, 20, 10, 1, 1, 20, 1]] };
const request = (command: DocumentCommand) => ({ requestId: 'request-1', context: { ...context }, command });
function host() {
  let current: CommandContext | null = { ...context };
  const effects: unknown[] = [];
  const annotations = [{ id: 'keep', quote: 'User annotation' }];
  const ports: DocumentCommandPorts = {
    getContext: () => current,
    getPageCount: () => 2,
    readPage: async pageIndex => { effects.push(['read', pageIndex]); return [{ ...structuredClone(block), pageIndex }]; },
    navigate: async (pageIndex, isCurrent) => { if (isCurrent()) effects.push(['navigate', pageIndex]); },
    focus: async (evidence, isCurrent) => { if (isCurrent()) effects.push(['focus', evidence]); },
    clearFocus: () => { effects.push('clear'); },
    pause: () => { effects.push('pause'); }
  };
  return { ports, effects, annotations, setContext: (value: CommandContext | null) => { current = value; } };
}
const execute = (input: unknown, h = host(), signal = new AbortController().signal) => runDocumentCommand(input, h.ports, signal);
async function failure(input: unknown, code: string, h = host(), signal = new AbortController().signal) {
  const result = await execute(input, h, signal);
  expect(result).toMatchObject({ ok: false, error: { code, message: expect.any(String) } });
  if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('validated document command executor', () => {
  it('returns source-bound page text without navigation', async () => {
    const h = host();
    expect(await execute(request({ type: 'read_page', pageIndex: 0 }), h)).toEqual({ requestId: 'request-1', ok: true, result: { kind: 'page', blocks: [block] } });
    expect(h.effects).toEqual([['read', 0]]);
  });
  it.each([0, 1])('navigates exactly once to zero-based boundary page %i', async pageIndex => {
    const h = host();
    expect(await execute(request({ type: 'go_to_page', pageIndex }), h)).toEqual({ requestId: 'request-1', ok: true, result: { kind: 'navigated', pageIndex } });
    expect(h.effects).toEqual([['navigate', pageIndex]]);
  });
  it('resolves evidence by ID from the requested source page', async () => {
    const h = host();
    expect(await execute(request({ type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' }), h)).toEqual({ requestId: 'request-1', ok: true, result: { kind: 'focused', passageId: 'passage-1', pageIndex: 0 } });
    expect(h.effects).toEqual([['read', 0], ['focus', block]]);
  });
  it.each(['clear_focus', 'pause'] as const)('%s changes only local focus/session state, not annotations', async type => {
    const h = host();
    expect(await execute(request({ type }), h)).toEqual({ requestId: 'request-1', ok: true, result: { kind: type === 'pause' ? 'paused' : 'cleared' } });
    expect(h.effects).toEqual([type === 'pause' ? 'pause' : 'clear']);
    expect(h.annotations).toEqual([{ id: 'keep', quote: 'User annotation' }]);
  });
  it('allows pause to invalidate its own host revision and signal', async () => {
    const h = host(), controller = new AbortController();
    h.ports.pause = () => { h.effects.push('pause'); h.setContext({ ...context, revision: 4 }); controller.abort(); };
    expect(await execute(request({ type: 'pause' }), h, controller.signal)).toEqual({ requestId: 'request-1', ok: true, result: { kind: 'paused' } });
    expect(h.effects).toEqual(['pause']);
  });
  const valid = request({ type: 'read_page', pageIndex: 0 });
  it.each([
    null, [], {}, { ...valid, extra: true }, { ...valid, requestId: '' }, { ...valid, requestId: ' '.repeat(2) }, { ...valid, requestId: 'r'.repeat(101) },
    ...['', ' '.repeat(2), 'd'.repeat(101)].map(documentId => ({ ...valid, context: { ...context, documentId } })),
    ...['f', 'g'.repeat(64), 'a'.repeat(63)].map(fingerprint => ({ ...valid, context: { ...context, fingerprint } })),
    ...[-1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1, '3'].map(revision => ({ ...valid, context: { ...context, revision } })),
    { ...valid, context: { ...context, extra: true } }, { ...valid, command: { type: 'read_page', pageIndex: 0, quads: [] } },
    { ...valid, command: { type: 'clear_focus', pageIndex: 0 } }, { ...valid, command: { type: 'pause', script: 'x' } },
    { ...valid, command: { type: 'start_model' } }, { ...valid, command: { type: 'read_page' } },
    ...[NaN, Infinity, 1.1, '0', Number.MAX_SAFE_INTEGER + 1].map(pageIndex => ({ ...valid, command: { type: 'read_page', pageIndex } })),
    ...['', '  ', 'p'.repeat(201), 1].map(passageId => ({ ...valid, command: { type: 'show_evidence', pageIndex: 0, passageId } })),
    { ...valid, [Symbol('extra')]: true }
  ])('rejects malformed input before touching host: %j', async input => {
    const h = host();
    h.ports.getContext = () => { throw Error('must not inspect host'); };
    await failure(input, 'COMMAND_INVALID', h);
    expect(h.effects).toEqual([]);
  });
  it('catches throwing input accessors as invalid and preserves validated request identity', async () => {
    const input = { requestId: 'request-1', get context() { throw Error('parse'); }, command: { type: 'pause' } };
    expect(await failure(input, 'COMMAND_INVALID')).toMatchObject({ requestId: 'request-1' });
  });
  it.each([-1, 2])('rejects out-of-range page %i without host effects', async pageIndex => {
    const h = host(); await failure(request({ type: 'go_to_page', pageIndex }), 'PAGE_OUT_OF_RANGE', h); expect(h.effects).toEqual([]);
  });
  it.each([null, { ...context, documentId: 'other' }, { ...context, fingerprint: 'b'.repeat(64) }, { ...context, revision: 4 }])('rejects stale source %j', async source => {
    const h = host(); h.setContext(source); await failure(request({ type: 'clear_focus' }), 'COMMAND_STALE', h); expect(h.effects).toEqual([]);
  });
  it('rejects absent evidence without focusing', async () => {
    const h = host(); await failure(request({ type: 'show_evidence', pageIndex: 0, passageId: 'forged' }), 'EVIDENCE_NOT_FOUND', h); expect(h.effects).toEqual([['read', 0]]);
  });
  it.each([
    [{ ...block, documentId: 'other' }], [{ ...block, fingerprint: 'b'.repeat(64) }], [{ ...block, pageIndex: 1 }],
    [{ ...block, id: '' }], [{ ...block, id: ' '.repeat(2) }], [{ ...block, id: 'p'.repeat(201) }], [{ ...block, quote: 42 }],
    [{ ...block, quads: [[1, 2]] }], [{ ...block, quads: [[1, 10, 2e7, 10, 1, 1, 20, 1]] }],
    [{ ...block, quads: [[20, 10, 1, 10, 1, 1, 20, 1]] }], [{ ...block, quads: [[1, NaN, 20, 10, 1, 1, 20, 1]] }],
    [{ ...block, quads: [new Array(8)] }], [{ ...block, quads: new Array(1) }], new Array(1),
    [block, block], null, [null]
  ].map(blocks => ({ blocks })))('rejects malformed host evidence before returning or focusing: %j', async ({ blocks }) => {
    for (const command of [{ type: 'read_page', pageIndex: 0 }, { type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' }] as const) {
      const h = host(); h.ports.readPage = async () => blocks as CruiseBlock[];
      await failure(request(command), 'COMMAND_FAILED', h); expect(h.effects).toEqual([]);
    }
  });
  it('returns empty pages as empty text, not fabricated evidence', async () => {
    const h = host(); h.ports.readPage = async () => [];
    expect(await execute(request({ type: 'read_page', pageIndex: 0 }), h)).toMatchObject({ ok: true, result: { kind: 'page', blocks: [] } });
  });
  it.each(['revision', 'abort'] as const)('blocks delayed read completion after %s changes', async change => {
    const h = host(), controller = new AbortController(), pending = deferred<CruiseBlock[]>();
    h.ports.readPage = () => pending.promise;
    const result = execute(request({ type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' }), h, controller.signal);
    if (change === 'abort') controller.abort(); else h.setContext({ ...context, revision: 4 });
    pending.resolve([block]);
    expect(await result).toMatchObject({ ok: false, error: { code: change === 'abort' ? 'COMMAND_CANCELED' : 'COMMAND_STALE' } });
    expect(h.effects).toEqual([]);
  });
  it('rejects an already canceled command without effects', async () => {
    const h = host(), controller = new AbortController(); controller.abort();
    await failure(request({ type: 'pause' }), 'COMMAND_CANCELED', h, controller.signal); expect(h.effects).toEqual([]);
  });
  it.each(['navigate', 'focus'] as const)('gives deferred %s a live guard and rejects late completion', async effect => {
    const h = host(), pending = deferred<void>(); let callback: (() => boolean) | undefined;
    if (effect === 'navigate') h.ports.navigate = async (_page, guard) => { callback = guard; await pending.promise; if (guard()) h.effects.push('late'); };
    else h.ports.focus = async (_block, guard) => { callback = guard; await pending.promise; if (guard()) h.effects.push('late'); };
    const result = execute(request(effect === 'navigate' ? { type: 'go_to_page', pageIndex: 1 } : { type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' }), h);
    await Promise.resolve(); await Promise.resolve();
    expect(callback?.()).toBe(true); h.setContext({ ...context, revision: 4 }); expect(callback?.()).toBe(false);
    pending.resolve(); expect(await result).toMatchObject({ ok: false, error: { code: 'COMMAND_STALE' } });
    expect(h.effects).not.toContain('late');
  });
  it('snapshots caller input and output geometry across awaits', async () => {
    const h = host(), pending = deferred<CruiseBlock[]>(), input = request({ type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' });
    h.ports.readPage = () => pending.promise;
    let focused: CruiseBlock | undefined; h.ports.focus = async value => { focused = value; };
    const result = execute(input, h); input.context.revision = 4; input.command = { type: 'pause' };
    const page = structuredClone(block); pending.resolve([page]);
    expect(await result).toMatchObject({ ok: true, result: { kind: 'focused', passageId: 'passage-1', pageIndex: 0 } });
    page.quads[0][0] = 999; expect(focused?.quads[0][0]).toBe(1);
  });
  it('captures request and context primitive getters only once', async () => {
    const h = host(); let idReads = 0, revisionReads = 0;
    const input = { get requestId() { return ++idReads === 1 ? 'request-1' : 'retargeted'; }, context: { ...context, get revision() { return ++revisionReads === 1 ? 3 : 4; } }, command: { type: 'pause' } };
    expect(await execute(input, h)).toEqual({ requestId: 'request-1', ok: true, result: { kind: 'paused' } });
    expect(h.effects).toEqual(['pause']);
  });
  it('captures the validated command page before getters can retarget it', async () => {
    const h = host(); let reads = 0;
    const input = request({ type: 'go_to_page', get pageIndex() { return ++reads === 1 ? 0 : 1; } });
    expect(await execute(input, h)).toMatchObject({ ok: true, result: { kind: 'navigated', pageIndex: 0 } });
    expect(h.effects).toEqual([['navigate', 0]]);
  });
  it('validates the exact source-bound block snapshot passed to focus', async () => {
    const h = host(); let reads = 0;
    h.ports.readPage = async () => [{ ...block, get documentId() { return ++reads === 1 ? 'doc' : 'other'; } }];
    expect(await execute(request({ type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' }), h)).toMatchObject({ ok: true });
    expect(h.effects).toEqual([['focus', block]]);
  });
  it.each(['navigate', 'focus'] as const)('cancels delayed %s at its guarded effect', async effect => {
    const h = host(), controller = new AbortController(), pending = deferred<void>();
    const finish = async (_value: unknown, guard: () => boolean) => { await pending.promise; if (guard()) h.effects.push('late'); };
    if (effect === 'navigate') h.ports.navigate = finish; else h.ports.focus = finish;
    const result = execute(request(effect === 'navigate' ? { type: 'go_to_page', pageIndex: 1 } : { type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' }), h, controller.signal);
    await Promise.resolve(); controller.abort(); pending.resolve();
    expect(await result).toMatchObject({ ok: false, error: { code: 'COMMAND_CANCELED' } }); expect(h.effects).not.toContain('late');
  });
  it('fails a deferred guard closed if the host context getter throws', async () => {
    const h = host(), pending = deferred<void>(); let guard!: () => boolean;
    h.ports.navigate = async (_page, check) => { guard = check; await pending.promise; if (check()) h.effects.push('late'); };
    const result = execute(request({ type: 'go_to_page', pageIndex: 0 }), h);
    h.ports.getContext = () => { throw Error('host failed'); };
    expect(guard()).toBe(false); pending.resolve();
    expect(await result).toMatchObject({ ok: false, error: { code: 'COMMAND_FAILED' } }); expect(h.effects).toEqual([]);
  });
  it.each(['abort', 'revision'] as const)('reports %s rather than a late read rejection', async change => {
    const h = host(), controller = new AbortController(), pending = deferred<CruiseBlock[]>();
    h.ports.readPage = () => pending.promise;
    const result = execute(request({ type: 'read_page', pageIndex: 0 }), h, controller.signal);
    if (change === 'abort') controller.abort(); else h.setContext({ ...context, revision: 4 });
    pending.reject(Error('late failure'));
    expect(await result).toMatchObject({ ok: false, error: { code: change === 'abort' ? 'COMMAND_CANCELED' : 'COMMAND_STALE' } });
  });
  it.each(['readPage', 'navigate', 'focus', 'clearFocus', 'pause', 'getContext', 'getPageCount'] as const)('normalizes %s errors without leaking error text or trusting error code identity', async method => {
    const h = host(); h.ports[method] = (() => { throw Object.assign(Error('private detail'), { code: 'COMMAND_STALE' }); }) as never;
    const command: DocumentCommand = method === 'readPage' || method === 'getPageCount' ? { type: 'read_page', pageIndex: 0 } : method === 'navigate' ? { type: 'go_to_page', pageIndex: 0 } : method === 'focus' ? { type: 'show_evidence', pageIndex: 0, passageId: 'passage-1' } : method === 'pause' ? { type: 'pause' } : { type: 'clear_focus' };
    const result = await failure(request(command), 'COMMAND_FAILED', h); expect(JSON.stringify(result)).not.toContain('private detail');
  });
  it.each([0, -1, 1.5, NaN, Infinity, '2'])('rejects malformed host page count %j', async count => {
    const h = host(); h.ports.getPageCount = () => count as number;
    await failure(request({ type: 'read_page', pageIndex: 0 }), 'COMMAND_FAILED', h); expect(h.effects).toEqual([]);
  });
});

// Real PdfReader methods, with only the PDF.js/DOM boundary supplied. No fake
// focus/navigate port: retained frames exercise the actual viewport mutation.
function readerFixture() {
 const frames: FrameRequestCallback[] = [];
 vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
 const reader: any = Object.create(PdfReader.prototype);
 const paint = vi.fn();
 const page = { view: [0, 0, 600, 800], getTextContent: async () => ({ styles: {}, items: [{ str: 'Native source', width: 100, height: 14, transform: [14, 0, 0, 14, 40, 700], fontName: 'f' }] }) };
 Object.assign(reader, { generation: 1, focusEpoch: 0, ready: true, active: { id: 'doc', fingerprint: context.fingerprint, pageCount: 3 }, blockCache: new Map(),
  viewer: { currentPageNumber: 1, pdfDocument: { getPage: async () => page }, getPageView: () => ({ viewport: { transform: [1, 0, 0, 1, 0, 0] }, div: { offsetTop: 800 } }) },
  container: { scrollTop: 23, clientHeight: 600 }, paint });
 return { reader, frames, paint, page, flush: () => { for (const callback of frames.splice(0)) callback(0); } };
}
function sourceMark() { return { ...structuredClone(block), type: 'highlight', author: 'user', color: '#ffff00', note: '' }; }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each(['clear', 'source', 'guard'])('real reader rejects a retained focus frame after %s invalidation', async change => {
 vi.useFakeTimers(); const h = readerFixture(); let current = true;
 const pending = h.reader.focus(sourceMark(), () => current);
 expect(h.reader.flash?.quote).toBe('Original text'); expect(h.frames).toHaveLength(1);
 if (change === 'clear') h.reader.clearCruiseFocus();
 if (change === 'source') { h.reader.generation++; h.reader.active = { ...h.reader.active, id: 'new' }; h.reader.flash = undefined; }
 if (change === 'guard') current = false;
 h.reader.container.scrollTop = 47; h.flush(); await pending;
 expect(h.reader.container.scrollTop).toBe(47);
 if (change !== 'source') expect(h.reader.flash).toBeUndefined();
});
it('real reader keeps the newest focus when an older retained frame arrives', async () => {
 vi.useFakeTimers(); const h = readerFixture();
 const old = h.reader.focus(sourceMark());
 const latest = h.reader.focus({ ...sourceMark(), id: 'new-evidence', quads: [[10, 100, 50, 100, 10, 90, 50, 90]] });
 const newestFrame = h.frames.pop()!; newestFrame(0); await latest;
 const position = h.reader.container.scrollTop; h.flush(); await old;
 expect(h.reader.container.scrollTop).toBe(position); expect(h.reader.flash.id).toBe('new-evidence');
});

it.each(['pause', 'takeover', 'switch', 'source-hash'] as const)('real reader text delayed across %s never returns old evidence; next command uses latest refs', async change => {
 const h = readerFixture(), text = deferred<any>();
 const nativeText = h.page.getTextContent;
 h.page.getTextContent = () => text.promise;
 let document = h.reader.active;
 const host = createReaderCommandHost(() => h.reader, () => document);
 const pending = host.run({ type: 'read_page', pageIndex: 0 });
 await Promise.resolve(); // The real PdfReader is waiting in getTextContent.
 if (change === 'pause') expect(await host.run({ type: 'pause' })).toMatchObject({ ok: true, result: { kind: 'paused' } });
 else host.invalidate();
 if (change === 'switch' || change === 'source-hash') {
  document = { ...document, id: change === 'switch' ? 'latest-doc' : document.id, fingerprint: 'b'.repeat(64) };
  h.reader.active = document; h.reader.generation++; h.reader.blockCache.clear();
 }
 text.resolve(await nativeText());
 expect(await pending).toMatchObject({ ok: false, error: { code: 'COMMAND_CANCELED' } });
 h.page.getTextContent = nativeText;
 const latest = await host.run({ type: 'read_page', pageIndex: 2 });
 expect(latest).toMatchObject({ ok: true, result: { kind: 'page', blocks: [{ documentId: document.id, fingerprint: document.fingerprint, pageIndex: 2, quote: 'Native source' }] } });
 expect(h.reader.viewer.currentPageNumber).toBe(1); expect(h.reader.flash).toBeUndefined();
});
it('clear_focus cancels a pending real focus result and frame while reporting its own completion', async () => {
 vi.useFakeTimers(); const h = readerFixture();
 const host = createReaderCommandHost(() => h.reader, () => h.reader.active);
 const page = await host.run({ type: 'read_page', pageIndex: 0 });
 if (!page.ok || page.result.kind !== 'page') throw Error('native page fixture failed');
 const pending = host.run({ type: 'show_evidence', pageIndex: 0, passageId: page.result.blocks[0].id });
 for (let i = 0; i < 8; i++) await Promise.resolve();
 expect(h.frames).toHaveLength(1); expect(h.reader.flash).toBeDefined();
 expect(await host.run({ type: 'clear_focus' })).toMatchObject({ ok: true, result: { kind: 'cleared' } });
 h.flush();
 expect(await pending).toMatchObject({ ok: false, error: { code: 'COMMAND_CANCELED' } });
 expect(h.reader.flash).toBeUndefined(); expect(h.reader.container.scrollTop).toBe(23);
});
it('a detached reader cannot report successful navigation with a still-mounted document ref', async () => {
 const h = readerFixture();
 const host = createReaderCommandHost(() => null, () => h.reader.active);
 expect(await host.run({ type: 'go_to_page', pageIndex: 2 })).toMatchObject({ ok: false });
 expect(h.reader.viewer.currentPageNumber).toBe(1);
});
it('closed-focus takeovers only invalidate refs and do not repaint every page', () => {
 const h = readerFixture(), host = createReaderCommandHost(() => h.reader, () => h.reader.active);
 host.invalidate(); host.invalidate();
 expect(h.paint).not.toHaveBeenCalled();
});
