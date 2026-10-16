import type{CruiseSession}from'./cruise';
import type{ExplanationInput}from'../main/cruise-requests';
import type{AiTextEvent}from'./ai';
import type {AiProfileInput,AiProfileView} from './ai';
export type Quad = number[];
export type Annotation = {
  id: string; documentId: string; fingerprint: string; type: 'highlight' | 'underline' | 'strikeout' | 'line' | 'arrow' | 'ink' | 'note';
  pageIndex: number; quote: string; quads: Quad[]; points?: number[]; color: string; note: string; author: 'user';
};
export type AnnotationChange = { documentId: string; upserts: Annotation[]; deletes: string[] };
export type CommitResult = { annotations: Annotation[]; inverse: AnnotationChange };
export type ReadingState = { documentId: string; fingerprint: string; pageIndex: number; offset: number; zoom: number; rotation: number; layout?: 'continuous' | 'single' };
export type DocumentInfo = { id: string; path: string; name: string; fingerprint: string; pageCount: number; updatedAt: number };
export type OpenedDocument = DocumentInfo & { data: Uint8Array; reading: ReadingState | null };
export type ExportResult = { cancelled: boolean; path?: string; annotationCount?: number };
export type Reply<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export type LayoutPreferences = { left: number; right: number; spacing: 12 | 16 | 24 };
export type TabSession = { openIds: string[]; activeId: string | null };
export type Bridge = {
  getCruiseSession(documentId:string):Promise<Reply<CruiseSession|null>>;
  saveCruiseSession(session:CruiseSession):Promise<Reply<void>>;
  startBlockExplanation(input:ExplanationInput):Promise<Reply<void>>;
  cancelBlockExplanation(requestId:string):Promise<Reply<void>>;
  onAiText(handler:(event:AiTextEvent)=>void):()=>void;
  listAiProfiles():Promise<Reply<AiProfileView[]>>;
  saveAiProfile(input:AiProfileInput):Promise<Reply<AiProfileView>>;
  deleteAiProfile(id:string):Promise<Reply<void>>;
  testAiProfile(id:string):Promise<Reply<void>>;
  listAiModels(id:string):Promise<Reply<string[]>>;
  getLayout(): Promise<Reply<LayoutPreferences>>;
  saveLayout(layout: LayoutPreferences): Promise<Reply<void>>;
  getTabs(): Promise<Reply<TabSession | null>>;
  saveTabs(session: TabSession): Promise<Reply<void>>;
  openDocument(): Promise<Reply<OpenedDocument | null>>;
  restoreDocument(id: string): Promise<Reply<OpenedDocument>>;
  rebindDocument(id: string): Promise<Reply<OpenedDocument | null>>;
  listDocuments(): Promise<Reply<DocumentInfo[]>>;
  getAnnotations(id: string): Promise<Reply<Annotation[]>>;
  applyAnnotationChange(change: AnnotationChange): Promise<Reply<CommitResult>>;
  saveReadingState(state: ReadingState): Promise<Reply<void>>;
  exportAnnotatedPdf(id: string): Promise<Reply<ExportResult>>;
  onFlush(handler: () => Promise<void>): () => void;
};
export function unwrap<T>(reply: Reply<T>): T {
  if (!reply.ok) throw new Error(reply.error.message.startsWith(`${reply.error.code}:`) ? reply.error.message : `${reply.error.code}: ${reply.error.message}`);
  return reply.value;
}
