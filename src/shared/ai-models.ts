/** What a service told us about one model. contextWindow is only present when the service reports it. */
export type AiModelInfo={id:string;contextWindow?:number};
export type ContextWindowSource='service'|'catalog'|'fallback';
export const MIN_CONTEXT_WINDOW=1024,MAX_CONTEXT_WINDOW=10_000_000;
/** Used when neither the service nor the catalog knows a model; most current chat models are at least this large,
 * and an overflow reported by the service lowers it automatically. */
export const FALLBACK_CONTEXT_WINDOW=128_000;

export function validContextWindow(value:unknown):value is number{return Number.isSafeInteger(value)&&(value as number)>=MIN_CONTEXT_WINDOW&&(value as number)<=MAX_CONTEXT_WINDOW;}

// Published total context windows, matched on the model name without any vendor prefix (openai/gpt-4o, Qwen/Qwen2.5-72B).
const catalog:[RegExp,number][]=[
 [/^gpt-5/,400_000],[/^gpt-4\.1/,1_047_576],[/^(chat)?gpt-4o/,128_000],[/^gpt-4-turbo/,128_000],[/^gpt-4(-\d{4})?$/,8_192],[/^gpt-3\.5-turbo/,16_385],
 [/^o[134](-|$)/,200_000],
 [/^claude-/,200_000],
 // DeepSeek's own API now serves deepseek-chat/-reasoner as aliases of the V4 models.
 [/^deepseek-(flash|v4)/,1_048_576],[/^deepseek-(chat|reasoner)$/,1_048_576],[/^deepseek-(chat|reasoner|v3|r1)/,128_000],
 [/^gemini-1\.5-pro/,2_097_152],[/^gemini-/,1_048_576],
 [/^qwen-long/,10_000_000],[/^qwen-turbo/,1_000_000],[/^qwen-plus/,131_072],[/^qwen-max/,32_768],[/^(qwen3|qwen2\.5|qwq)/,131_072],
 [/^glm-4\.[56]/,128_000],[/^glm-4-long/,1_000_000],[/^glm-4/,128_000],
 [/^kimi-k2/,131_072],
 [/^(meta-)?llama-?3\.[1-3]/,131_072],[/^mistral-large/,131_072],[/^grok-4/,256_000],[/^grok-3/,131_072],
];

/** Best known context window for a model id, with where it came from. A size in the name (moonshot-v1-32k) beats the family default. */
export function knownContextWindow(model:string):{tokens:number;source:ContextWindowSource}{
 const name=model.trim().toLowerCase().split('/').pop()||'';
 const sized=/(?:^|[-_])(\d{1,4})k(?:$|[-_])/.exec(name);
 if(sized){const tokens=Number(sized[1])*1000;if(validContextWindow(tokens))return{tokens,source:'catalog'};}
 for(const [pattern,tokens] of catalog)if(pattern.test(name))return{tokens,source:'catalog'};
 return{tokens:FALLBACK_CONTEXT_WINDOW,source:'fallback'};
}

/** The window to use: what the service reported, else the catalog, else the fallback. */
export function resolveContextWindow(model:string,reported?:number):{tokens:number;source:ContextWindowSource}{
 return validContextWindow(reported)?{tokens:reported,source:'service'}:knownContextWindow(model);
}

/** Upper bound for a profile's output limit; DeepSeek V4 publishes 384K. */
export const MAX_OUTPUT_LIMIT=400_000;
/** Used when neither the service nor the catalog knows a model's output limit; a service that allows less says so
 * in its 400 reply and the request is retried at the stated limit. */
export const FALLBACK_MAX_OUTPUT=16_384;
/** The output limit older profiles were created with; it is read as "the model's own limit". */
export const LEGACY_DEFAULT_MAX_OUTPUT=2048;
// Published maximum output per request (thinking included), matched like the window catalog. Generous on purpose:
// thinking models spend much of it reasoning, and a limit that is too high is corrected by the service's own reply.
const outputCatalog:[RegExp,number][]=[
 [/^gpt-5/,128_000],[/^gpt-4\.1/,32_768],[/^(chat)?gpt-4o/,16_384],[/^gpt-4-turbo/,4_096],[/^gpt-4(-\d{4})?$/,8_192],[/^gpt-3\.5-turbo/,4_096],
 [/^o1-mini/,65_536],[/^o[134](-|$)/,100_000],
 [/^claude-3-5/,8_192],[/^claude-3-(opus|haiku|sonnet)/,4_096],[/^claude-(opus-4|4-opus)/,32_000],[/^claude-/,64_000],
 [/^deepseek-(flash|v4)/,384_000],[/^deepseek-(chat|reasoner)$/,384_000],[/^deepseek-(r1|reasoner)/,32_768],[/^deepseek-(chat|v3)/,8_192],
 [/^gemini-(1\.5|2\.0)/,8_192],[/^gemini-/,65_536],
 [/^(qwen3|qwq)/,32_768],[/^qwen-/,8_192],[/^glm-4\.[56]/,98_304],[/^glm-4/,4_096],[/^kimi-k2/,32_768],
];
/** Best known output limit for a model id, with where it came from. */
export function knownMaxOutput(model:string):{tokens:number;source:ContextWindowSource}{
 const name=model.trim().toLowerCase().split('/').pop()||'';
 for(const [pattern,tokens] of outputCatalog)if(pattern.test(name))return{tokens,source:'catalog'};
 return{tokens:FALLBACK_MAX_OUTPUT,source:'fallback'};
}
export function validMaxOutput(value:unknown):value is number{return Number.isSafeInteger(value)&&(value as number)>=1&&(value as number)<=MAX_OUTPUT_LIMIT;}
/** A profile's output limit for requests. The legacy default means "the model's own limit", read at request time so
 * stored profiles (and the Surfing session signatures derived from them) stay unchanged. */
export function profileMaxOutput(profile:{model:string;maxOutputTokens:number}):number{
 return profile.maxOutputTokens===LEGACY_DEFAULT_MAX_OUTPUT?knownMaxOutput(profile.model).tokens:profile.maxOutputTokens;
}
/** A copy of the profile that asks for exactly `tokens` (never the legacy value, which would read as "the model's limit"). */
export function withMaxOutput<T extends {maxOutputTokens:number}>(profile:T,tokens:number):T{
 return{...profile,maxOutputTokens:tokens===LEGACY_DEFAULT_MAX_OUTPUT?tokens-1:tokens};
}
/** The output limit to use: what the service reported, else the catalog, else the fallback. */
export function resolveMaxOutput(model:string,reported?:number):{tokens:number;source:ContextWindowSource}{
 return validMaxOutput(reported)&&reported>=256?{tokens:reported,source:'service'}:knownMaxOutput(model);
}

const notChat=/embed|whisper|tts|dall-e|image|audio|moderation|rerank|transcribe|realtime|search|vision-preview|-ocr/i;
const preferred=[/^deepseek-flash$/,/^deepseek-chat$/,/^gpt-4\.1$/,/^gpt-4o$/,/claude-[\w.-]*sonnet/,/^gemini-2\.5-pro/,/^qwen-plus$/,/^glm-4/,/^kimi-k2/,/deepseek-(v3|chat)/];
/** Picks a sensible chat model from a discovered list so a pasted key is enough to start. */
export function pickDefaultModel(models:string[]):string|null{
 const chat=models.filter(id=>!notChat.test(id));
 for(const pattern of preferred){const hit=chat.find(id=>pattern.test(id.toLowerCase().split('/').pop()||''));if(hit)return hit;}
 return chat[0]??models[0]??null;
}

// Model families that accept images, matched like the window catalog. Unknown models are treated as text-only
// until the reader marks them, so a page image is never sent to a model that would reject it.
const vision:[RegExp,boolean][]=[
 [/^(o1|o3)-mini/,false],[/^(gpt-5|gpt-4\.1|(chat)?gpt-4o|gpt-4-turbo|o[134])/,true],
 [/^claude-(3|sonnet|opus|haiku|[4-9])/,true],[/^gemini-/,true],
 [/(^|-)vl|^qvq|-vision|^glm-4(\.\d)?v|^grok-4|^llama-(3\.2-\d+b-vision|4)|^pixtral|^mistral-(medium|small)-3/,true],
 // V4.1 Flash reads page images; V4 Pro accepts them but cannot see them.
 [/^deepseek-(v4-)?flash/,true],[/^deepseek-(v4|chat|reasoner|v3|r1)/,false],
];
/** Whether a model can look at page images; null when the catalog does not know. */
export function knownVision(model:string):boolean|null{
 const name=model.trim().toLowerCase().split('/').pop()||'';
 for(const [pattern,value] of vision)if(pattern.test(name))return value;
 return null;
}
/** The reader's own setting wins; otherwise the catalog; unknown models are treated as text-only. */
export function canSeeImages(profile:{model:string;vision?:boolean}):boolean{return profile.vision??knownVision(profile.model)??false;}
