import {describe,it,expect} from 'vitest';
import {countSurfingPromptTokens,supportedSurfingTokenizer} from '../src/main/surfing-token-count';
import {SURFING_MAX_PROMPT_CHARACTERS} from '../src/shared/surfing-context';
const profile={protocol:'openai-chat' as const,model:'gpt-4o-mini'};
const prompt={system:'You are a reader.',user:'Hello world'};
describe('explicit model-aware Surfing token budget',()=>{
 it('counts actual o200k tokens plus documented framing and conservative reserve',()=>{expect(countSurfingPromptTokens(profile,prompt)).toBe(1024+9+1+1+5+2);});
 it('estimates any other model or protocol on the safe side instead of refusing it',()=>{const exact=countSurfingPromptTokens(profile,prompt)!;for(const other of [{...profile,model:'custom-model'},{...profile,protocol:'anthropic-messages' as const,model:'claude-sonnet-4'},{protocol:'gemini' as const,model:'gemini-2.5-pro'}]){const n=countSurfingPromptTokens(other,prompt)!;expect(n).toBeGreaterThan(1024);expect(n-1024).toBeGreaterThanOrEqual(exact-1024);}expect(countSurfingPromptTokens({...profile,model:'custom-model'},{system:'',user:'word '.repeat(1000)})!-1024).toBe(Math.ceil((countSurfingPromptTokens(profile,{system:'',user:'word '.repeat(1000)})!-1024)*1.3));});
 it('accepts an exact recognized model, not a lookalike display name',()=>{expect(supportedSurfingTokenizer(profile)).toBe(true);expect(supportedSurfingTokenizer({...profile,model:'gpt-4o-mini-random'})).toBe(false);});
 it('counts literal special-token-like paper text as data',()=>{expect(countSurfingPromptTokens(profile,{system:'test',user:'<|endoftext|>'})).toBeGreaterThan(1024);});
 it('counts non-ASCII text through the tokenizer rather than character division',()=>{const short=countSurfingPromptTokens(profile,{system:'',user:'论文'});expect(short).toBeGreaterThan(1024);expect(short).toBeLessThan(1100);});
 it('fails closed on an oversized prompt before tokenization',()=>{expect(countSurfingPromptTokens(profile,{system:'',user:'x'.repeat(SURFING_MAX_PROMPT_CHARACTERS+1)})).toBe(null);});
});


it('budgets configured DeepSeek Chat using conservative UTF8 byte bound, never pretends o200k is its tokenizer',()=>{const p={protocol:'openai-chat' as const,model:'deepseek-chat'};expect(supportedSurfingTokenizer(p)).toBe(true);expect(countSurfingPromptTokens(p,{system:'',user:'论文'})).toBe(6+4096);});
it('starts Surfing from the window the model settings recorded, else the published catalog value',async()=>{const {suggestedSurfingContextWindow}=await import('../src/main/surfing-tokenizer-models');expect(suggestedSurfingContextWindow({protocol:'openai-chat',model:'gpt-4o-mini'})).toBe(128000);expect(suggestedSurfingContextWindow({protocol:'openai-chat',model:'deepseek-chat'})).toBe(128000);expect(suggestedSurfingContextWindow({protocol:'anthropic-messages',model:'claude-sonnet-4'})).toBe(200000);expect(suggestedSurfingContextWindow({protocol:'openai-chat',model:'custom-model',contextWindowTokens:32768})).toBe(32768);expect(suggestedSurfingContextWindow({protocol:'openai-chat',model:'custom-model'})).toBe(128000);});
