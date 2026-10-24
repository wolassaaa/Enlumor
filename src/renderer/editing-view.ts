import type {EditingView} from '../shared/editing-bridge';
import type {EditActor,EditMark} from '../shared/editing-commands';
export type MarkView={id:string;type:EditMark['type'];version:number|null;anchorId:string|null;pageIndex:number;quote:string;quads:number[][];points?:number[];color:string;note:string;origin:EditActor;retained:boolean;visible:boolean;editable:boolean;reason?:string;placement:{dx:number;dy:number}};
export function projectEditingView(view:EditingView):MarkView[]{
 const marks=view.marks.map(({id,type,version,anchorId,pageIndex,quote,quads,points,color,note,origin,retained,visible,placement})=>({id,type,version,anchorId,pageIndex,quote,quads:quads.map(q=>[...q]),...(points?{points:[...points]}:{}),color,note,origin:{...origin},retained,visible,editable:true,placement:{...placement}}));
 const ids=new Set(marks.map(m=>m.id));
 return [...marks,...view.legacy.filter(l=>!ids.has(l.legacyId)).map(l=>{const {id,type,pageIndex,quote,quads,points,color,note}=l.annotation;return{id,type,pageIndex,quote,quads:quads.map(q=>[...q]),...(points?{points:[...points]}:{}),color,note,version:null,anchorId:null,origin:{kind:'user' as const,id:'legacy'},retained:true,visible:true,editable:false,reason:l.reason,placement:{dx:0,dy:0}};})];
}
