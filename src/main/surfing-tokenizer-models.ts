import type {AiProfileInput} from '../shared/ai';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
const models=new Set(['gpt-4o','gpt-4o-2024-05-13','gpt-4o-2024-08-06','gpt-4o-2024-11-20','gpt-4o-mini','gpt-4o-mini-2024-07-18','gpt-4.1','gpt-4.1-2025-04-14','gpt-4.1-mini','gpt-4.1-mini-2025-04-14','gpt-4.1-nano','gpt-4.1-nano-2025-04-14']);
export function supportedSurfingTokenizer(profile:Model){return profile.protocol==='openai-chat'&&(models.has(profile.model)||profile.model==='deepseek-chat'||profile.model==='deepseek-reasoner');}


/** A conservative starting value for the context window of a recognised model, so first use needs no lookup.
 * It is only a pre-filled suggestion the reader can change; DeepSeek uses the smaller of its published windows. */
export function suggestedSurfingContextWindow(profile:Model):number|null{
 if(!supportedSurfingTokenizer(profile))return null;
 if(profile.model.startsWith('gpt-4.1'))return 1000000;
 if(profile.model.startsWith('gpt-4o'))return 128000;
 return 64000;
}
