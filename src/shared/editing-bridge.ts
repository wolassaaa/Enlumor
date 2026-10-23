import type { Annotation } from './model';
import type { CommandContext } from './document-commands';
import type { EditMark } from './editing-commands';
export type AnchorCandidate={pageIndex:number;quote:string;quads:number[][]};
export type LegacyMarkView={legacyId:string;inputDigest:string;annotation:Annotation;status:'readonly';reason:string};
export type EditingView={context:CommandContext;marks:EditMark[];legacy:LegacyMarkView[];diagnostics:{legacyId:string;reason:string}[];history:{undoIds:string[];redoIds:string[]};hasEditingState:boolean};
