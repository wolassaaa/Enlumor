import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gradeBenchmarkAnswer,validateBenchmarkManifest} from '../src/shared/benchmark';
const load=(f:string)=>JSON.parse(readFileSync('tests/acceptance/'+f,'utf8'));
const ask={id:'a',kind:'ask',title:'t',question:'q',expect:{all:['x']}};
it('accepts the shipped benchmarks',()=>{for(const f of ['lumen-benchmark.json','attention-benchmark.json'])expect(validateBenchmarkManifest(load(f)).checks.length).toBeGreaterThan(3);});
it('rejects manifests a crafted PDF could carry',()=>{
 const bad=[null,{enlumorBenchmark:2,name:'n',checks:[ask]},{enlumorBenchmark:1,name:'n',checks:[]},{enlumorBenchmark:1,name:'n',checks:[ask],run:'rm -rf'},
  {enlumorBenchmark:1,name:'n',checks:[{...ask,expect:{all:['(a+)+$']}}]},{enlumorBenchmark:1,name:'n',checks:[{...ask,expect:{all:['[unclosed']}}]},
  {enlumorBenchmark:1,name:'n',checks:[{...ask,question:undefined}]},{enlumorBenchmark:1,name:'n',checks:[ask,ask]},{enlumorBenchmark:1,name:'n',checks:Array.from({length:21},(_,i)=>({...ask,id:'c'+i}))},
  {enlumorBenchmark:1,name:'n',checks:[{...ask,kind:'shell'}]},{enlumorBenchmark:1,name:'n',checks:[{...ask,expect:{all:['x'.repeat(201)]}}]},{enlumorBenchmark:1,name:'n',checks:[{id:'g',kind:'guided',title:'t',dwell:1}]}];
 for(const m of bad)expect(()=>validateBenchmarkManifest(m)).toThrow('BENCHMARK_INVALID');
});
it('grades vision models on whether they looked, and text-only models on honesty',()=>{
 const figure=load('lumen-benchmark.json').checks.find((c:any)=>c.id==='figure');
 expect(gradeBenchmarkAnswer(figure,true,'Retrieval 最高',1,['查看第 2 页']).status).toBe('pass');
 expect(gradeBenchmarkAnswer(figure,true,'Retrieval 最高',1,[]).status).toBe('review');
 expect(gradeBenchmarkAnswer(figure,true,'Lumen 最高',1,['查看第 2 页']).status).toBe('fail');
 expect(gradeBenchmarkAnswer(figure,false,'我看不到图像，只能根据图注推测',1,[]).status).toBe('pass');
 expect(gradeBenchmarkAnswer(figure,false,'Lumen 大概最好',1,[]).status).toBe('review');
 const method=load('lumen-benchmark.json').checks.find((c:any)=>c.id==='method');
 expect(gradeBenchmarkAnswer(method,false,'方法叫 Lumen Routing',2,[]).status).toBe('pass');
 expect(gradeBenchmarkAnswer(method,false,'It is called Lumen Routing',2,[]).detail).toContain('没有用中文回答');
 expect(gradeBenchmarkAnswer(method,false,'方法叫 Lumen Routing',0,[]).detail).toContain('没有原文证据');
});
