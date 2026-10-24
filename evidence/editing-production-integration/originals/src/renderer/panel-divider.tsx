import { useRef } from 'react';
export function PanelDivider({ side, size, max, preview, commit, reset, start }: { side:'left'|'right';size:number;max:number;preview:(value:number)=>void;commit:(value:number)=>void;reset:()=>void;start:()=>void }) {
 const drag=useRef<{x:number;size:number}|null>(null),min=side==='left'?176:220;
 const value=(x:number)=>Math.max(min,Math.min(max,drag.current!.size+(x-drag.current!.x)*(side==='left'?1:-1)));
 return <div className="panel-divider" role="separator" aria-label={side==='left'?'调整文档栏宽度':'调整批注栏宽度'} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(size)} tabIndex={0}
 onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();start();event.currentTarget.focus();drag.current={x:event.clientX,size};event.currentTarget.setPointerCapture(event.pointerId);}}
 onPointerMove={event=>{if(drag.current)preview(value(event.clientX));}}
 onPointerUp={event=>{if(!drag.current)return;const next=value(event.clientX);drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);commit(next);}}
 onPointerCancel={()=>{drag.current=null;preview(size);}}
 onLostPointerCapture={()=>{if(drag.current){drag.current=null;preview(size);}}}
 onDoubleClick={reset}
 onKeyDown={event=>{let next=size;const step=event.shiftKey?32:8;
 if(event.key==='ArrowLeft')next+=side==='left'?-step:step;else if(event.key==='ArrowRight')next+=side==='left'?step:-step;else if(event.key==='Home')next=min;else if(event.key==='End')next=max;else return;
 event.preventDefault();start();commit(Math.max(min,Math.min(max,next)));}}/>
}
