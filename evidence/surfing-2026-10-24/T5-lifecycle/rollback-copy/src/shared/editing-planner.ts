import { createHash } from 'node:crypto';
import { strokeIntersectsEraser } from './geometry';
import type { EditCommand, EditDelta, EditEnvironment, EditMark, EditMutation, EditRequest, EditSnapshot, PreparedEdit, PreparedEditBase } from './editing-commands';
import { boolean, color, copyEditData, EditValidationError, finite, identifier, inBounds, invalid, markTypes, object, page, text, textTypes, validateContext, validateEnvironment, validateGeometry, validateMark, validatePlacement, validateSnapshot, version } from './editing-marks';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const markOrder = (a: EditMark, b: EditMark) => a.pageIndex - b.pageIndex || compare(a.id, b.id);
/** Synchronous Node-side digest. No DOM/Electron dependency or cryptographic reimplementation. */
export function canonicalDigest(value: unknown): string {
  function encode(v: any): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) {
      let numeric = true;
      // Once-only, left-to-right reads, as in the original encoder. Dense numeric
      // geometry has no object keys to sort; native JSON emits identical bytes.
      const parts = v.map(item => {
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        numeric = false; return encode(item);
      });
      return numeric && Object.keys(parts).length === parts.length ? JSON.stringify(parts) : `[${parts.join(',')}]`;
    }
    return `{${Object.keys(v).sort(compare).map(key => `${JSON.stringify(key)}:${encode(v[key])}`).join(',')}}`;
  }
  return createHash('sha256').update(encode(value)).digest('hex');
}
function target(value: unknown) { object(value, ['id', 'expectedVersion']); identifier(value.id); version(value.expectedVersion); }
function targets(value: unknown) {
  if (!Array.isArray(value) || !value.length) invalid();
  if (value.length > 1000) invalid('EDIT_TOO_LARGE');
  const ids = new Set<string>();
  for (const t of value) { target(t); if (ids.has(t.id)) invalid(); ids.add(t.id); }
  value.sort((a, b) => compare(a.id, b.id));
}
function parseCommand(value: unknown, env: EditEnvironment, mutationOnly = false): EditCommand {
  object(value, ['type'], ['id', 'expectedVersion', 'patch', 'geometry', 'placement', 'anchorId', 'markType', 'pageIndex', 'color', 'note', 'targets', 'visible', 'retained', 'from', 'to', 'radius', 'operations', 'operationId', 'selection', 'snapshotId']);
  const c = value;
  switch (c.type) {
    case 'create_mark': {
      object(c, ['type', 'markType', 'pageIndex', 'color', 'note'], ['anchorId', 'geometry']);
      if (!markTypes.includes(c.markType)) invalid(); page(c.pageIndex, env.pageBounds); color(c.color); text(c.note);
      if (Object.hasOwn(c, 'anchorId')) identifier(c.anchorId, 200);
      if (textTypes.includes(c.markType) || c.markType === 'note' && Object.hasOwn(c, 'anchorId')) {
        if (!Object.hasOwn(c, 'anchorId') || Object.hasOwn(c, 'geometry')) invalid();
      } else { if (Object.hasOwn(c, 'anchorId') || !Object.hasOwn(c, 'geometry')) invalid(); validateGeometry(c.geometry, c.markType, env.pageBounds[c.pageIndex]); }
      break;
    }
    case 'update_mark':
      object(c, ['type', 'id', 'expectedVersion', 'patch']); target({ id: c.id, expectedVersion: c.expectedVersion }); object(c.patch, [], ['color', 'note']);
      if (!Object.keys(c.patch).length) invalid(); if (Object.hasOwn(c.patch, 'color')) color(c.patch.color); if (Object.hasOwn(c.patch, 'note')) text(c.patch.note); break;
    case 'set_mark_geometry': case 'set_mark_placement': case 'replace_mark_anchor': {
      const field = c.type === 'set_mark_geometry' ? 'geometry' : c.type === 'set_mark_placement' ? 'placement' : 'anchorId';
      object(c, ['type', 'id', 'expectedVersion', field]); target({ id: c.id, expectedVersion: c.expectedVersion });
      if (field === 'anchorId') identifier(c.anchorId, 200);
      else if (field === 'geometry') object(c.geometry, ['quads'], ['points']);
      else { object(c.placement, ['dx', 'dy']); finite(c.placement.dx); finite(c.placement.dy); }
      break;
    }
    case 'delete_marks': object(c, ['type', 'targets']); targets(c.targets); break;
    case 'set_marks_visibility': object(c, ['type', 'targets', 'visible']); targets(c.targets); boolean(c.visible); break;
    case 'set_marks_retention': object(c, ['type', 'targets', 'retained']); targets(c.targets); boolean(c.retained); break;
    case 'erase_ink':
      object(c, ['type', 'pageIndex', 'from', 'to', 'radius']); page(c.pageIndex, env.pageBounds); finite(c.radius); if (c.radius <= 0) invalid();
      for (const point of [c.from, c.to]) { if (!Array.isArray(point) || point.length !== 2) invalid(); point.forEach(finite); if (!inBounds(point[0], point[1], env.pageBounds[c.pageIndex])) invalid(); }
      break;
    default:
      if (mutationOnly) invalid();
      switch (c.type) {
        case 'list_marks': object(c, ['type']); break;
        case 'get_mark': object(c, ['type', 'id']); identifier(c.id); break;
        case 'undo_edit': case 'redo_edit': object(c, ['type', 'operationId']); identifier(c.operationId); break;
        case 'export_marked_pdf': object(c, ['type', 'snapshotId']); identifier(c.snapshotId); break;
        case 'apply_edit_batch':
          object(c, ['type', 'operations']); if (!Array.isArray(c.operations) || !c.operations.length) invalid(); if (c.operations.length > 64) invalid('EDIT_TOO_LARGE');
          c.operations = c.operations.map((op: unknown) => parseCommand(op, env, true)); break;
        case 'prepare_mark_export': {
          object(c, ['type', 'selection']); const s = c.selection; object(s, ['origins', 'ids', 'includeHidden']); boolean(s.includeHidden);
          if (!Array.isArray(s.origins) || !s.origins.length || s.origins.some((kind: unknown) => kind !== 'user' && kind !== 'ai') || new Set(s.origins).size !== s.origins.length) invalid(); s.origins.sort(compare);
          if (s.ids !== null) { if (!Array.isArray(s.ids)) invalid(); if (s.ids.length > 1000) invalid('EDIT_TOO_LARGE'); const ids = new Set<string>(); for (const id of s.ids) { identifier(id); if (ids.has(id)) invalid(); ids.add(id); } s.ids.sort(compare); }
          break;
        }
        default: invalid();
      }
  }
  return c as EditCommand;
}

/** Pure planning: neither this function nor any success branch writes marks/history/receipts. */
export function prepareEdit(input: unknown, snapshot: EditSnapshot, env: EditEnvironment): PreparedEdit {
  try {
    const r = copyEditData(input), s = copyEditData(snapshot), e = copyEditData(env);
    object(r, ['requestId', 'context', 'command']); identifier(r.requestId); validateContext(r.context);
    object(s, ['context', 'marks', 'versions']); validateContext(s.context);
    if (r.context.documentId !== s.context.documentId || r.context.fingerprint !== s.context.fingerprint || r.context.revision !== s.context.revision) invalid('EDIT_STALE');
    validateEnvironment(e, s.context); validateSnapshot(s, e);
    const command = parseCommand(r.command, e), request = r as EditRequest;
    const marks = new Map(s.marks.map(m => [m.id, m])), anchors = new Map(e.anchors.map(a => [a.id, a]));
    const dependencies = new Map<string, number>(), touched = new Set<string>(), deltas: EditDelta[] = [];
    let nextId = 0, requiresConfirmation = false;
    function depend(id: string) { dependencies.set(id, Object.hasOwn(s.versions, id) ? s.versions[id] : 0); }
    function get(id: string, expectedVersion?: number): EditMark {
      if (touched.has(id)) invalid('BATCH_CONFLICT');
      const m = marks.get(id); if (!m) invalid('MARK_NOT_FOUND'); depend(id);
      if (expectedVersion !== undefined && m.version !== expectedVersion) invalid('VERSION_CONFLICT'); return m;
    }
    function touch(id: string) { if (touched.has(id)) invalid('BATCH_CONFLICT'); touched.add(id); }
    function anchor(id: string) { const a = anchors.get(id); if (!a) invalid('ANCHOR_NOT_FOUND'); return a; }
    function add(before: EditMark | null, after: EditMark | null, id: string) {
      touch(id); depend(id);
      if (canonicalDigest(before) === canonicalDigest(after)) return;
      if (before && e.actor.kind === 'ai' && (before.retained || before.origin.kind !== 'ai' || before.origin.id !== e.actor.id || before.origin.sessionId !== e.actor.sessionId)) requiresConfirmation = true;
      const expectedVersion = before?.version ?? (Object.hasOwn(s.versions, id) ? s.versions[id] : 0);
      if (expectedVersion >= Number.MAX_SAFE_INTEGER) invalid('VERSION_CONFLICT');
      if (after) { after = copyEditData(after); after.version = expectedVersion + 1; validateMark(after, s.context, e.pageBounds); }
      deltas.push({ id, expectedVersion, before: before ? copyEditData(before) : null, after });
    }
    function mutate(c: EditMutation) {
      switch (c.type) {
        case 'create_mark': {
          const id = e.newIds[nextId++]; if (id === undefined) invalid(); if (marks.has(id) || Object.hasOwn(s.versions, id) && s.versions[id] !== 0) invalid('VERSION_CONFLICT');
          let pageIndex = c.pageIndex, quote = '', anchorId: string | null = null, geometry = c.geometry;
          if (c.anchorId !== undefined) { const a = anchor(c.anchorId); if (a.pageIndex !== c.pageIndex) invalid(); pageIndex = a.pageIndex; quote = a.quote; anchorId = a.id; geometry = { quads: copyEditData(a.quads) }; }
          add(null, { id, documentId: s.context.documentId, fingerprint: s.context.fingerprint, type: c.markType, pageIndex, quote, ...copyEditData(geometry!), color: c.color, note: c.note, origin: copyEditData(e.actor), retained: false, visible: true, version: 1, anchorId, placement: { dx: 0, dy: 0 } }, id); break;
        }
        case 'update_mark': { const m = get(c.id, c.expectedVersion); add(m, { ...copyEditData(m), ...c.patch }, m.id); break; }
        case 'set_mark_geometry': {
          const m = get(c.id, c.expectedVersion); if (textTypes.includes(m.type) || m.type === 'note' && m.anchorId !== null) invalid();
          validateGeometry(c.geometry, m.type, e.pageBounds[m.pageIndex]); const after = copyEditData(m); delete after.points; Object.assign(after, c.geometry); add(m, after, m.id); break;
        }
        case 'set_mark_placement': {
          const m = get(c.id, c.expectedVersion); if (m.type !== 'note') invalid('UNSUPPORTED_PLACEMENT'); validatePlacement(c.placement, m, e.pageBounds[m.pageIndex]); add(m, { ...copyEditData(m), placement: copyEditData(c.placement) }, m.id); break;
        }
        case 'replace_mark_anchor': {
          const m = get(c.id, c.expectedVersion); if (!textTypes.includes(m.type) && m.type !== 'note') invalid(); const a = anchor(c.anchorId);
          add(m, { ...copyEditData(m), anchorId: a.id, pageIndex: a.pageIndex, quote: a.quote, quads: copyEditData(a.quads) }, m.id); break;
        }
        case 'delete_marks': case 'set_marks_visibility': case 'set_marks_retention':
          for (const t of c.targets) { const m = get(t.id, t.expectedVersion); add(m, c.type === 'delete_marks' ? null : { ...copyEditData(m), ...(c.type === 'set_marks_visibility' ? { visible: c.visible } : { retained: c.retained }) }, m.id); } break;
        case 'erase_ink':
          for (const m of [...marks.values()].sort(markOrder)) if (m.type === 'ink' && m.pageIndex === c.pageIndex) {
            depend(m.id);
            if (m.visible && strokeIntersectsEraser(m.points!, [1, 0, 0, 1, 0, 0], c.from, c.to, c.radius)) add(m, null, m.id);
          } break;
      }
    }
    let payload: any;
    switch (command.type) {
      case 'list_marks': {
        const read = [...marks.values()].sort(markOrder); read.forEach(m => depend(m.id)); payload = { kind: 'read', read }; break;
      }
      case 'get_mark': payload = { kind: 'read', read: get(command.id) }; break;
      case 'undo_edit': case 'redo_edit': payload = { kind: 'history', history: { type: command.type, operationId: command.operationId } }; break;
      case 'export_marked_pdf': payload = { kind: 'export_request', exportRequest: { snapshotId: command.snapshotId } }; break;
      case 'prepare_mark_export': {
        const selection = command.selection;
        if (selection.ids) selection.ids.forEach(id => { get(id); });
        const selected = [...marks.values()].filter(m => selection.origins.includes(m.origin.kind) && (selection.includeHidden || m.visible) && (selection.ids === null || selection.ids.includes(m.id))).sort(markOrder);
        // Include all candidate versions: hidden/origin filtering is itself a dependency.
        for (const m of marks.values()) if (selection.ids === null || selection.ids.includes(m.id)) depend(m.id);
        const versions = Object.fromEntries(selected.map(m => [m.id, m.version]));
        const content = { context: s.context, marks: selected, versions };
        payload = { kind: 'export_snapshot', exportSnapshot: { ...content, digest: canonicalDigest(content) } }; break;
      }
      default:
        if (command.type === 'apply_edit_batch') command.operations.forEach(mutate); else mutate(command);
        payload = { kind: 'prepared', deltas, inverse: [...deltas].reverse().map(d => ({ id: d.id, expectedVersion: d.expectedVersion + 1, before: d.after, after: d.before })) };
    }
    const dependencyRecord = Object.fromEntries([...dependencies].sort(([a], [b]) => compare(a, b)));
    const base: PreparedEditBase = { ok: true, requestId: request.requestId, context: copyEditData(s.context), actor: copyEditData(e.actor), command: copyEditData(command), dependencies: dependencyRecord, requiresConfirmation, digest: canonicalDigest({ context: s.context, actor: e.actor, command, dependencies: dependencyRecord, payload }) };
    // Clone each branch separately: inverse/before/after must not alias each other either.
    if (payload.kind === 'prepared') return { ...base, kind: 'prepared', deltas: deltas.map(d => ({ ...d, before: d.before ? copyEditData(d.before) : null, after: d.after ? copyEditData(d.after) : null })), inverse: payload.inverse.map((d: EditDelta) => ({ ...d, before: d.before ? copyEditData(d.before) : null, after: d.after ? copyEditData(d.after) : null })) };
    return { ...base, ...copyEditData(payload) } as PreparedEdit;
  } catch (error) {
    const failure = error instanceof EditValidationError ? error : new EditValidationError('EDIT_INVALID');
    return { ok: false, error: { code: failure.code, message: failure.message } };
  }
}
