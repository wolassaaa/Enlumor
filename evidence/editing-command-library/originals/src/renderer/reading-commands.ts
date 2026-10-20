import type{CruiseBlock}from'../shared/cruise';
export type ReadingCommand={type:'show_evidence';block:CruiseBlock}|{type:'clear_focus'}|{type:'pause_session'};
export function executeReadingCommand(command:ReadingCommand,ports:{showEvidence:(block:CruiseBlock)=>void;clearFocus:()=>void;pause:()=>void}):void{
 if(!command||typeof command!=='object')throw Error('READING_COMMAND_INVALID');
 switch(command.type){
 case'show_evidence':if(!command.block||typeof command.block!=='object')throw Error('READING_COMMAND_INVALID');ports.showEvidence(command.block);return;
 case'clear_focus':ports.clearFocus();return;
 case'pause_session':ports.pause();return;
 default:{const unknown:never=command;throw Error('READING_COMMAND_INVALID');}
 }
}

import type { CommandContext, CommandErrorCode, CommandRequest, CommandResult, DocumentCommand, DocumentCommandPorts } from '../shared/document-commands';
import { validateAnnotation } from '../shared/geometry';

const messages: Record<CommandErrorCode, string> = {
 COMMAND_INVALID: 'Invalid document command request.',
 COMMAND_STALE: 'The reading context has changed.',
 COMMAND_CANCELED: 'The document command was canceled.',
 PAGE_OUT_OF_RANGE: 'The requested page is outside the document.',
 EVIDENCE_NOT_FOUND: 'The passage does not exist on the requested page.',
 COMMAND_FAILED: 'The document command could not be completed.'
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
 const own = Reflect.ownKeys(value);
 return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
};
class CommandFailure extends Error {
 constructor(readonly code: CommandErrorCode) { super(messages[code]); }
}
function parseRequest(input: unknown): CommandRequest {
 if (!record(input) || !exactKeys(input, ['requestId', 'context', 'command'])) throw new CommandFailure('COMMAND_INVALID');
 const { requestId, context, command } = input;
 if (!identifier(requestId, 100) || !record(context) || !exactKeys(context, ['documentId', 'fingerprint', 'revision']) || !record(command)) throw new CommandFailure('COMMAND_INVALID');
 const { documentId, fingerprint, revision } = context;
 if (!identifier(documentId, 100) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(fingerprint) || !Number.isSafeInteger(revision) || (revision as number) < 0) throw new CommandFailure('COMMAND_INVALID');
 const { type } = command;
 let parsed: DocumentCommand;
 switch (type) {
 case 'clear_focus': case 'pause':
  if (!exactKeys(command, ['type'])) throw new CommandFailure('COMMAND_INVALID');
  parsed = { type }; break;
 case 'read_page': case 'go_to_page': case 'show_evidence': {
  if (!exactKeys(command, type === 'show_evidence' ? ['type', 'pageIndex', 'passageId'] : ['type', 'pageIndex'])) throw new CommandFailure('COMMAND_INVALID');
  const { pageIndex } = command;
  if (!Number.isSafeInteger(pageIndex)) throw new CommandFailure('COMMAND_INVALID');
  if (type === 'show_evidence') {
   const { passageId } = command;
   if (!identifier(passageId, 200)) throw new CommandFailure('COMMAND_INVALID');
   parsed = { type, pageIndex: pageIndex as number, passageId };
  } else parsed = { type, pageIndex: pageIndex as number };
  break;
 }
 default: throw new CommandFailure('COMMAND_INVALID');
 }
 // Copy primitives before yielding; caller mutation must not retarget an in-flight request.
 return { requestId, context: { documentId, fingerprint, revision: revision as number }, command: parsed };
}
function validatedBlocks(value: unknown, context: CommandContext, pageIndex: number, pageCount: number): CruiseBlock[] {
 if (!Array.isArray(value)) throw new CommandFailure('COMMAND_FAILED');
 const ids = new Set<string>(), blocks: CruiseBlock[] = [];
 // for..of visits sparse slots, unlike the legacy geometry validator's .some.
 for (const raw of value) {
  if (!record(raw)) throw new CommandFailure('COMMAND_FAILED');
  const { id, documentId, fingerprint, pageIndex: sourcePage, quote, quads: sourceQuads } = raw;
  if (!identifier(id, 200) || ids.has(id) || documentId !== context.documentId || fingerprint !== context.fingerprint || sourcePage !== pageIndex || !Array.isArray(sourceQuads)) throw new CommandFailure('COMMAND_FAILED');
  const quads: number[][] = [];
  for (const quad of sourceQuads) {
   if (!Array.isArray(quad)) throw new CommandFailure('COMMAND_FAILED');
   const points = Array.from(quad);
   if (points.some(point => typeof point !== 'number' || !Number.isFinite(point))) throw new CommandFailure('COMMAND_FAILED');
   quads.push(points);
  }
  const block = { id, documentId, fingerprint, pageIndex: sourcePage, quote, quads };
  // Reuse the native geometry/page/text checks without imposing annotation ID syntax on passage IDs.
  validateAnnotation({ ...block, id: 'command-evidence', type: 'highlight', author: 'user', color: '#ffff00', note: '' }, pageCount);
  ids.add(id);
  blocks.push(block as CruiseBlock);
 }
 return blocks;
}

export async function runDocumentCommand(input: unknown, ports: DocumentCommandPorts, signal: AbortSignal): Promise<CommandResult> {
 let requestId = '', request: CommandRequest;
 const failed = (code: CommandErrorCode): CommandResult => ({ requestId, ok: false, error: { code, message: messages[code] } });
 try {
  request = parseRequest(input);
  requestId = request.requestId;
 } catch {
  // Preserve a usable correlation ID even when another field failed parsing.
  try { const candidate = record(input) ? input.requestId : null; if (identifier(candidate, 100)) requestId = candidate; } catch { /* no usable ID */ }
  return failed('COMMAND_INVALID');
 }
 const currentFailure = (): CommandErrorCode | null => {
  if (signal.aborted) return 'COMMAND_CANCELED';
  const latest = ports.getContext(), expected = request.context;
  return !latest || latest.documentId !== expected.documentId || latest.fingerprint !== expected.fingerprint || latest.revision !== expected.revision ? 'COMMAND_STALE' : null;
 };
 const check = () => { const code = currentFailure(); if (code) throw new CommandFailure(code); };
 const isCurrent = () => { try { return currentFailure() === null; } catch { return false; } };
 const succeeded = (result: Extract<CommandResult, { ok: true }>['result']): CommandResult => ({ requestId, ok: true, result });
 try {
  check();
  const command = request.command;
  switch (command.type) {
  case 'pause':
   check(); ports.pause();
   // Pause can invalidate revision/abort old work itself; it has already completed.
   return succeeded({ kind: 'paused' });
  case 'clear_focus':
   check(); ports.clearFocus(); check(); return succeeded({ kind: 'cleared' });
  default: {
   const pageCount = ports.getPageCount();
   if (!Number.isSafeInteger(pageCount) || pageCount <= 0) throw new CommandFailure('COMMAND_FAILED');
   check();
   if (command.pageIndex < 0 || command.pageIndex >= pageCount) throw new CommandFailure('PAGE_OUT_OF_RANGE');
   if (command.type === 'go_to_page') {
    check(); await ports.navigate(command.pageIndex, isCurrent); check();
    return succeeded({ kind: 'navigated', pageIndex: command.pageIndex });
   }
   check(); const page = await ports.readPage(command.pageIndex); check();
   const blocks = validatedBlocks(page, request.context, command.pageIndex, pageCount);
   check();
   if (command.type === 'read_page') return succeeded({ kind: 'page', blocks });
   const block = blocks.find(candidate => candidate.id === command.passageId);
   if (!block) throw new CommandFailure('EVIDENCE_NOT_FOUND');
   check(); await ports.focus(block, isCurrent); check();
   return succeeded({ kind: 'focused', pageIndex: command.pageIndex, passageId: command.passageId });
  }
  }
 } catch (error) {
  // Cancellation/source changes also dominate a rejected asynchronous port.
  try { const code = currentFailure(); if (code) return failed(code); } catch { return failed('COMMAND_FAILED'); }
  return failed(error instanceof CommandFailure ? error.code : 'COMMAND_FAILED');
 }
}
