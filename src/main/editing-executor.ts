import { createHash } from 'node:crypto';
import type { CommandContext } from '../shared/document-commands';
import type { EditActor, EditDelta, EditEnvironment, EditErrorCode, EditExportSnapshot, EditMark, EditRequest, EditSnapshot, PreparedEdit, PreparedEditBase, VerifiedAnchor } from '../shared/editing-commands';
import { copyEditData, EditValidationError, identifier, invalid, object, validateActor, validateContext, validateMark } from '../shared/editing-marks';
import { canonicalDigest, prepareEdit } from '../shared/editing-planner';

export type RuntimeEditError = EditErrorCode | 'EDIT_CANCELED' | 'CONFIRMATION_REQUIRED' | 'CONFIRMATION_INVALID' | 'REQUEST_ID_REUSED' | 'COMMIT_UNCERTAIN' | 'STORE_BUSY' | 'EDIT_FAILED' | 'UNSUPPORTED';
type Failure = { status: 'conflict' | 'canceled' | 'unsupported' | 'error'; error: { code: RuntimeEditError; message: string } };
export type CommittedEdit = {
  status: 'committed'; documentId: string; fingerprint: string; operationId: string; receiptId: string; versions: Record<string, number>;
};
export type ConfirmationBinding = { requestKey: string; context: CommandContext; actor: EditActor; digest: string; deltas: EditDelta[] };
export type EditConfirmation = ConfirmationBinding & { id: string; consumed: boolean };
export type EditResult = Failure | CommittedEdit
  | { status: 'read'; read: EditMark | EditMark[] }
  | { status: 'prepared'; deltas: EditDelta[] }
  | { status: 'prepared'; exportSnapshot: EditExportSnapshot }
  | { status: 'confirmation_required'; confirmation: ConfirmationBinding; error: { code: 'CONFIRMATION_REQUIRED'; message: string } };
export type EditReceipt = { requestKey: string; requestDigest: string; result: CommittedEdit };
export type EditOperation = {
  operationId: string; context: CommandContext; actor: EditActor; action: 'edit' | 'undo' | 'redo'; targetOperationId: string | null;
  deltas: EditDelta[]; inverse: EditDelta[]; state: 'applied' | 'undone'; redoEligible: boolean; redoActor: EditActor | null; currentVersions: Record<string, number>;
};
export type HistoryWrite = { operation: EditOperation; target?: EditOperation; clearRedoFor?: EditActor };
export type EditTransaction = {
  readSnapshot(context: CommandContext, ids?: readonly string[]): EditSnapshot;
  readReceipt(requestKey: string): EditReceipt | null;
  readOperation(context: CommandContext, operationId: string): EditOperation | null;
  readConfirmation(id: string): EditConfirmation | null;
  writeDeltas(context: CommandContext, deltas: EditDelta[]): void;
  writeHistory(write: HistoryWrite): void;
  writeReceipt(receipt: EditReceipt): void;
  consumeConfirmation(id: string): void;
};
/**
 * Only a host that actually commits all tx writes durably may implement transaction.
 * The callback is synchronous: isolate reads+writes, rollback on any thrown error,
 * and COMMIT immediately on return, without awaiting or calling external code first.
 * Report an indeterminate transaction outcome as code COMMIT_UNCERTAIN; never retry it
 * inside the host. Read ports are side-effect-free, including receipt recovery.
 * Source/actor changes must invalidate getContext().revision. No UI effects live here.
 * readSnapshot ids: every requested mark/version must be present; a host may ignore ids
 * and return the whole snapshot, which plans identically for valid stored marks (a scoped
 * read no longer lets an unrelated invalid row fail a targeted edit; whole-page commands still do).
 */
export type EditHost = {
  getContext(): CommandContext | null;
  getActor(): EditActor;
  getPageBounds(): EditEnvironment['pageBounds'];
  resolveAnchors(context: CommandContext): readonly VerifiedAnchor[] | Promise<readonly VerifiedAnchor[]>;
  allocateIds(requestKey: string, count: number): readonly string[];
  readSnapshot(context: CommandContext, ids?: readonly string[]): EditSnapshot;
  readReceipt(requestKey: string): EditReceipt | null;
  readOperation(context: CommandContext, operationId: string): EditOperation | null;
  getConfirmation(binding: ConfirmationBinding): string | null | Promise<string | null>;
  transaction<T>(body: (tx: EditTransaction) => T): T;
};
class ExecutionError extends Error { constructor(readonly code: RuntimeEditError) { super(code); } }
function fail(code: RuntimeEditError): never { throw new ExecutionError(code); }
const same = (a: unknown, b: unknown) => canonicalDigest(a) === canonicalDigest(b);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
/** Same requestKey and ordinal always produce the same ID, including preview retries. */
export function deriveEditingIds(requestKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => 'mark-' + sha(`${requestKey}:${i}`));
}
function failure(error: unknown): Failure {
  let code: RuntimeEditError = 'EDIT_FAILED';
  if (error instanceof ExecutionError || error instanceof EditValidationError) code = error.code;
  else if (error && typeof error === 'object') {
    const e = error as { code?: string; errcode?: number };
    if (e.code === 'COMMIT_UNCERTAIN') code = 'COMMIT_UNCERTAIN';
    else if (e.code === 'SQLITE_BUSY' || e.code === 'SQLITE_LOCKED' || e.errcode === 5 || e.errcode === 6) code = 'STORE_BUSY';
  }
  const status = code === 'EDIT_CANCELED' ? 'canceled' : code === 'UNSUPPORTED' ? 'unsupported'
    : ['EDIT_STALE','VERSION_CONFLICT','REQUEST_ID_REUSED','CONFIRMATION_INVALID','BATCH_CONFLICT'].includes(code) ? 'conflict' : 'error';
  return { status, error: { code, message: code } };
}
/** Stable replay normalization excludes reading revision and never inspects untrusted getters. */
function identity(input: unknown, actorInput: EditActor) {
  const request = copyEditData(input); object(request, ['requestId','context','command']); identifier(request.requestId); validateContext(request.context);
  const actor = copyEditData(actorInput); validateActor(actor);
  const command = copyEditData(request.command);
  function normalize(c: unknown) {
    object(c,['type'],['id','expectedVersion','patch','geometry','placement','anchorId','markType','pageIndex','color','note','targets','visible','retained','from','to','radius','operations','operationId','selection','snapshotId']);
    if (Array.isArray(c.targets) && c.targets.every(t=>typeof t?.id === 'string')) c.targets.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (c.type === 'apply_edit_batch' && Array.isArray(c.operations)) c.operations.forEach(normalize);
    if (c.type === 'prepare_mark_export' && c.selection && typeof c.selection === 'object') {
      if (Array.isArray(c.selection.origins) && c.selection.origins.every((v: unknown)=>typeof v === 'string')) c.selection.origins.sort();
      if (Array.isArray(c.selection.ids) && c.selection.ids.every((v: unknown)=>typeof v === 'string')) c.selection.ids.sort();
    }
  }
  normalize(command);
  const requestKey = canonicalDigest({documentId:request.context.documentId,fingerprint:request.context.fingerprint,actor,requestId:request.requestId});
  return { request: request as EditRequest, actor, requestKey, requestDigest: canonicalDigest({command}) };
}
function replay(receipt: EditReceipt | null, digest: string): CommittedEdit | null {
  if (!receipt) return null;
  if (receipt.requestDigest !== digest) fail('REQUEST_ID_REUSED');
  return copyEditData(receipt.result);
}
/** No context/page revision or signal check may erase the fact of an existing durable commit. */
export async function queryEditingReceipt(input: unknown, host: EditHost): Promise<EditResult | null> {
  try { const i = identity(input,host.getActor()); return replay(host.readReceipt(i.requestKey),i.requestDigest); }
  catch (e) { return failure(e); }
}
function checkCurrent(host: EditHost, context: CommandContext, actor: EditActor, signal: AbortSignal) {
  if (signal.aborted) fail('EDIT_CANCELED');
  if (!same(host.getContext(),context) || !same(host.getActor(),actor)) fail('EDIT_STALE');
}
function creationCount(command: EditRequest['command']): number {
  if (command.type === 'create_mark') return 1;
  if (command.type === 'apply_edit_batch' && Array.isArray(command.operations)) return Math.min(64,command.operations.filter(op=>op.type === 'create_mark').length);
  return 0;
}
type MutationPlan = PreparedEditBase & { kind: 'prepared'; deltas: EditDelta[]; inverse: EditDelta[]; target?: EditOperation };
function inverse(deltas: EditDelta[]): EditDelta[] {
  return [...deltas].reverse().map(d=>({id:d.id,expectedVersion:d.expectedVersion+1,before:copyEditData(d.after),after:copyEditData(d.before)}));
}
function prepareHistory(p: Extract<PreparedEdit,{ok:true}>, snapshot: EditSnapshot, env: EditEnvironment, read: (context: CommandContext,id: string)=>EditOperation|null): MutationPlan {
  if (p.kind !== 'history') throw Error('not history');
  const original = copyEditData(read(p.context,p.history.operationId));
  if (!original || !same(original.context.documentId,p.context.documentId) || original.context.fingerprint !== p.context.fingerprint) fail('MARK_NOT_FOUND');
  const undo = p.history.type === 'undo_edit';
  if (original.action !== 'edit' || (undo ? original.state !== 'applied' : original.state !== 'undone' || !original.redoEligible)) fail('VERSION_CONFLICT');
  const marks = new Map(snapshot.marks.map(m=>[m.id,m]));
  const dependencies: Record<string,number> = {};
  const deltas = (undo ? [...original.deltas].reverse() : original.deltas).map(d=>{
    const v = snapshot.versions[d.id] ?? 0;
    if (v !== original.currentVersions[d.id] || v >= Number.MAX_SAFE_INTEGER) fail('VERSION_CONFLICT');
    dependencies[d.id]=v;
    const content = undo ? d.before : d.after;
    const after = content ? {...copyEditData(content),version:v+1} : null;
    if (after) validateMark(after,p.context,env.pageBounds);
    return {id:d.id,expectedVersion:v,before:copyEditData(marks.get(d.id) ?? null),after};
  });
  const protectedActor = env.actor.kind === 'ai' && (!same(original.actor,env.actor) || !undo && !same(original.redoActor,env.actor));
  const protectedContent = env.actor.kind === 'ai' && deltas.some(d=>[d.before,d.after].some(m=>m && (m.retained || !same(m.origin,env.actor))));
  const requiresConfirmation = protectedActor || protectedContent;
  return {...p,kind:'prepared',dependencies,requiresConfirmation,deltas,inverse:inverse(deltas),target:original,
    digest:canonicalDigest({context:p.context,actor:p.actor,command:p.command,dependencies,deltas,target:original,requiresConfirmation})};
}
function prepare(input: EditRequest, snapshot: EditSnapshot, env: EditEnvironment, read: EditHost['readOperation']): Exclude<PreparedEdit, { kind: 'prepared' }> | MutationPlan {
  const p = prepareEdit(input,snapshot,env);
  return p.ok && p.kind === 'history' ? prepareHistory(p,snapshot,env,read) : p;
}
/**
 * Targeted commands plan only from their own ids (get/depend/history), so a dense page need
 * not be read and copied whole. erase/list/export and any unrecognized shape stay whole (undefined).
 */
function snapshotScope(command: EditRequest['command'], newIds: readonly string[], context: CommandContext, read: EditHost['readOperation']): string[] | undefined {
  const ids = new Set<string>(newIds);
  const add = (id: unknown) => typeof id === 'string' && !!ids.add(id);
  function visit(c: any): boolean {
    switch (c?.type) {
      case 'create_mark': return true;
      case 'get_mark': case 'update_mark': case 'set_mark_geometry': case 'set_mark_placement': case 'replace_mark_anchor': return add(c.id);
      case 'delete_marks': case 'set_marks_visibility': case 'set_marks_retention': return Array.isArray(c.targets) && c.targets.every((t: any) => add(t?.id));
      case 'apply_edit_batch': return Array.isArray(c.operations) && c.operations.every(visit);
      case 'undo_edit': case 'redo_edit': {
        const op = typeof c.operationId === 'string' ? read(context,c.operationId) : null;
        return !!op && Array.isArray(op.deltas) && op.deltas.every(d => add(d?.id));
      }
      default: return false;
    }
  }
  return visit(command) ? [...ids].sort() : undefined;
}
function binding(plan: MutationPlan, requestKey: string): ConfirmationBinding {
  return copyEditData({requestKey,context:plan.context,actor:plan.actor,digest:plan.digest,deltas:plan.deltas});
}
function verifyConfirmation(tx: EditTransaction, token: string | null, expected: ConfirmationBinding) {
  if (token === null) fail('CONFIRMATION_INVALID'); identifier(token);
  const c = copyEditData(tx.readConfirmation(token));
  if (!c || c.consumed || c.id !== token || !same({requestKey:c.requestKey,context:c.context,actor:c.actor,digest:c.digest,deltas:c.deltas},expected)) fail('CONFIRMATION_INVALID');
}

/** Library execution only: no production Workspace, IPC, PDF writer or UI integration. */
export async function runEditingCommand(input: unknown, host: EditHost, signal: AbortSignal): Promise<EditResult> {
  let key: string | null = null, digest: string | null = null;
  try {
    const i = identity(input,host.getActor()); key=i.requestKey; digest=i.requestDigest;
    const existing = replay(host.readReceipt(key),digest); if (existing) return existing;
    checkCurrent(host,i.request.context,i.actor,signal);
    const context=copyEditData(i.request.context), actor=i.actor;
    const anchors = copyEditData(await host.resolveAnchors(copyEditData(context)));
    checkCurrent(host,context,actor,signal);
    const count=creationCount(i.request.command);
    const ids=count ? copyEditData(host.allocateIds(key,count)) : [];
    if (!same(ids,deriveEditingIds(key,count))) invalid();
    const env: EditEnvironment = {actor:copyEditData(actor),pageBounds:copyEditData(host.getPageBounds()),anchors,newIds:ids};
    const read: EditHost['readOperation']=(c,id)=>host.readOperation(c,id);
    const preview=prepare(i.request,host.readSnapshot(context,snapshotScope(i.request.command,ids,context,read)),env,read);
    if (!preview.ok) return failure(new ExecutionError(preview.error.code));
    checkCurrent(host,context,actor,signal);
    if (preview.kind === 'read') return {status:'read',read:copyEditData(preview.read)};
    if (preview.kind === 'export_snapshot') return {status:'prepared',exportSnapshot:copyEditData(preview.exportSnapshot)};
    if (preview.kind === 'export_request') return failure(new ExecutionError('UNSUPPORTED'));
    if (preview.kind !== 'prepared') throw Error('unresolved history');
    if (!preview.deltas.length) return {status:'prepared',deltas:[]};
    const candidate=binding(preview,key);
    const token=preview.requiresConfirmation ? await host.getConfirmation(copyEditData(candidate)) : null;
    checkCurrent(host,context,actor,signal);
    if (preview.requiresConfirmation && token === null) return {status:'confirmation_required',confirmation:candidate,error:{code:'CONFIRMATION_REQUIRED',message:'Explicit confirmation of these differences is required.'}};
    return host.transaction(tx=>{
      // A winner may have committed while this caller was resolving anchors/approval.
      const prior=replay(tx.readReceipt(i.requestKey),i.requestDigest); if (prior) return prior;
      checkCurrent(host,context,actor,signal);
      const txRead: EditHost['readOperation']=(c,id)=>tx.readOperation(c,id);
      const current=prepare(i.request,tx.readSnapshot(context,snapshotScope(i.request.command,ids,context,txRead)),env,txRead);
      if (!current.ok) fail(current.error.code);
      if (current.kind !== 'prepared' || current.digest !== preview.digest) fail('VERSION_CONFLICT');
      if (!same(host.getPageBounds(),env.pageBounds)) fail('EDIT_STALE');
      if (current.requiresConfirmation) verifyConfirmation(tx,token,binding(current,i.requestKey));
      checkCurrent(host,context,actor,signal);
      const versions=Object.fromEntries(current.deltas.map(d=>[d.id,d.expectedVersion+1]));
      const operationId='op-'+sha(i.requestKey), receiptId='receipt-'+sha(i.requestKey);
      const target=current.target ? {...copyEditData(current.target),state:current.command.type === 'undo_edit' ? 'undone' as const : 'applied' as const,currentVersions:copyEditData(versions),redoActor:current.command.type === 'undo_edit' ? copyEditData(actor) : null} : undefined;
      const action=current.command.type === 'undo_edit' ? 'undo' : current.command.type === 'redo_edit' ? 'redo' : 'edit';
      const operation: EditOperation = {operationId,context:copyEditData(context),actor:copyEditData(actor),action,targetOperationId:target?.operationId ?? null,
        deltas:copyEditData(current.deltas),inverse:copyEditData(current.inverse),state:'applied',redoEligible:action === 'edit',redoActor:null,currentVersions:copyEditData(versions)};
      const result: CommittedEdit={status:'committed',documentId:context.documentId,fingerprint:context.fingerprint,operationId,receiptId,versions};
      tx.writeDeltas(context,copyEditData(current.deltas));
      tx.writeHistory({operation,...(target ? {target} : {}),...(action === 'edit' ? {clearRedoFor:copyEditData(actor)} : {})});
      tx.writeReceipt({requestKey:i.requestKey,requestDigest:i.requestDigest,result:copyEditData(result)});
      if (current.requiresConfirmation) tx.consumeConfirmation(token!);
      // Last pre-COMMIT gate: a late abort/actor/document change throws through rollback.
      checkCurrent(host,context,actor,signal);
      return result;
    });
  } catch (error) {
    // Never redo an indeterminate commit. Consult durable truth once, even after abort/switch.
    if (key !== null && digest !== null) {
      try { const receipt=replay(host.readReceipt(key),digest); if (receipt) return receipt; }
      catch (recoveryError) {
        if (recoveryError instanceof ExecutionError && recoveryError.code === 'REQUEST_ID_REUSED') return failure(recoveryError);
        return failure(new ExecutionError('COMMIT_UNCERTAIN'));
      }
    }
    return failure(error);
  }
}
