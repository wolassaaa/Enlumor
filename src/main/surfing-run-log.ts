import {appendFileSync,mkdirSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';
import type {AiProtocol,AiUsage} from '../shared/ai';

/** Local diagnostics: how a request ran, never what was said. No paper text, question, answer, search query, endpoint or key. */
export type SurfingRunAction={type:'view_page'|'read_page';pageNumber:number;truncated?:boolean;skipped?:boolean}|{type:'search';cjk:boolean;queryLength:number;hits:number};
export type SurfingRunFailure='empty'|'fenced'|'not-json'|'actions-rejected'|'schema';
export type SurfingRunStep={ms:number;measuredInputTokens:number;outputCharacters:number;usage?:AiUsage;reply?:'route'|'actions'|'final';unwrapped?:true;failure?:SurfingRunFailure;actions?:SurfingRunAction[]};
export type SurfingRunRecord={version:1;at:string;kind:'route'|'explain'|'ask';protocol:AiProtocol;model:string;document:string;pages:number;passages:number;outcome:'answered'|'failed'|'cancelled';code?:string;durationMs:number;steps:SurfingRunStep[]};

/** Names why a model reply could not be used without keeping the reply itself. */
export function classifySurfingFailure(raw:string):SurfingRunFailure{
 const text=raw.trim();if(text.startsWith('```'))return'fenced';
 let value:unknown;try{value=JSON.parse(text);}catch{return'not-json';}
 return value&&typeof value==='object'&&'actions' in value?'actions-rejected':'schema';
}

/** One JSON line per request; the previous file is kept once when this one reaches the limit. */
export function appendSurfingRun(file:string,record:SurfingRunRecord,limit=5*1024*1024){
 mkdirSync(path.dirname(file),{recursive:true});
 try{if(statSync(file).size>=limit)renameSync(file,file+'.1');}catch{/* no file yet */}
 appendFileSync(file,JSON.stringify(record)+'\n');
}
