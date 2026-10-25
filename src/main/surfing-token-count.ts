import {Tiktoken} from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/o200k_base';
import type {AiProfileInput,AiPrompt} from '../shared/ai';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
import {supportedSurfingTokenizer} from './surfing-tokenizer-models';
import {SURFING_MAX_PROMPT_CHARACTERS} from '../shared/surfing-context';
export {supportedSurfingTokenizer} from './surfing-tokenizer-models';
let encoder:Tiktoken|undefined;
/** Other tokenizers (Claude, Qwen, Gemini, Llama, …) usually need somewhat more tokens than o200k for the same text;
 * scaling the o200k count keeps the estimate on the safe side, and a service-reported overflow lowers the window anyway. */
const ESTIMATE_FACTOR=1.3;
/** Worker-only counter. Exact o200k for recognised OpenAI models, a conservative UTF-8 byte bound for DeepSeek, and a scaled
 * o200k estimate for every other model, so any configured model can be used. Roles + chat framing, plus 1024 reserve.
 * Returns null only for a malformed or oversized prompt.
 */
export function countSurfingPromptTokens(profile:Model,prompt:AiPrompt):number|null{
 if(typeof prompt?.system!=='string'||typeof prompt?.user!=='string'||prompt.system.length+prompt.user.length>SURFING_MAX_PROMPT_CHARACTERS)return null;
 // DeepSeek: conservative UTF8 byte budget, not an o200k token count or inferred capacity.
 if(profile.model==='deepseek-chat'||profile.model==='deepseek-reasoner')return new TextEncoder().encode(prompt.system+prompt.user).length+4096;
 encoder??=new Tiktoken(ranks);
 const count=(s:string)=>encoder!.encode(s,[],[]).length;
 const tokens=count(prompt.system)+count(prompt.user)+count('system')+count('user')+9;
 return(supportedSurfingTokenizer(profile)?tokens:Math.ceil(tokens*ESTIMATE_FACTOR))+1024;
}
