import type {AiProfileInput} from '../shared/ai';
import {knownContextWindow,validContextWindow} from '../shared/ai-models';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
const models=new Set(['gpt-4o','gpt-4o-2024-05-13','gpt-4o-2024-08-06','gpt-4o-2024-11-20','gpt-4o-mini','gpt-4o-mini-2024-07-18','gpt-4.1','gpt-4.1-2025-04-14','gpt-4.1-mini','gpt-4.1-mini-2025-04-14','gpt-4.1-nano','gpt-4.1-nano-2025-04-14']);
/** Whether an exact o200k count exists for this model; every other model is still usable with an estimate. */
export function supportedSurfingTokenizer(profile:Model){return profile.protocol==='openai-chat'&&(models.has(profile.model)||profile.model==='deepseek-chat'||profile.model==='deepseek-reasoner');}


/** The window to start from: what the model settings recorded (discovered or edited), else the published catalog value. */
export function suggestedSurfingContextWindow(profile:Model&{contextWindowTokens?:number}):number{
 return validContextWindow(profile.contextWindowTokens)?profile.contextWindowTokens:knownContextWindow(profile.model).tokens;
}
