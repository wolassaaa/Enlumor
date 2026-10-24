import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import {measureSurfingInputTokens} from '../src/main/surfing-token-worker-host';
const root=mkdtempSync(join(tmpdir(),'enlumor-surfing-tokens-')),entry=join(root,'counter.cjs');
const profile={protocol:'openai-chat' as const,model:'gpt-4o-mini'};
beforeAll(()=>{buildSync({entryPoints:['src/main/surfing-token-worker.ts'],outfile:entry,bundle:true,platform:'node',format:'cjs'});});
afterAll(()=>rmSync(root,{recursive:true,force:true}));
describe('off-main-thread Surfing token counting',()=>{
 it('returns model-aware count from a real worker',async()=>{expect(await measureSurfingInputTokens(profile,{system:'You are a reader.',user:'Hello world'},new AbortController().signal,entry)).toBe(1042);});
 it('does not guess unknown model encoding',async()=>{expect(await measureSurfingInputTokens({...profile,model:'unknown'},{system:'s',user:'u'},new AbortController().signal,entry)).toBe(null);});
 it('honors an already canceled operation',async()=>{const c=new AbortController();c.abort();await expect(measureSurfingInputTokens(profile,{system:'s',user:'u'},c.signal,entry)).rejects.toThrow('SURFING_CANCELED');});
 it('terminates a running count on cancellation',async()=>{const c=new AbortController();const job=measureSurfingInputTokens(profile,{system:'s',user:'text '.repeat(20000)},c.signal,entry);c.abort();await expect(job).rejects.toThrow('SURFING_CANCELED');});
 it('returns unknown when worker bundle is missing instead of guessing',async()=>{expect(await measureSurfingInputTokens(profile,{system:'s',user:'u'},new AbortController().signal,join(root,'missing.cjs'))).toBe(null);});
});
