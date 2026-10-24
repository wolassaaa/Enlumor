import type {AiProfileInput} from '../shared/ai';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
const models=new Set(['gpt-4o','gpt-4o-2024-05-13','gpt-4o-2024-08-06','gpt-4o-2024-11-20','gpt-4o-mini','gpt-4o-mini-2024-07-18','gpt-4.1','gpt-4.1-2025-04-14','gpt-4.1-mini','gpt-4.1-mini-2025-04-14','gpt-4.1-nano','gpt-4.1-nano-2025-04-14']);
export function supportedSurfingTokenizer(profile:Model){return profile.protocol==='openai-chat'&&(models.has(profile.model)||profile.model==='deepseek-chat'||profile.model==='deepseek-reasoner');}

