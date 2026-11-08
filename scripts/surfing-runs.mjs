// Summarises the local Surfing run records: node scripts/surfing-runs.mjs [file]
import {readFileSync} from 'node:fs';
import path from 'node:path';

const file=process.argv[2]||path.join(process.env.APPDATA||'','Enlumor','logs','surfing-runs.jsonl');
const runs=readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
const tally=values=>Object.fromEntries(Object.entries(values.reduce((all,v)=>({...all,[v]:(all[v]||0)+1}),{})).sort((a,b)=>b[1]-a[1]));
const average=values=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;
const steps=runs.flatMap(r=>r.steps),actions=steps.flatMap(s=>s.actions||[]),searches=actions.filter(a=>a.type==='search'),finished=runs.filter(r=>r.outcome!=='cancelled');
const tokens=r=>r.steps.reduce((sum,s)=>sum+(s.usage?.inputTokens??s.measuredInputTokens),0);
const reported=steps.filter(s=>s.usage?.inputTokens!==undefined),input=reported.reduce((n,s)=>n+s.usage.inputTokens,0),cached=reported.reduce((n,s)=>n+(s.usage.cachedInputTokens||0),0);
console.log(JSON.stringify({
 file,runs:runs.length,byKind:tally(runs.map(r=>r.kind)),byModel:tally(runs.map(r=>r.model)),outcomes:tally(runs.map(r=>r.outcome)),
 answeredRate:finished.length?Math.round(finished.filter(r=>r.outcome==='answered').length/finished.length*100)+'%':'n/a',
 errors:tally(runs.flatMap(r=>r.code?[r.code]:[])),replyFailures:tally(steps.flatMap(s=>s.failure?[s.failure]:[])),
 averagePerRun:{steps:Math.round(steps.length/(runs.length||1)*10)/10,inputTokens:average(runs.map(tokens)),outputTokens:average(runs.map(r=>r.steps.reduce((n,s)=>n+(s.usage?.outputTokens||0),0))),seconds:Math.round(average(runs.map(r=>r.durationMs))/100)/10},
 recovered:{unwrapped:steps.filter(s=>s.unwrapped).length,repairedRuns:runs.filter(r=>r.outcome==='answered'&&r.steps.some(s=>s.failure)).length},
 usageReportedSteps:`${reported.length}/${steps.length}`,cachedInput:input?Math.round(cached/input*100)+'%':'n/a',
 tools:tally(actions.map(a=>a.type)),searches:{total:searches.length,noHits:searches.filter(a=>!a.hits).length,chineseNoHits:searches.filter(a=>a.cjk&&!a.hits).length},truncatedReads:actions.filter(a=>a.truncated).length,
},null,1));
