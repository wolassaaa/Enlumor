import { it, expect } from 'vitest';
import { lineAnchor, validateAnnotation, transform, inverse } from '../src/shared/geometry';
const mark={id:'line-test',documentId:'d',fingerprint:'hash',pageIndex:0,author:'user',color:'#335588',quote:'',note:''};
it('straight line geometry supports horizontal vertical and reversed endpoints',()=>{
 for(const points of [[10,20,80,20],[10,20,10,90],[80,90,10,20]]){
 const a={...mark,type:'line',points,quads:[lineAnchor(points)]};expect(()=>validateAnnotation(a,1)).not.toThrow();
 }
});
it('line endpoints reject missing nonfinite coincident and out-of-anchor points',()=>{
 const a={...mark,type:'line',points:[10,20,80,30],quads:[[9,31,81,31,9,19,81,19]]};
 for(const bad of [undefined,[NaN,20,80,30],[10,20,10,20],[10,20,9999,30]])expect(()=>validateAnnotation({...a,points:bad},1)).toThrow();
});
it('line coordinate round trips preserve direction through all page rotations and display scales',()=>{
 for(const m of [[1,0,0,-1,0,100],[0,1,1,0,0,0],[-1,0,0,1,100,0],[0,-1,-1,0,100,100],[2,0,0,-2,-40,240]]){
 const point=transform(20,70,m);const restored=transform(...point,inverse(m));expect(restored[0]).toBeCloseTo(20);expect(restored[1]).toBeCloseTo(70);
 }
});
it('strikeout accepts native text quads through the shared validator',()=>expect(()=>validateAnnotation({...mark,type:'strikeout',quads:[[10,90,80,90,10,70,80,70]]},1)).not.toThrow());
