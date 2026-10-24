import {Tiktoken} from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/o200k_base';
import type {AiProfileInput,AiPrompt} from '../shared/ai';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
import {supportedSurfingTokenizer} from './surfing-tokenizer-models';
export {supportedSurfingTokenizer} from './surfing-tokenizer-models';
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

