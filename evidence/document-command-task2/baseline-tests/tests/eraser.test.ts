import{it,expect}from'vitest';import{strokeIntersectsEraser}from'../src/shared/geometry';
const m=[1,0,0,1,0,0];
it('eraser sweeps between pointer samples instead of skipping a thin stroke',()=>{
 expect(strokeIntersectsEraser([0,0,10,0],m,[5,-10],[5,10],0)).toBe(true);
 expect(strokeIntersectsEraser([0,0,10,0],m,[5,4],[5,4],3)).toBe(false);
 expect(strokeIntersectsEraser([0,0,10,0],m,[5,4],[5,4],4)).toBe(true);
});
it('eraser checks actual polyline rather than erasing empty bounding box interiors',()=>{
 const square=[0,0,10,0,10,10,0,10,0,0];expect(strokeIntersectsEraser(square,m,[5,5],[5,5],1)).toBe(false);
 expect(strokeIntersectsEraser(square,m,[0,5],[0,5],1)).toBe(true);
});
it('eraser hit radius stays in CSS pixels across rotated scaled crop transforms',()=>{
 for(const matrix of [[0,2,2,0,-20,40],[-2,0,0,-2,80,100]]){
 const from=matrix[0]===0?[-17,50]:[70,103];expect(strokeIntersectsEraser([0,0,10,0],matrix,from as [number,number],from as [number,number],2)).toBe(false);
 expect(strokeIntersectsEraser([0,0,10,0],matrix,from as [number,number],from as [number,number],3)).toBe(true);
 }
});
