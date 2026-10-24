import {parentPort,workerData} from 'node:worker_threads';
import {countSurfingPromptTokens} from './surfing-token-count';
try{parentPort?.postMessage(countSurfingPromptTokens(workerData.profile,workerData.prompt));}catch{parentPort?.postMessage(null);}
