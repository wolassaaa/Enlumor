import type { OpenedDocument } from '../shared/model';
import type { DocumentCommand, DocumentCommandPorts } from '../shared/document-commands';
import type { PdfReader } from './pdf-reader';
import { runDocumentCommand } from './reading-commands';

/** A thin host for the mounted reader. Getters deliberately read the latest refs,
 * including callbacks installed once at mount, rather than closing over a PDF. */
export function createReaderCommandHost(getReader: () => PdfReader | null, getDocument: () => OpenedDocument | null) {
 let revision = 0, requestId = 0, cancellation = new AbortController();
 const getContext = () => {
  const document = getDocument();
  return document ? { documentId: document.id, fingerprint: document.fingerprint, revision } : null;
 };
 function invalidate() {
  revision++; cancellation.abort(); cancellation = new AbortController();
  getReader()?.clearCruiseFocus();
 }
 const ports: DocumentCommandPorts = {
  getContext: () => getReader() ? getContext() : null,
  getPageCount: () => getDocument()?.pageCount || 0,
  readPage: pageIndex => {
   const reader = getReader(); if (!reader) throw Error('READER_NOT_READY');
   return reader.readPageBlocks(pageIndex);
  },
  navigate: async (pageIndex, isCurrent) => {
   if (isCurrent()) getReader()?.go(pageIndex + 1, isCurrent);
  },
  focus: async (block, isCurrent) => {
   if (isCurrent()) await getReader()?.locateCruiseBlock(block, isCurrent);
  },
  clearFocus: () => { getReader()?.clearCruiseFocus(); },
  pause: invalidate
 };
 return {
  invalidate,
  run: (command: DocumentCommand) => {
   // Invalidate prior work before snapshotting clear's own context, so clear can
   // succeed without allowing an older retained focus to report late success.
   if (command.type === 'clear_focus') invalidate();
   return runDocumentCommand({ requestId: `reader-${++requestId}`, context: getContext(), command }, ports, cancellation.signal);
  }
 };
}
