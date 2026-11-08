import type { Annotation } from './model';
import type { CommandContext } from './document-commands';
import type { EditMark } from './editing-commands';
import type {EditRequest,VerifiedAnchor} from './editing-commands';
import type {EditResult} from '../main/editing-executor';
import type {Reply} from './model';
export type {EditResult};
export type EditingSession={sessionId:string;context:CommandContext};
export type EditingBridge={
 getEditingCapabilities():Promise<Reply<{enabled:boolean}>>;
 activateEditingDocument(documentId:string|null):Promise<Reply<EditingSession|null>>;
 getEditingView(sessionId:string):Promise<Reply<EditingViewWire>>;
 prepareEditingPage(input:{sessionId:string;requestId:string;pageIndex:number}):Promise<Reply<EditingViewWire>>;
 prepareEditingAnchor(input:{sessionId:string;requestId:string;candidate:AnchorCandidate}):Promise<Reply<VerifiedAnchor>>;
 executeUserEdit(input:{sessionId:string;request:EditRequest}):Promise<Reply<EditResult>>;
 cancelUserEdit(input:{sessionId:string;requestId:string}):Promise<Reply<void>>;
 getUserEditReceipt(request:EditRequest):Promise<Reply<EditResult|null>>;
 reanchorLegacy(input:{sessionId:string;requestId:string;legacyId:string;anchorId:string;expectedInputDigest:string}):Promise<Reply<EditingViewWire>>;
};
export type AnchorCandidate={pageIndex:number;quote:string;quads:number[][]};
export type LegacyMarkView={legacyId:string;inputDigest:string;annotation:Annotation;status:'readonly';reason:string};
export type EditingView={context:CommandContext;marks:EditMark[];legacy:LegacyMarkView[];diagnostics:{legacyId:string;reason:string}[];history:{undoIds:string[];redoIds:string[]};hasEditingState:boolean};
/** IPC form of a full view: ink points cross as one Float64Array per mark, not one contextBridge copy per number. */
export type EditingViewWire=Omit<EditingView,'marks'>&{marks:(Omit<EditMark,'points'>&{points?:number[]|Float64Array})[]};
export function toEditingViewWire(view:EditingView):EditingViewWire{return{...view,marks:view.marks.map(m=>m.points?{...m,points:Float64Array.from(m.points)}:m)};}
