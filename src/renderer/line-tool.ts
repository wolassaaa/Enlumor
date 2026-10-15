import { inverse, lineAnchor, transform } from '../shared/geometry';
export type DrawnLine = { pageIndex:number; points:number[]; quads:number[][] };
type PageView = {div:HTMLElement;viewport:{width:number;height:number;transform:number[]}};
export class LineTool {
 private enabled=false;
 private gesture?:{id:number;index:number;view:PageView;start:[number,number];svg:SVGSVGElement;line:SVGLineElement};
 constructor(private container:HTMLElement, private page:(index:number)=>PageView|undefined, private ready:()=>boolean, private created:(line:DrawnLine)=>void) {
  container.addEventListener('pointerdown',event=>{
   if(!this.enabled||!this.ready()||event.button!==0||this.gesture)return;
   const target=(event.target as Element).closest<HTMLElement>('.page');if(!target)return;
   const index=Number(target.dataset.pageNumber)-1,view=this.page(index);if(!view)return;
   event.preventDefault();getSelection()?.removeAllRanges();
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('line-draft');
   const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('stroke','#5a7350');line.setAttribute('stroke-width','1.5');svg.append(line);target.append(svg);
   this.gesture={id:event.pointerId,index,view,start:this.point(event,view),svg,line};this.update(event);container.setPointerCapture(event.pointerId);
  },{capture:true});
  container.addEventListener('pointermove',event=>{if(!this.ready()){this.cancel();return;}if(this.gesture?.id===event.pointerId)this.update(event);});
  container.addEventListener('pointerup',event=>{
   if(!this.ready()){this.cancel();return;}const g=this.gesture;if(!g||g.id!==event.pointerId)return;
   const end=this.point(event,g.view),valid=Math.hypot(end[0]-g.start[0],end[1]-g.start[1])>=3;
   const matrix=inverse(g.view.viewport.transform),points=[...transform(...g.start,matrix),...transform(...end,matrix)];
   this.cancel();if(valid){this.setEnabled(false);this.created({pageIndex:g.index,points,quads:[lineAnchor(points)]});}
  });
  container.addEventListener('pointercancel',()=>this.cancel());
  container.addEventListener('lostpointercapture',()=>this.cancel());
  container.addEventListener('scroll',()=>this.cancel(),{passive:true});
 }
 setEnabled(enabled:boolean){this.cancel();this.enabled=enabled;this.container.classList.toggle('drawing-line',enabled);}
 cancel(){const g=this.gesture;this.gesture=undefined;if(g){g.svg.remove();if(this.container.hasPointerCapture(g.id))this.container.releasePointerCapture(g.id);}}
 private point(event:PointerEvent,view:PageView):[number,number]{const rect=view.div.getBoundingClientRect();return[Math.max(0,Math.min(view.viewport.width,event.clientX-rect.left-view.div.clientLeft)),Math.max(0,Math.min(view.viewport.height,event.clientY-rect.top-view.div.clientTop))];}
 private update(event:PointerEvent){const g=this.gesture!;const end=this.point(event,g.view);for(const [key,value]of Object.entries({x1:g.start[0],y1:g.start[1],x2:end[0],y2:end[1]}))g.line.setAttribute(key,String(value));}
}
