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
 [/^deepseek-(chat|reasoner|v3|r1)/,128_000],
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

const notChat=/embed|whisper|tts|dall-e|image|audio|moderation|rerank|transcribe|realtime|search|vision-preview|-ocr/i;
const preferred=[/^deepseek-chat$/,/^gpt-4\.1$/,/^gpt-4o$/,/claude-[\w.-]*sonnet/,/^gemini-2\.5-pro/,/^qwen-plus$/,/^glm-4/,/^kimi-k2/,/deepseek-(v3|chat)/];
/** Picks a sensible chat model from a discovered list so a pasted key is enough to start. */
export function pickDefaultModel(models:string[]):string|null{
 const chat=models.filter(id=>!notChat.test(id));
 for(const pattern of preferred){const hit=chat.find(id=>pattern.test(id.toLowerCase().split('/').pop()||''));if(hit)return hit;}
 return chat[0]??models[0]??null;
}
