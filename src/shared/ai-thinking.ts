import type {AiProfileInput} from './ai';

/** One of a model's own thinking levels, named the way its service names it. The default level sends nothing. */
export type ThinkingChoice={id:string;label:string;parameters:Record<string,unknown>};
export type ThinkingOptions={choices:ThinkingChoice[];defaultId:string};
type Model=Pick<AiProfileInput,'protocol'|'endpoint'|'model'>;

const host=(endpoint:string)=>{try{return new URL(endpoint).hostname;}catch{return'';}};
const name=(model:string)=>model.trim().toLowerCase().split('/').pop()||'';

/** The thinking levels a configured model offers, or null when we have not verified how its service controls thinking.
 * DeepSeek (verified with a real key, 2026-10-26): thinking can be switched off, and reasoning_effort is low/high/max with
 * high as the default. OpenAI reasoning models document reasoning_effort low/medium/high on Chat Completions. */
export function thinkingOptions(profile:Model):ThinkingOptions|null{
 if(profile.protocol!=='openai-chat')return null;
 const service=host(profile.endpoint),model=name(profile.model);
 if(service==='api.deepseek.com'&&/^deepseek-/.test(model))return{defaultId:'high',choices:[
  {id:'off',label:'不思考',parameters:{thinking:{type:'disabled'}}},
  {id:'low',label:'low',parameters:{reasoning_effort:'low'}},
  {id:'high',label:'high（默认）',parameters:{}},
  {id:'max',label:'max',parameters:{reasoning_effort:'max'}},
 ]};
 if(service==='api.openai.com'&&/^(o[134]|gpt-5)/.test(model))return{defaultId:'medium',choices:[
  {id:'low',label:'low',parameters:{reasoning_effort:'low'}},
  {id:'medium',label:'medium（默认）',parameters:{}},
  {id:'high',label:'high',parameters:{reasoning_effort:'high'}},
 ]};
 return null;
}

/** The request parameters for a chosen level; no level (or the default) changes nothing. An unknown level is refused. */
export function thinkingParameters(profile:Model,id?:string):Record<string,unknown>{
 if(id===undefined)return{};
 const choice=thinkingOptions(profile)?.choices.find(c=>c.id===id);
 if(!choice)throw Error('SURFING_INVALID_REQUEST');
 return choice.parameters;
}
