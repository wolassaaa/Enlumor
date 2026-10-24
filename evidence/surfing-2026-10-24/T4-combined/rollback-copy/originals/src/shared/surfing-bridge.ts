import type {Reply} from './model';
import type {CommandContext} from './document-commands';
import type {SurfingContext} from './surfing-context';
import type {SurfingRouteRequest,SurfingExplainRequest,SurfingRouteEvent} from '../main/surfing-requests';
import type {SurfingSubmission} from '../main/surfing-runtime';
export type SurfingBridge={
 prepareSurfing(documentId:string):Promise<Reply<SurfingContext>>;
 generateSurfingRoute(input:SurfingSubmission<SurfingRouteRequest>):Promise<Reply<void>>;
 explainSurfingStop(input:SurfingSubmission<SurfingExplainRequest>):Promise<Reply<void>>;
 cancelSurfing(context:CommandContext):Promise<Reply<void>>;
 deactivateSurfing(context:CommandContext):Promise<Reply<void>>;
 onSurfingText(handler:(event:SurfingRouteEvent)=>void):()=>void;
};
