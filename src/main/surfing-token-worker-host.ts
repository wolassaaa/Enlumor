import {Worker} from 'node:worker_threads';
import type {AiProfileInput,AiPrompt} from '../shared/ai';
import {supportedSurfingTokenizer} from './surfing-tokenizer-models';
type Model=Pick<AiProfileInput,'protocol'|'model'>;
/** Keep tokenizer tables and computation out of Electron's foreground main thread. */
export function measureSurfingInputTokens(profile:Model,prompt:AiPrompt,signal:AbortSignal,workerPath:string):Promise<number|null>{
 if(signal.aborted)return Promise.reject(Error('SURFING_CANCELED'));
 if(!supportedSurfingTokenizer(profile))return Promise.resolve(null);
 return new Promise((resolve,reject)=>{
  let settled=false,worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const finish=(value:number|null,error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);void worker?.terminate();if(error)reject(error);else resolve(value);};
  const abort=()=>finish(null,Error('SURFING_CANCELED'));
  signal.addEventListener('abort',abort,{once:true});
  try{
   worker=new Worker(workerPath,{workerData:{profile:{protocol:profile.protocol,model:profile.model},prompt:{system:prompt.system,user:prompt.user}}});
   worker.once('message',value=>finish(Number.isSafeInteger(value)&&value>=0?value:null));
   worker.once('error',()=>finish(null));worker.once('exit',()=>finish(null));
   timer=setTimeout(()=>finish(null),10000);
   if(signal.aborted)abort();
  }catch{finish(null);}
 });
}
