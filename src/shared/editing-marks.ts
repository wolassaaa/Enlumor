import type { CommandContext } from './document-commands';
import type { EditActor, EditEnvironment, EditErrorCode, EditGeometry, EditMark, EditSnapshot, VerifiedAnchor } from './editing-commands';

const messages: Record<EditErrorCode, string> = {
  EDIT_INVALID: 'Invalid editing data.', EDIT_STALE: 'The document context has changed.',
  MARK_NOT_FOUND: 'The mark was not found.', VERSION_CONFLICT: 'The object version has changed.',
  ANCHOR_NOT_FOUND: 'The verified source anchor was not found.', UNSUPPORTED_PLACEMENT: 'Placement is supported only for notes.',
  BATCH_CONFLICT: 'The batch targets the same mark more than once.', EDIT_TOO_LARGE: 'The editing request exceeds its size limit.'
};
export class EditValidationError extends Error {
  constructor(readonly code: EditErrorCode) { super(messages[code]); }
}
export function invalid(code: EditErrorCode = 'EDIT_INVALID'): never { throw new EditValidationError(code); }

/** Only own data properties are inspected. No external getter is evaluated, even on arrays. */
// Edit data the host parsed with JSON.parse from its own storage and validated, then deeply froze. It cannot carry accessors,
// holes, symbols or cycles and cannot change, so copying it returns it as it is; dense ink snapshots are mostly this.
const trustedEditData = new WeakSet<object>();
/** Deeply freezes host-parsed, already validated edit data and lets copyEditData return it without copying. */
export function trustEditData<T extends object>(value: T): T {
  const freeze = (v: unknown) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const key of Object.keys(v)) freeze((v as Record<string, unknown>)[key]); Object.freeze(v); } };
  freeze(value); trustedEditData.add(value); return value;
}
export function copyEditData<T>(input: T): T {
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): unknown {
    if (depth > 32) invalid('EDIT_TOO_LARGE');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'object' && trustedEditData.has(value)) return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(); return Object.is(value, -0) ? 0 : value; }
    if (typeof value !== 'object' || seen.has(value)) invalid();
    seen.add(value);
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) invalid();
    if (array) {
      // Dense paths dominate real ink snapshots. Read each own data descriptor once,
      // without allocating a second 512-property descriptor object for every stroke.
      const property = Object.getOwnPropertyDescriptor(value, 'length');
      if (!property || !('value' in property) || !Number.isSafeInteger(property.value) || property.value < 0) invalid();
      const length = property.value as number;
      if (length > 100000) invalid('EDIT_TOO_LARGE');
      // Every index plus length must be present: cardinality + own-index checks
      // rejects holes and *all* extra keys (including symbols/nonenumerable keys).
      if (Reflect.ownKeys(value).length !== length + 1) invalid();
      if (length && depth >= 32) invalid('EDIT_TOO_LARGE');
      const result: unknown[] = new Array(length);
      for (let i = 0; i < length; i++) {
        const entry = Object.getOwnPropertyDescriptor(value, i);
        if (!entry || !('value' in entry)) invalid();
        const item: unknown = entry.value;
        if (typeof item === 'number') { if (!Number.isFinite(item)) invalid(); result[i] = Object.is(item, -0) ? 0 : item; }
        else result[i] = visit(item, depth + 1);
      }
      return result;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string' || !('value' in descriptors[key]))) invalid();
    const result: Record<string, unknown> = {};
    for (const key of keys as string[]) Object.defineProperty(result, key, { value: visit(descriptors[key].value, depth + 1), enumerable: true, writable: true, configurable: true });
    return result;
  }
  return visit(input, 0) as T;
}
export function object(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const keys = Object.keys(value);
  if (keys.some(key => !required.includes(key) && !optional.includes(key)) || required.some(key => !Object.hasOwn(value, key))) invalid();
}
export function identifier(value: unknown, limit = 100): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) invalid();
}
export function version(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(); }
export function finite(value: unknown): asserts value is number { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e7) invalid(); }
export function text(value: unknown): asserts value is string { if (typeof value !== 'string' || value.length > 100000) invalid(); }
export function color(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid(); }
export function boolean(value: unknown): asserts value is boolean { if (typeof value !== 'boolean') invalid(); }
export const markTypes = ['highlight', 'underline', 'strikeout', 'line', 'arrow', 'ink', 'note'] as const;
export const textTypes: readonly string[] = ['highlight', 'underline', 'strikeout'];
export function page(value: unknown, bounds: EditEnvironment['pageBounds']): asserts value is number { version(value); if (value >= bounds.length) invalid(); }
export function validateContext(value: unknown): asserts value is CommandContext {
  object(value, ['documentId', 'fingerprint', 'revision']); identifier(value.documentId); version(value.revision);
  if (typeof value.fingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(value.fingerprint)) invalid();
}
export function validateActor(value: unknown): asserts value is EditActor {
  if (!value || typeof value !== 'object') invalid();
  const a = value as EditActor;
  if (a.kind === 'user') object(a, ['kind', 'id']); else if (a.kind === 'ai') { object(a, ['kind', 'id', 'sessionId']); identifier(a.sessionId); } else invalid();
  identifier(a.id);
}
export function inBounds(x: number, y: number, bounds: readonly number[]): boolean { return x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]; }
export function validateGeometry(value: unknown, type: EditMark['type'], bounds: readonly number[]): asserts value is EditGeometry {
  object(value, ['quads'], ['points']);
  if (!Array.isArray(value.quads) || !value.quads.length) invalid();
  if (value.quads.length > 10000) invalid('EDIT_TOO_LARGE');
  const isPath = type === 'line' || type === 'arrow' || type === 'ink';
  for (const q of value.quads) {
    if (!Array.isArray(q) || q.length !== 8) invalid();
    q.forEach(finite);
    if (isPath) {
      // Path endpoint containment below uses an axis-aligned bounding rectangle.
      if (q[0] !== q[4] || q[2] !== q[6] || q[1] !== q[3] || q[5] !== q[7] || q[2] <= q[0] || q[1] <= q[5]) invalid();
    } else {
      // PDF quads store top-left/top-right/bottom-left/bottom-right, not perimeter order.
      // Preserve source vertices, accepting strict convex quads in either orientation.
      const perimeter = [0, 2, 6, 4];
      let orientation = 0;
      for (let i = 0; i < 4; i++) {
        const a = perimeter[i], b = perimeter[(i + 1) % 4], c = perimeter[(i + 2) % 4];
        const cross = (q[b] - q[a]) * (q[c + 1] - q[b + 1]) - (q[b + 1] - q[a + 1]) * (q[c] - q[b]);
        const sign = Math.sign(cross);
        if (!sign || orientation && sign !== orientation) invalid();
        orientation = sign;
      }
    }
    for (let i = 0; i < 8; i += 2) if (!inBounds(q[i], q[i + 1], bounds)) invalid();
  }
  if (!isPath) { if (Object.hasOwn(value, 'points')) invalid(); return; }
  const p = value.points, q = value.quads[0];
  if (!Array.isArray(p) || p.length < 4 || p.length % 2 || p.length > 8192 || value.quads.length !== 1 || (type !== 'ink' && p.length !== 4)) invalid();
  p.forEach(finite);
  if (!p.some((n, i) => i >= 2 && Math.abs(n - p[i % 2]) >= 1e-6)) invalid();
  for (let i = 0; i < p.length; i += 2) if (p[i] < q[0] || p[i] > q[2] || p[i + 1] < q[5] || p[i + 1] > q[1]) invalid();
  if (type !== 'ink' && Math.hypot(p[2] - p[0], p[3] - p[1]) < 1e-6) invalid();
}
export function validatePlacement(value: unknown, mark: Pick<EditMark, 'quads'>, bounds: readonly number[]): asserts value is EditMark['placement'] {
  object(value, ['dx', 'dy']); finite(value.dx); finite(value.dy);
  for (const q of mark.quads) for (let i = 0; i < 8; i += 2) if (!inBounds(q[i] + value.dx, q[i + 1] + value.dy, bounds)) invalid();
}
function sameSource(value: { documentId: string; fingerprint: string }, context: CommandContext) { if (value.documentId !== context.documentId || value.fingerprint !== context.fingerprint) invalid(); }
export function validateMark(value: unknown, context: CommandContext, bounds: EditEnvironment['pageBounds']): asserts value is EditMark {
  object(value, ['id', 'documentId', 'fingerprint', 'type', 'pageIndex', 'quote', 'quads', 'color', 'note', 'origin', 'retained', 'visible', 'version', 'anchorId', 'placement'], ['points']);
  identifier(value.id); sameSource(value as EditMark, context); page(value.pageIndex, bounds);
  if (!markTypes.includes(value.type)) invalid();
  text(value.quote); text(value.note); color(value.color); validateActor(value.origin); boolean(value.retained); boolean(value.visible); version(value.version);
  if (value.anchorId !== null) identifier(value.anchorId, 200);
  if (textTypes.includes(value.type) && value.anchorId === null) invalid();
  if (['line', 'arrow', 'ink'].includes(value.type) && (value.anchorId !== null || value.quote !== '')) invalid();
  if (value.type === 'note' && value.anchorId === null && value.quote !== '') invalid();
  validateGeometry({ quads: value.quads, ...(Object.hasOwn(value, 'points') ? { points: value.points } : {}) }, value.type, bounds[value.pageIndex]);
  validatePlacement(value.placement, value as EditMark, bounds[value.pageIndex]);
  if (value.type !== 'note' && (value.placement.dx !== 0 || value.placement.dy !== 0)) invalid();
}
export function validateEnvironment(env: unknown, context: CommandContext): asserts env is EditEnvironment {
  object(env, ['actor', 'pageBounds', 'anchors', 'newIds']); validateActor(env.actor);
  if (!Array.isArray(env.pageBounds) || !env.pageBounds.length) invalid();
  for (const b of env.pageBounds) { if (!Array.isArray(b) || b.length !== 4) invalid(); b.forEach(finite); if (b[0] >= b[2] || b[1] >= b[3]) invalid(); }
  if (!Array.isArray(env.anchors) || !Array.isArray(env.newIds)) invalid();
  const anchors = new Set<string>(), ids = new Set<string>();
  for (const a of env.anchors) {
    object(a, ['id', 'documentId', 'fingerprint', 'pageIndex', 'quote', 'quads']); identifier(a.id, 200); sameSource(a as VerifiedAnchor, context); page(a.pageIndex, env.pageBounds); text(a.quote);
    validateGeometry({ quads: a.quads }, 'highlight', env.pageBounds[a.pageIndex]); if (anchors.has(a.id)) invalid(); anchors.add(a.id);
  }
  for (const id of env.newIds) { identifier(id); if (ids.has(id)) invalid(); ids.add(id); }
}
// A trusted (frozen, host-parsed) mark already validated for this document and these page bounds is not validated again.
const validatedFor = new WeakMap<object, string>();
export function validateSnapshot(snapshot: unknown, env: EditEnvironment): asserts snapshot is EditSnapshot {
  object(snapshot, ['context', 'marks', 'versions']); validateContext(snapshot.context);
  if (!Array.isArray(snapshot.marks)) invalid(); object(snapshot.versions, [], Object.keys(snapshot.versions ?? {}));
  for (const [id, v] of Object.entries(snapshot.versions)) { identifier(id); version(v); }
  const ids = new Set<string>(), key = snapshot.context.documentId + '\u0000' + snapshot.context.fingerprint + '\u0000' + JSON.stringify(env.pageBounds);
  for (const m of snapshot.marks) {
    if (!(trustedEditData.has(m) && validatedFor.get(m) === key)) { validateMark(m, snapshot.context, env.pageBounds); if (trustedEditData.has(m)) validatedFor.set(m, key); }
    if (ids.has(m.id) || snapshot.versions[m.id] !== m.version) invalid(); ids.add(m.id);
  }
}
