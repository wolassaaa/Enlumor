import{strokeIntersectsEraser}from'../shared/geometry';
import type{Annotation}from'../shared/model';
type View={div:HTMLElement;viewport:{width:number;height:number;scale:number;transform:number[]}};
export class EraserTool{
 private enabled=false;private frame=0;
 private gesture?:{id:number;index:number;view:View;previous:[number,number];hits:Set<string>;marks:Annotation[]};
 constructor(private container:HTMLElement,private page:(index:number)=>View|undefined,private marks:()=>Annotation[],private ready:()=>boolean,private erased:(ids:string[])=>void){
  container.addEventListener('pointerdown',event=>{
   if(!this.enabled||!this.ready()||!event.isPrimary||event.button!==0||this.gesture)return;
   const element=(event.target as Element).closest<HTMLElement>('.page');if(!element)return;
   const index=Number(element.dataset.pageNumber)-1,view=this.page(index);if(!view)return;
   event.preventDefault();getSelection()?.removeAllRanges();
   this.gesture={id:event.pointerId,index,view,previous:this.point(event,view),hits:new Set(),marks:this.marks().filter(a=>a.pageIndex===index&&a.type==='ink')};
   this.hit(this.gesture.previous);this.refresh();container.setPointerCapture(event.pointerId);
  },{capture:true});
  container.addEventListener('pointermove',event=>{
   if(!this.ready()){this.cancel();return;}const g=this.gesture;if(!g||g.id!==event.pointerId)return;
   this.hit(this.point(event,g.view));if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.refresh();});
  });
  container.addEventListener('pointerup',event=>{
   if(!this.ready()){this.cancel();return;}const g=this.gesture;if(!g||g.id!==event.pointerId)return;
   this.hit(this.point(event,g.view));const ids=[...g.hits];this.cancel();if(ids.length){this.setEnabled(false);this.erased(ids);}
  });
  for(const name of ['pointercancel','lostpointercapture'])container.addEventListener(name,event=>{if(this.gesture?.id===(event as PointerEvent).pointerId)this.cancel();});
  container.addEventListener('scroll',()=>this.cancel(),{passive:true});
 }
 setEnabled(enabled:boolean){this.cancel();this.enabled=enabled;this.container.classList.toggle('erasing-ink',enabled);}
 cancel(){cancelAnimationFrame(this.frame);this.frame=0;const g=this.gesture;this.gesture=undefined;this.refresh();if(g&&this.container.hasPointerCapture(g.id))this.container.releasePointerCapture(g.id);}
 refresh(){for(const svg of this.container.querySelectorAll<SVGSVGElement>('.drawn-ink'))svg.classList.toggle('erase-preview',!!this.gesture?.hits.has(svg.dataset.annotationId!));}
 private point(event:PointerEvent,view:View):[number,number]{const r=view.div.getBoundingClientRect();return[Math.max(0,Math.min(view.viewport.width,event.clientX-r.left-view.div.clientLeft)),Math.max(0,Math.min(view.viewport.height,event.clientY-r.top-view.div.clientTop))];}
 private hit(next:[number,number]){const g=this.gesture!;for(const mark of g.marks)if(!g.hits.has(mark.id)&&strokeIntersectsEraser(mark.points!,g.view.viewport.transform,g.previous,next,8+.5625*g.view.viewport.scale))g.hits.add(mark.id);g.previous=next;}
}
