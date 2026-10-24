import type {CommandContext} from '../shared/document-commands';
import type {SurfingContext} from '../shared/surfing-context';
import {prepareSurfingContext} from '../shared/surfing-context';
import type {CruiseBlock} from '../shared/cruise';
export type SurfingSourcePorts={
 getContext:()=>CommandContext|null;
 verified:(documentId:string)=>{id:string;path:string;fingerprint:string;pageCount:number};
 extract:(request:{operation:'surfing-document';source:string;fingerprint:string},signal:AbortSignal)=>Promise<unknown>;
};
const invalid=():never=>{throw Error('SURFING_SOURCE_INVALID');};
function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function exact(v:Record<string,unknown>,keys:string[]){if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))invalid();}
/** Renderer supplies an identity, never a filesystem path, quote or geometry. */
export function createSurfingSourceLoader(ports:SurfingSourcePorts){
 return async(contextValue:CommandContext,signal:AbortSignal):Promise<SurfingContext>=>{
  const context={...contextValue};
  const check=()=>{if(signal.aborted)throw Error('SURFING_CANCELED');const c=ports.getContext();if(!c||c.documentId!==context.documentId||c.fingerprint!==context.fingerprint||c.revision!==context.revision)throw Error('SURFING_STALE');};
  const verify=()=>{const d=ports.verified(context.documentId);if(d.id!==context.documentId||d.fingerprint!==context.fingerprint||typeof d.path!=='string'||!d.path||!Number.isSafeInteger(d.pageCount)||d.pageCount<1||d.pageCount>2000)invalid();return d;};
  check();const doc=verify();
  const raw=structuredClone(await ports.extract({operation:'surfing-document',source:doc.path,fingerprint:doc.fingerprint},signal));check();
  const again=verify();if(again.pageCount!==doc.pageCount||again.path!==doc.path)invalid();
  if(!record(raw))return invalid();exact(raw,['fingerprint','pageCount','pages']);
  if(raw.fingerprint!==context.fingerprint||raw.pageCount!==doc.pageCount||!Array.isArray(raw.pages)||raw.pages.length!==doc.pageCount)return invalid();
  const pages:CruiseBlock[][]=[];
  for(const [index,page] of Array.from(raw.pages).entries()){
   if(!record(page))return invalid();exact(page,['pageIndex','passages']);
   if(page.pageIndex!==index||!Array.isArray(page.passages))return invalid();
   const passages:CruiseBlock[]=[];
   for(const b of Array.from(page.passages)){
    if(!record(b))return invalid();exact(b,['id','quote','quads']);
    if(typeof b.id!=='string'||typeof b.quote!=='string'||!Array.isArray(b.quads))return invalid();
    passages.push({id:b.id,quote:b.quote,quads:b.quads,documentId:context.documentId,fingerprint:context.fingerprint,pageIndex:index});
   }
   pages.push(passages);
  }
  return prepareSurfingContext({context,pageCount:doc.pageCount,readPage:async index=>pages[index],getContext:ports.getContext,signal,maxCharacters:160000,maxPassages:5000});
 };
}
