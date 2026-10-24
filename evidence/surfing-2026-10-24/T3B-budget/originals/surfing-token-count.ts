import {Tiktoken} from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/o200k_base';
import type {AiProfileInput,AiPrompt} from '../shared/ai';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
const models=new Set(['gpt-4o','gpt-4o-2024-05-13','gpt-4o-2024-08-06','gpt-4o-2024-11-20','gpt-4o-mini','gpt-4o-mini-2024-07-18','gpt-4.1','gpt-4.1-2025-04-14','gpt-4.1-mini','gpt-4.1-mini-2025-04-14','gpt-4.1-nano','gpt-4.1-nano-2025-04-14']);
export function supportedSurfingTokenizer(profile:Model){return profile.protocol==='openai-chat'&&models.has(profile.model);}
let encoder:Tiktoken|undefined;
/** Worker-only counter. Count content with o200k, roles + chat framing, plus 1024 reserve.
 * This conservative client estimate is not a promise about private server templates.
 * Actual context-window size remains explicitly configured, never inferred from model name.
 */
export function countSurfingPromptTokens(profile:Model,prompt:AiPrompt):number|null{
 if(!supportedSurfingTokenizer(profile)||typeof prompt?.system!=='string'||typeof prompt?.user!=='string'||prompt.system.length+prompt.user.length>200000)return null;
 encoder??=new Tiktoken(ranks);
 const count=(s:string)=>encoder!.encode(s,[],[]).length;
 return count(prompt.system)+count(prompt.user)+count('system')+count('user')+9+1024;
}
