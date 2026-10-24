import { inverse, lineAnchor, transform } from '../shared/geometry';
import { paintDrawing, type DrawingMode } from './drawing-svg';
export type DrawnLine = { pageIndex:number; points:number[]; quads:number[][]; type:DrawingMode };
type PageView = {div:HTMLElement;viewport:{width:number;height:number;scale:number;transform:number[]}};
export class LineTool {
 private mode:DrawingMode|null=null;
 private frame=0;
 private gesture?:{id:number;index:number;view:PageView;mode:DrawingMode;color:string;start:[number,number];samples:number[];svg:SVGSVGElement};
 constructor(private container:HTMLElement, private page:(index:number)=>PageView|undefined, private ready:()=>boolean, private created:(line:DrawnLine)=>void,private color:()=>string=()=> '#5a7350') {
  container.addEventListener('pointerdown',event=>{
   if(!this.mode||!this.ready()||event.button!==0||!event.isPrimary||this.gesture)return;
   const target=(event.target as Element).closest<HTMLElement>('.page');if(!target)return;
   const index=Number(target.dataset.pageNumber)-1,view=this.page(index);if(!view)return;
   event.preventDefault();getSelection()?.removeAllRanges();
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('line-draft');target.append(svg);
   const start=this.point(event,view);this.gesture={id:event.pointerId,index,view,mode:this.mode,color:this.color(),start,samples:[...start],svg};
   this.preview();container.setPointerCapture(event.pointerId);
  },{capture:true});
  container.addEventListener('pointermove',event=>{
   if(!this.ready()){this.cancel();return;}if(this.gesture?.id!==event.pointerId)return;
   this.sample(this.point(event,this.gesture.view));if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.preview();});
  });
  container.addEventListener('pointerup',event=>{
   if(!this.ready()){this.cancel();return;}const g=this.gesture;if(!g||g.id!==event.pointerId)return;
   const end=this.point(event,g.view);this.sample(end,true);
   const screen=g.mode==='ink'?g.samples:[...g.start,...end];
   const valid=g.mode==='ink'?screen.some((_,i)=>i%2===0&&Math.hypot(screen[i]-g.start[0],screen[i+1]-g.start[1])>=3):Math.hypot(end[0]-g.start[0],end[1]-g.start[1])>=3;
   const matrix=inverse(g.view.viewport.transform),points=screen.flatMap((_,i)=>i%2===0?transform(screen[i],screen[i+1],matrix):[]);
   this.cancel();if(valid){this.setMode(null);this.created({pageIndex:g.index,points,quads:[lineAnchor(points)],type:g.mode});}
  });
  container.addEventListener('pointercancel',event=>{if(this.gesture?.id===event.pointerId)this.cancel();});
  container.addEventListener('lostpointercapture',event=>{if(this.gesture?.id===event.pointerId)this.cancel();});
  container.addEventListener('scroll',()=>this.cancel(),{passive:true});
 }
 setMode(mode:DrawingMode|null){this.cancel();this.mode=mode;this.container.classList.toggle('drawing-line',mode!==null);}
 setEnabled(enabled:boolean){this.setMode(enabled?'line':null);}
 cancel(){cancelAnimationFrame(this.frame);this.frame=0;const g=this.gesture;this.gesture=undefined;if(g){g.svg.remove();if(this.container.hasPointerCapture(g.id))this.container.releasePointerCapture(g.id);}}
 private point(event:PointerEvent,view:PageView):[number,number]{const rect=view.div.getBoundingClientRect();return[Math.max(0,Math.min(view.viewport.width,event.clientX-rect.left-view.div.clientLeft)),Math.max(0,Math.min(view.viewport.height,event.clientY-rect.top-view.div.clientTop))];}
 private sample(point:[number,number],terminal=false){
  const g=this.gesture!;if(g.mode!=='ink'){g.samples=[...g.start,...point];return;}
  const p=g.samples,d=Math.hypot(point[0]-p[p.length-2],point[1]-p[p.length-1]);if(d===0||(!terminal&&d<.75))return;
  // Thin only at the cap; retain ordering, first sample and the new terminal sample.
  if(p.length>=8192)g.samples=p.filter((_,i)=>Math.floor(i/2)%2===0);
  g.samples.push(...point);
 }
 private preview(){const g=this.gesture;if(!g)return;paintDrawing(g.svg,g.mode,g.mode==='ink'?g.samples:g.samples.length===4?g.samples:[...g.start,...g.start],g.color,1.125*g.view.viewport.scale);}
}
