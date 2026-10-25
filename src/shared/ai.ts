export type AiProtocol='openai-chat'|'openai-responses'|'anthropic-messages'|'gemini'|'dashscope'|'spark';
export type AiCredential={kind:'api-key';apiKey:string}|{kind:'spark';appId:string;apiKey:string;apiSecret:string};
export type AiProfileInput={id:string;name:string;protocol:AiProtocol;endpoint:string;model:string;credential?:AiCredential;maxOutputTokens:number;timeoutMs:number;parameters:Record<string,unknown>;
 /** The model's context window; discovery fills it and the reader can edit it. Older profiles have none. */
 contextWindowTokens?:number;
 /** Whether the model accepts page images; unset means the catalog decides. */
 vision?:boolean};
export type AiProfileView=Omit<AiProfileInput,'credential'>&{hasCredential:boolean;credentialStorage:'encrypted'|'session'|'none';verification:'configured'|'contract-tested'|'live-tested'};
export type AiTextEvent={requestId:string;type:'delta'|'done'|'error';text?:string;code?:string};
export type AiImage={mediaType:'image/jpeg'|'image/png';data:string};
/** Later turns of one request: the model's previous step, then what the app returns to it (text and optional page images). */
export type AiTurn={role:'assistant'|'user';text:string;images?:AiImage[]};
export type AiPrompt={system:string;user:string;turns?:AiTurn[]};
export const AI_MAX_TURNS=12,AI_MAX_IMAGES=6,AI_MAX_IMAGE_BASE64=2_500_000;
/** One bound for every assembled prompt; whether it fits a model is decided by its token count and context window. */
export const AI_MAX_PROMPT_CHARACTERS=1_000_000;
