import type {CruiseBlock} from '../shared/cruise';
import type {DocumentCommand,DocumentCommandPorts,CommandResult} from '../shared/document-commands';
import type {SurfingContext} from '../shared/surfing-context';
import {runDocumentCommand} from './reading-commands';
type Reader={go:(pageNumber:number,isCurrent:()=>boolean)=>void;locateCruiseBlock:(block:CruiseBlock,isCurrent:()=>boolean)=>Promise<void>;clearCruiseFocus:()=>void};
type Document={id:string;fingerprint:string;pageCount:number};
/** Surfing IDs belong to the verified native snapshot, not PDF.js's block cache. */
export function createSurfingCommandHost(getReader:()=>Reader|null,getDocument:()=>Document|null,getSnapshot:()=>SurfingContext|null){
 let bound:SurfingContext|null=null,epoch=0,sequence=0,cancellation=new AbortController();
 let viewportJob:symbol|null=null;
 function invalidate(){viewportJob=null;epoch++;cancellation.abort();cancellation=new AbortController();getReader()?.clearCruiseFocus();}
 const getContext=()=>{const doc=getDocument(),s=getSnapshot();if(!getReader()||!s||s!==bound||!doc||doc.id!==s.context.documentId||doc.fingerprint!==s.context.fingerprint||doc.pageCount!==s.pageCount)return null;return {...s.context,revision:s.context.revision+epoch};};
 const ports:DocumentCommandPorts={getContext,getPageCount:()=>getDocument()?.pageCount||0,readPage:async pageIndex=>structuredClone(bound?.passages.filter(p=>p.pageIndex===pageIndex)||[]),navigate:async(pageIndex,current)=>{if(current())getReader()?.go(pageIndex+1,current);},focus:async(block,current)=>{if(current())await getReader()?.locateCruiseBlock(block,current);},clearFocus:()=>getReader()?.clearCruiseFocus(),pause:invalidate};
 return {invalidate,run:(command:DocumentCommand):Promise<CommandResult>=>{
  const next=getSnapshot();if(next!==bound){if(bound)invalidate();bound=next;}
  if(command.type==='clear_focus')invalidate();
  const viewport=command.type==='go_to_page'||command.type==='show_evidence';if(viewport&&viewportJob)invalidate();
  const requestId=`surf-command-${++sequence}`,context=getContext();
  if(!context)return Promise.resolve({requestId,ok:false,error:{code:'COMMAND_STALE',message:'The reading context has changed.'}});
  const owner=viewport?Symbol():null;if(owner)viewportJob=owner;
  return runDocumentCommand({requestId,context,command},ports,cancellation.signal).finally(()=>{if(owner&&viewportJob===owner)viewportJob=null;});
 }};
}


