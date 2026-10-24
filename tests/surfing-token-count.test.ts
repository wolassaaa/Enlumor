import {describe,it,expect} from 'vitest';
import {countSurfingPromptTokens,supportedSurfingTokenizer} from '../src/main/surfing-token-count';
const profile={protocol:'openai-chat' as const,model:'gpt-4o-mini'};
const prompt={system:'You are a reader.',user:'Hello world'};
describe('explicit model-aware Surfing token budget',()=>{
 it('counts actual o200k tokens plus documented framing and conservative reserve',()=>{expect(countSurfingPromptTokens(profile,prompt)).toBe(1024+9+1+1+5+2);});
 it('does not guess tokenizer for unknown models or other protocols',()=>{expect(countSurfingPromptTokens({...profile,model:'custom-model'},prompt)).toBe(null);expect(countSurfingPromptTokens({...profile,protocol:'anthropic-messages'},prompt)).toBe(null);});
 it('accepts an exact recognized model, not a lookalike display name',()=>{expect(supportedSurfingTokenizer(profile)).toBe(true);expect(supportedSurfingTokenizer({...profile,model:'gpt-4o-mini-random'})).toBe(false);});
 it('counts literal special-token-like paper text as data',()=>{expect(countSurfingPromptTokens(profile,{system:'test',user:'<|endoftext|>'})).toBeGreaterThan(1024);});
 it('counts non-ASCII text through the tokenizer rather than character division',()=>{const short=countSurfingPromptTokens(profile,{system:'',user:'论文'});expect(short).toBeGreaterThan(1024);expect(short).toBeLessThan(1100);});
 it('fails closed on an oversized prompt before tokenization',()=>{expect(countSurfingPromptTokens(profile,{system:'',user:'x'.repeat(200001)})).toBe(null);});
});


it('budgets configured DeepSeek Chat using conservative UTF8 byte bound, never pretends o200k is its tokenizer',()=>{const p={protocol:'openai-chat' as const,model:'deepseek-chat'};expect(supportedSurfingTokenizer(p)).toBe(true);expect(countSurfingPromptTokens(p,{system:'',user:'论文'})).toBe(6+4096);});
