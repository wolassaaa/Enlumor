import type {Reply} from './model';
import type {CommandContext} from './document-commands';
import type {SurfingContext} from './surfing-context';
import type {SurfingRouteRequest,SurfingExplainRequest,SurfingRouteEvent} from '../main/surfing-requests';
import type {SurfingSubmission,SurfingRuntimeEvent,SurfingSaveInput,SurfingRestoredProgress} from '../main/surfing-runtime';
export type SurfingBridge={
 getSavedSurfingProgress(context:CommandContext):Promise<Reply<SurfingRestoredProgress|null>>;
 saveSurfingProgress(input:SurfingSaveInput):Promise<Reply<void>>;
 prepareSurfing(documentId:string):Promise<Reply<SurfingContext>>;
 generateSurfingRoute(input:SurfingSubmission<SurfingRouteRequest>):Promise<Reply<void>>;
 explainSurfingStop(input:SurfingSubmission<SurfingExplainRequest>):Promise<Reply<void>>;
 cancelSurfing(context:CommandContext):Promise<Reply<void>>;
 deactivateSurfing(context:CommandContext):Promise<Reply<void>>;
 onSurfingText(handler:(event:SurfingRuntimeEvent)=>void):()=>void;
};
