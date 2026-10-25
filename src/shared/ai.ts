export type AiProtocol='openai-chat'|'openai-responses'|'anthropic-messages'|'gemini'|'dashscope'|'spark';
export type AiCredential={kind:'api-key';apiKey:string}|{kind:'spark';appId:string;apiKey:string;apiSecret:string};
export type AiProfileInput={id:string;name:string;protocol:AiProtocol;endpoint:string;model:string;credential?:AiCredential;maxOutputTokens:number;timeoutMs:number;parameters:Record<string,unknown>;
 /** The model's context window; discovery fills it and the reader can edit it. Older profiles have none. */
 contextWindowTokens?:number};
export type AiProfileView=Omit<AiProfileInput,'credential'>&{hasCredential:boolean;credentialStorage:'encrypted'|'session'|'none';verification:'configured'|'contract-tested'|'live-tested'};
export type AiTextEvent={requestId:string;type:'delta'|'done'|'error';text?:string;code?:string};
export type AiPrompt={system:string;user:string};
/** One bound for every assembled prompt; whether it fits a model is decided by its token count and context window. */
export const AI_MAX_PROMPT_CHARACTERS=1_000_000;
