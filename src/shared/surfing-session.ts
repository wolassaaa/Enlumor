import type {SurfingRoute} from './surfing-route';
import type {SurfingExplanation} from '../main/surfing-requests';
export type SurfingSession={version:1;documentId:string;fingerprint:string;source:{profileId:string;name:string;model:string;signature:string};route:SurfingRoute;selected:number|null;answers:Record<string,SurfingExplanation>;contextWindowTokens:number;status:'paused'};
