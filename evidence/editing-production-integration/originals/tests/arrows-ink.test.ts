import { it, expect } from 'vitest';
import { validateAnnotation, lineAnchor } from '../src/shared/geometry';
const base={id:'draw-test',documentId:'d',fingerprint:'h',pageIndex:0,author:'user',color:'#335588',quote:'',note:''};
it('arrow keeps directed native endpoints and rejects coincident or missing points',()=>{
 const a={...base,type:'arrow',points:[80,30,10,90],quads:[lineAnchor([80,30,10,90])]};
 expect(()=>validateAnnotation(a,1)).not.toThrow();
 for(const points of [undefined,[10,20,10,20],[NaN,20,80,30],[1,2,3]])expect(()=>validateAnnotation({...a,points},1)).toThrow();
});

it('ink accepts an ordered closed path but rejects malformed or unbounded samples',()=>{
 const a={...base,type:'ink',points:[10,20,80,90,10,20],quads:[[9,91,81,91,9,19,81,19]]};
 expect(()=>validateAnnotation(a,1)).not.toThrow();
 for(const points of [undefined,[],[10,20,30],[10,20,10,20],[NaN,20,80,30],[10,20,90,100],Array(8194).fill(20)])expect(()=>validateAnnotation({...a,points},1)).toThrow();
});
