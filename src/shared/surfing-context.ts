import type {CruiseBlock} from './cruise';
import type {CommandContext} from './document-commands';
/** Sanity bound on one assembled prompt. Extraction admits 160k quote characters in up to 5,000 passages;
 * each passage adds ~60 characters of JSON framing, quotes may need escaping, and asks carry up to 18k of
 * conversation. The real admission check is the measured token count against the configured context window. */
export const SURFING_MAX_PROMPT_CHARACTERS=1_000_000;
export type SurfingContext={context:CommandContext;pageCount:number;passages:CruiseBlock[];emptyPages:number[];characterCount:number;coverage:'all-pages-have-text'|'partial-text'};
export type SurfingContextInput={context:CommandContext;pageCount:number;readPage:(pageIndex:number)=>Promise<CruiseBlock[]>;getContext:()=>CommandContext|null;signal:AbortSignal;maxCharacters:number;maxPassages:number};
const fail=(code:string):never=>{throw Error(code);};
function validQuads(value:unknown):boolean{
 if(!Array.isArray(value)||!value.length||value.length>10000)return false;
 return Array.from(value).every(q=>{
  if(!Array.isArray(q)||q.length!==8||!Array.from(q).every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7))return false;
  // PDF quad order is top-left, top-right, bottom-left, bottom-right.
  const polygon=[0,2,6,4];let twiceArea=0;
  for(let i=0;i<4;i++){const a=polygon[i],b=polygon[(i+1)%4];twiceArea+=q[a]*q[b+1]-q[b]*q[a+1];}
  return Math.abs(twiceArea)>1e-8;
 });
}
/** Local text only. No requests, viewport changes or claims about visual coverage. */
export async function prepareSurfingContext(input:SurfingContextInput):Promise<SurfingContext>{
 const {pageCount,maxCharacters,maxPassages}=input;
 const context={...input.context};
 if(!context.documentId||!context.fingerprint||!Number.isSafeInteger(context.revision)||context.revision<0||![pageCount,maxCharacters,maxPassages].every(n=>Number.isSafeInteger(n)&&n>0)||pageCount>10000)fail('SURFING_INVALID_INPUT');
 const check=()=>{if(input.signal.aborted)fail('SURFING_CANCELED');const current=input.getContext();if(!current||current.documentId!==context.documentId||current.fingerprint!==context.fingerprint||current.revision!==context.revision)fail('SURFING_STALE');};
 const passages:CruiseBlock[]=[],emptyPages:number[]=[],ids=new Set<string>();let characterCount=0;
 for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
  check();const blocks=await input.readPage(pageIndex);check();
  if(!Array.isArray(blocks))fail('SURFING_INVALID_SOURCE');
  if(!blocks.length)emptyPages.push(pageIndex);
  for(const b of blocks){
   if(!b||typeof b.id!=='string'||!b.id||b.id.length>512||ids.has(b.id)||b.documentId!==context.documentId||b.fingerprint!==context.fingerprint||b.pageIndex!==pageIndex||typeof b.quote!=='string'||!b.quote.trim()||!validQuads(b.quads))fail('SURFING_INVALID_SOURCE');
   if(characterCount+b.quote.length>maxCharacters||passages.length>=maxPassages)fail('SURFING_CONTEXT_TOO_LARGE');
   characterCount+=b.quote.length;ids.add(b.id);passages.push({...b,quads:b.quads.map(q=>[...q])});
  }
  // Text extraction yields to reading/UI between pages; never mounts page canvases.
  await new Promise<void>(resolve=>setTimeout(resolve,0));check();
 }
 if(!passages.length)fail('SURFING_NO_TEXT');
 return {context,pageCount,passages,emptyPages,characterCount,coverage:emptyPages.length?'partial-text':'all-pages-have-text'};
}

