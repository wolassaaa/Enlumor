/** A benchmark travels inside its PDF (a QR code on the last page and the same manifest as an embedded file).
 * The manifest comes from an untrusted document, so it is validated strictly before the app uses it. */
export type BenchmarkExpect={all?:string[];any?:string[];none?:string[];evidence?:boolean;chinese?:boolean};
export type BenchmarkCheck={id:string;kind:'ask'|'route'|'guided';title:string;question?:string;expect?:BenchmarkExpect;
 vision?:{mustView?:boolean;expect:BenchmarkExpect};textOnly?:{expect:BenchmarkExpect};minStops?:number;dwell?:number;depth?:'concise'|'standard'|'detailed'};
export type BenchmarkManifest={enlumorBenchmark:1;name:string;checks:BenchmarkCheck[]};
export type BenchmarkStatus='pass'|'fail'|'review'|'skip';
export const BENCHMARK_FILE='enlumor-benchmark.json';

const fail=():never=>{throw Error('BENCHMARK_INVALID');};
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))fail();}
// Short patterns whose groups are never repeated: (a+)+ and (a|aa)+ backtrack exponentially, so a crafted manifest could make
// grading hang. An optional group, (\.0)?, is fine; so are repeated characters and classes. Backreferences are refused too.
function pattern(v:unknown){
 if(!text(v,200)||/(^|[^\\])\)\s*[*+{]/.test(v as string)||/\\[1-9]/.test(v as string))fail();
 try{new RegExp(v as string,'i');}catch{fail();}
}
function expectation(v:unknown){
 if(!record(v))fail();const e=v as Record<string,unknown>;keys(e,['all','any','none','evidence','chinese']);
 for(const list of ['all','any','none'])if(e[list]!==undefined){if(!Array.isArray(e[list])||(e[list] as unknown[]).length>10)fail();(e[list] as unknown[]).forEach(pattern);}
 for(const flag of ['evidence','chinese'])if(e[flag]!==undefined&&typeof e[flag]!=='boolean')fail();
}
export function validateBenchmarkManifest(value:unknown):BenchmarkManifest{
 if(!record(value)||value.enlumorBenchmark!==1||!text(value.name,200)||!Array.isArray(value.checks)||!value.checks.length||value.checks.length>20)fail();
 const m=value as Record<string,any>;keys(m,['enlumorBenchmark','name','checks']);const ids=new Set<string>();
 for(const c of m.checks){
  if(!record(c)||!text(c.id,40)||!/^[\w-]+$/.test(c.id as string)||ids.has(c.id as string)||!text(c.title,120)||!['ask','route','guided'].includes(c.kind as string))fail();ids.add(c.id as string);
  keys(c,['id','kind','title','question','expect','vision','textOnly','minStops','dwell','depth']);
  if(c.kind==='ask'){if(!text(c.question,2000))fail();if(c.expect!==undefined)expectation(c.expect);if(c.expect===undefined&&c.vision===undefined&&c.textOnly===undefined)fail();}
  else if(c.expect!==undefined)expectation(c.expect);
  if(c.vision!==undefined){if(!record(c.vision))fail();keys(c.vision as Record<string,unknown>,['mustView','expect']);const mv=(c.vision as any).mustView;if(mv!==undefined&&typeof mv!=='boolean')fail();expectation((c.vision as any).expect);}
  if(c.textOnly!==undefined){if(!record(c.textOnly))fail();keys(c.textOnly as Record<string,unknown>,['expect']);expectation((c.textOnly as any).expect);}
  if(c.minStops!==undefined&&!(Number.isInteger(c.minStops)&&(c.minStops as number)>=1&&(c.minStops as number)<=5))fail();
  if(c.dwell!==undefined&&!(Number.isInteger(c.dwell)&&(c.dwell as number)>=5&&(c.dwell as number)<=600))fail();
  if(c.depth!==undefined&&!['concise','standard','detailed'].includes(c.depth as string))fail();
 }
 return structuredClone(m) as BenchmarkManifest;
}

/** What an answer misses; empty means it meets every expectation. */
export function benchmarkMisses(answer:string,evidence:number,e:BenchmarkExpect):string[]{
 // Answers are read as text: markdown emphasis and code marks (**5** 个, `d_model`) do not count against a pattern.
 answer=answer.replace(/\*\*|__|`/g,'');
 const m:string[]=[],re=(s:string)=>new RegExp(s,'i');
 for(const s of e.all||[])if(!re(s).test(answer))m.push(`缺少「${s}」`);
 if(e.any?.length&&!e.any.some(s=>re(s).test(answer)))m.push(`没有提到「${e.any.join('」或「')}」`);
 for(const s of e.none||[])if(re(s).test(answer))m.push(`不应出现「${s}」`);
 if(e.evidence&&!evidence)m.push('没有原文证据');
 if(e.chinese&&!/[一-鿿]/.test(answer))m.push('没有用中文回答');
 return m;
}
/** Grades generated entry points: enough of them, and what the manifest expects of their titles and reasons;
 * `chinese` here means every title is written in Chinese, since the reader sees the titles first. */
export function gradeBenchmarkRoute(check:BenchmarkCheck,stops:{title:string;reason?:string}[]):{status:BenchmarkStatus;detail:string}{
 const min=check.minStops||1,m:string[]=stops.length>=min?[]:[`只有 ${stops.length} 个切入点（至少 ${min} 个）`];
 if(check.expect){const {chinese,...rest}=check.expect;m.push(...benchmarkMisses(stops.map(s=>s.title+' '+(s.reason||'')).join('\n'),stops.length,rest));if(chinese&&stops.some(s=>!/[一-鿿]/.test(s.title)))m.push('有切入点标题没有用中文');}
 return{status:m.length?'fail':'pass',detail:(m.length?m.join('；')+' · ':'')+`${stops.length} 个切入点（至少 ${min} 个）`};
}
/** Grades one question: vision models against the vision expectations (and whether they looked), text-only models
 * against theirs (a miss there needs a human, since a correct answer may honestly come from the text). */
export function gradeBenchmarkAnswer(check:BenchmarkCheck,vision:boolean,answer:string,evidence:number,steps:string[]):{status:BenchmarkStatus;detail:string}{
 const did=steps.length?`过程：${steps.join('、')} · `:'';
 if(vision&&check.vision){
  const m=benchmarkMisses(answer,evidence,check.vision.expect),viewed=steps.some(s=>s.includes('查看第'));
  return{status:m.length?'fail':check.vision.mustView&&!viewed?'review':'pass',detail:did+(m.length?m.join('；'):'答案符合预期')+(check.vision.mustView&&!viewed?' · 但没有先查看页面':'')};
 }
 if(!vision&&check.textOnly){
  const m=benchmarkMisses(answer,evidence,check.textOnly.expect);
  return{status:m.length?'review':'pass',detail:did+(m.length?'只读文字的模型没有说明看不到图，请人工确认答案是否来自正文':'说明了看不到图')};
 }
 const m=benchmarkMisses(answer,evidence,check.expect||{});
 return{status:m.length?'fail':'pass',detail:did+(m.length?m.join('；'):`答案符合预期 · 原文证据 ${evidence} 处`)};
}
