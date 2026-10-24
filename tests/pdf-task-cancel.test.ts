import { afterEach, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
const runtime=vi.hoisted(()=>({script:`let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const r=JSON.parse(s);if(r.marker)require('node:fs').writeFileSync(r.marker,String(process.pid));setTimeout(()=>process.stdout.write(JSON.stringify({ok:true,value:r})),r.delay||0);});`}));
vi.mock('electron',()=>({app:{isPackaged:false,getAppPath:()=>process.cwd()}}));
vi.mock('../src/main/pdf-runtime',()=>({resolvePdfCommand:()=>({executable:process.execPath,args:['-e',runtime.script]})}));
import { runPdfTask } from '../src/main/python';
afterEach(()=>vi.restoreAllMocks());
it('preaborted PDF task rejects without launching work',async()=>{
  const c=new AbortController();c.abort();await expect(runPdfTask({delay:0},c.signal)).rejects.toThrow('PDF_CANCELED');expect(getEventListeners(c.signal,'abort')).toEqual([]);
});
it('cancels actual in-flight child, clears abort listener, and settles only once on close',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'enlumor-child-'));const marker=join(dir,'pid');let pid:number|undefined;
  const alive=()=>{try{process.kill(pid!,0);return true;}catch{return false;}};
  try {
    const c=new AbortController();const promise=runPdfTask({delay:30000,marker},c.signal);const assertion=expect(promise).rejects.toThrow('PDF_CANCELED');
    const deadline=Date.now()+2000;while(!existsSync(marker)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));expect(existsSync(marker)).toBe(true);pid=Number(readFileSync(marker,'utf8'));
    const start=Date.now();c.abort();await assertion;while(alive()&&Date.now()-start<1000)await new Promise(r=>setTimeout(r,10));expect(alive()).toBe(false);expect(Date.now()-start).toBeLessThan(1000);expect(getEventListeners(c.signal,'abort')).toEqual([]);
  }finally{if(pid&&alive())process.kill(pid);if(dirname(resolve(dir))!==resolve(tmpdir()))throw Error('unexpected cleanup path');rmSync(dir,{recursive:true,force:true});}
});
it('keeps legacy no-signal behavior and removes listener after success; later abort cannot replace result',async()=>{
  expect(await runPdfTask({hello:'unchanged'})).toEqual({hello:'unchanged'});const c=new AbortController();const r=await runPdfTask({value:'committed'},c.signal);c.abort();expect(r).toEqual({value:'committed'});expect(getEventListeners(c.signal,'abort')).toEqual([]);
});
