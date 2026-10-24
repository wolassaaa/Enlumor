export type DrawingMode='line'|'arrow'|'ink';
const ns='http://www.w3.org/2000/svg';
// Imperative SVG is shared by the draft and saved geometry; points are viewport CSS coordinates.
export function paintDrawing(svg:SVGSVGElement,mode:DrawingMode,points:number[],color:string,width:number) {
 svg.replaceChildren();
 const line=document.createElementNS(ns,mode==='ink'?'polyline':'line');
 if(mode==='ink')line.setAttribute('points',points.reduce((s,n,i)=>s+(i%2?',':' ')+n,'').trim());
 else for(const [key,value]of Object.entries({x1:points[0],y1:points[1],x2:points[2],y2:points[3]}))line.setAttribute(key,String(value));
 line.setAttribute('stroke',color);line.setAttribute('stroke-width',String(width));line.setAttribute('fill','none');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');svg.append(line);
 if(mode==='arrow'){
  const [x1,y1,x2,y2]=points,dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<1e-6)return;
  const size=9*width,head=document.createElementNS(ns,'polygon');
  head.setAttribute('points',`${x2},${y2} ${x2-size*dx/len+size/3*dy/len},${y2-size*dy/len-size/3*dx/len} ${x2-size*dx/len-size/3*dy/len},${y2-size*dy/len+size/3*dx/len}`);
  head.setAttribute('fill',color);svg.append(head);
 }
}
