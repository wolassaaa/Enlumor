import {it,expect} from 'vitest';
import {indexSurfingFigures} from '../src/shared/surfing-figures';
import {canSeeImages,knownVision} from '../src/shared/ai-models';
const p=(id:string,pageIndex:number,quote:string)=>({id,pageIndex,quote,documentId:'d',fingerprint:'f',quads:[]});
it('indexes captioned figures and tables once, ignoring body mentions',()=>{
 const figures=indexSurfingFigures({passages:[p('a',0,'As Figure 1 shows, the cost grows.'),p('b',1,'Figure 1: Attention cost versus length.'),p('c',2,'Table 2. Results on four benchmarks'),p('d',2,'Fig. 3 | Ablation'),p('e',3,'图 4：方法总览'),p('f',4,'Figure 1: repeated label later')]});
 expect(figures.map(f=>[f.id,f.label,f.pageNumber,f.passageId])).toEqual([['figure-1','Figure 1',2,'b'],['table-2','Table 2',3,'c'],['figure-3','Figure 3',3,'d'],['figure-4','Figure 4',4,'e']]);
});
it('knows which common models can look at images and lets the reader decide otherwise',()=>{
 for(const m of ['gpt-4o','openai/gpt-4.1-mini','claude-sonnet-4-5','gemini-2.5-flash','Qwen/Qwen2.5-VL-72B-Instruct','glm-4.5v','o4-mini'])expect(knownVision(m)).toBe(true);
 for(const m of ['deepseek-chat','o3-mini'])expect(knownVision(m)).toBe(false);
 expect(knownVision('some-new-model')).toBe(null);
 expect(canSeeImages({model:'some-new-model'})).toBe(false);expect(canSeeImages({model:'some-new-model',vision:true})).toBe(true);expect(canSeeImages({model:'gpt-4o',vision:false})).toBe(false);
});
