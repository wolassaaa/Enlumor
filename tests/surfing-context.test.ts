import {describe,it,expect} from 'vitest';
import {prepareSurfingContext} from '../src/shared/surfing-context';
import type {CruiseBlock} from '../src/shared/cruise';
const context={documentId:'doc',fingerprint:'hash',revision:1};
const block=(pageIndex=0):CruiseBlock=>({id:`p${pageIndex}`,documentId:'doc',fingerprint:'hash',pageIndex,quote:'Original passage',quads:[[0,10,10,10,0,0,10,0]]});
function setup(){const controller=new AbortController();let current={...context};const reads:number[]=[];return {controller,reads,change:()=>{current={...context,revision:2};},input:{context:{...context},pageCount:2,readPage:async(i:number)=>{reads.push(i);return [block(i)];},getContext:()=>current,signal:controller.signal,maxCharacters:1000,maxPassages:20}};}
describe('Surfing local text snapshot',()=>{
 it('collects exact page order and detached geometry without navigation or network',async()=>{const h=setup();const source=block();h.input.readPage=async i=>i===0?[source]:[block(i)];const s=await prepareSurfingContext(h.input);expect(s.coverage).toBe('all-pages-have-text');expect(s.passages.map(b=>b.id)).toEqual(['p0','p1']);expect(s.characterCount).toBe(32);source.quads[0][0]=99;expect(s.passages[0].quads[0][0]).toBe(0);expect(s.context).toEqual(context);});
 it('reports empty pages rather than claiming full visual understanding',async()=>{const h=setup();h.input.readPage=async i=>i?[]:[block()];const s=await prepareSurfingContext(h.input);expect(s.coverage).toBe('partial-text');expect(s.emptyPages).toEqual([1]);});
 it('rejects an all scanned or empty document',async()=>{const h=setup();h.input.readPage=async()=>[];await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_NO_TEXT');});
 it('cancels before any read',async()=>{const h=setup();h.controller.abort();await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_CANCELED');expect(h.reads).toEqual([]);});
 it('cancels after an outstanding read and never reads the next page',async()=>{const h=setup();h.input.readPage=async()=>{h.controller.abort();return [block()];};await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_CANCELED');});
 it('rejects a document revision change during extraction',async()=>{const h=setup();h.input.readPage=async()=>{h.change();return [block()];};await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_STALE');});
 it('rejects text over capacity without returning a truncated full snapshot',async()=>{const h=setup();h.input.maxCharacters=20;await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_CONTEXT_TOO_LARGE');});
 it('rejects a passage count over capacity',async()=>{const h=setup();h.input.maxPassages=1;await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_CONTEXT_TOO_LARGE');});
 it('rejects duplicate evidence ids',async()=>{const h=setup();h.input.readPage=async i=>[{...block(i),id:'duplicate'}];await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_INVALID_SOURCE');});
 it.each(['identity','page','geometry','blank'])('rejects invalid %s data',async kind=>{const h=setup();const b=block();if(kind==='identity')b.documentId='other';if(kind==='page')b.pageIndex=9;if(kind==='geometry')b.quads=[[NaN]];if(kind==='blank')b.quote=' ';h.input.readPage=async()=>[b];await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_INVALID_SOURCE');});
 it('does not swallow extraction errors as empty pages',async()=>{const h=setup();h.input.readPage=async()=>{throw Error('PDF_FAILURE');};await expect(prepareSurfingContext(h.input)).rejects.toThrow('PDF_FAILURE');});
 it.each([0,-1,1.2,Infinity])('rejects invalid page count %s',async pageCount=>{const h=setup();h.input.pageCount=pageCount;await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_INVALID_INPUT');});
 it('requires a known positive capacity',async()=>{const h=setup();h.input.maxCharacters=0;await expect(prepareSurfingContext(h.input)).rejects.toThrow('SURFING_INVALID_INPUT');});
});

it.each([{quads:new Array(1)},{quads:[new Array(8)]},{quads:[[0,0,0,0,0,0,0,0]]}])('rejects sparse or degenerate evidence geometry %#',async ({quads})=>{
 const controller=new AbortController();const context={documentId:'doc',fingerprint:'hash',revision:1};
 await expect(prepareSurfingContext({context,pageCount:1,readPage:async()=>[{id:'p',documentId:'doc',fingerprint:'hash',pageIndex:0,quote:'text',quads}],getContext:()=>context,signal:controller.signal,maxCharacters:100,maxPassages:10})).rejects.toThrow('SURFING_INVALID_SOURCE');
});

