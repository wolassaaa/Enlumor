import type { Annotation, Quad } from './model';
export function transform(x: number, y: number, m: number[]): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function inverse(m: number[]): number[] {
  const d = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(d) || d === 0) throw new Error('INVALID_GEOMETRY');
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}
export function screenRectToQuad(rect: [number, number, number, number], m: number[]): Quad {
  const inv = inverse(m);
  const points = [transform(rect[0], rect[1], inv), transform(rect[2], rect[1], inv), transform(rect[0], rect[3], inv), transform(rect[2], rect[3], inv)];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.max(...ys), b = Math.min(...ys);
  return [l, t, r, t, l, b, r, b];
}
export function quadToScreen(q: Quad, m: number[]): [number, number, number, number] {
  const points = [0, 2, 4, 6].map(i => transform(q[i], q[i + 1], m));
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
export function validateAnnotation(value: unknown, pageCount: number): asserts value is Annotation {
  const a = value as Annotation;
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !/^[\w-]{1,100}$/.test(a.id) || typeof a.documentId !== 'string' || typeof a.fingerprint !== 'string' || !['highlight', 'underline', 'strikeout', 'line', 'arrow', 'ink', 'note'].includes(a.type) || a.author !== 'user' ||
      !Number.isInteger(a.pageIndex) || a.pageIndex < 0 || a.pageIndex >= pageCount ||
      typeof a.quote !== 'string' || a.quote.length > 100000 || typeof a.note !== 'string' || a.note.length > 100000 ||
      !/^#[0-9a-f]{6}$/i.test(a.color) || !Array.isArray(a.quads) || !a.quads.length || a.quads.length > 10000 ||
      a.quads.some(q => !Array.isArray(q) || q.length !== 8 || q.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e7) || q[2] <= q[0] || q[1] <= q[5])) {
    throw new Error('INVALID_ANNOTATION: 批注类型、页码或坐标无效');
  }
  if((a.type==='line'||a.type==='arrow')) {
    const p=a.points,q=a.quads[0];
    if(!Array.isArray(p)||p.length!==4||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e7)||a.quads.length!==1||Math.hypot(p[2]-p[0],p[3]-p[1])<1e-6||[0,2].some(i=>p[i]<q[0]||p[i]>q[2]||p[i+1]<q[5]||p[i+1]>q[1]))throw new Error('INVALID_ANNOTATION: 直线端点无效');
  }
  if(a.type==='ink') {
    const p=a.points,q=a.quads[0];
    if(!Array.isArray(p)||p.length<4||p.length>8192||p.length%2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e7)||a.quads.length!==1||!p.some((n,i)=>i>=2&&Math.abs(n-p[i%2])>=1e-6)||p.some((n,i)=>i%2?n<q[5]||n>q[1]:n<q[0]||n>q[2]))throw new Error('INVALID_ANNOTATION: 画笔路径无效');
  }
}

export function lineAnchor(points: number[]): Quad {
  const xs=points.filter((_,i)=>i%2===0),ys=points.filter((_,i)=>i%2===1);
  const l=Math.min(...xs)-.25,r=Math.max(...xs)+.25,t=Math.max(...ys)+.25,b=Math.min(...ys)-.25;
  return [l,t,r,t,l,b,r,b];
}

/** Swept eraser versus each native ink segment, in viewport CSS pixels. */
export function strokeIntersectsEraser(points:number[],matrix:number[],from:[number,number],to:[number,number],radius:number):boolean {
 const distance=(p:[number,number],a:[number,number],b:[number,number])=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
 };
 const cross=(a:[number,number],b:[number,number],p:[number,number])=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 let a=transform(points[0],points[1],matrix);
 for(let i=2;i<points.length;i+=2){
  const b=transform(points[i],points[i+1],matrix);
  if(Math.max(a[0],b[0])+radius>=Math.min(from[0],to[0])&&Math.min(a[0],b[0])-radius<=Math.max(from[0],to[0])&&Math.max(a[1],b[1])+radius>=Math.min(from[1],to[1])&&Math.min(a[1],b[1])-radius<=Math.max(from[1],to[1])){
   const overlap=Math.max(a[0],b[0])>=Math.min(from[0],to[0])&&Math.min(a[0],b[0])<=Math.max(from[0],to[0])&&Math.max(a[1],b[1])>=Math.min(from[1],to[1])&&Math.min(a[1],b[1])<=Math.max(from[1],to[1]);
   if((overlap&&cross(a,b,from)*cross(a,b,to)<=0&&cross(from,to,a)*cross(from,to,b)<=0)||Math.min(distance(a,from,to),distance(b,from,to),distance(from,a,b),distance(to,a,b))<=radius)return true;
  }
  a=b;
 }
 return false;
}
