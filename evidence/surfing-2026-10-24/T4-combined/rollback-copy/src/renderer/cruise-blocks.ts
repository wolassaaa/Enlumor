import type{CruiseBlock}from'../shared/cruise';
export type TextSpan={str:string;width:number;height:number;transform:number[];fontName:string};
type Style={ascent?:number;descent?:number};
type Piece={text:string;left:number;right:number;top:number;bottom:number;base:number;height:number;source:number};
type Line=Piece&{pieces:Piece[];column?:number};
const invalid=()=>new Error('CRUISE_INVALID_GEOMETRY');
/** Native PDF geometry only: display rotation/zoom never changes these blocks. */
export function buildPageBlocks(document:{id:string;fingerprint:string},pageIndex:number,pageWidth:number,items:TextSpan[],styles:Record<string,Style>):CruiseBlock[]{
 if(!document||typeof document.id!=='string'||!document.id||typeof document.fingerprint!=='string'||!document.fingerprint||!Number.isInteger(pageIndex)||pageIndex<0||!Number.isFinite(pageWidth)||pageWidth<=0||items.length>20000)throw invalid();
 const pieces:Piece[]=[];
 for(const [source,item]of items.entries()){
  if(typeof item.str!=='string'||!item.str.trim())continue;if(item.str.length>1200)throw new Error('CRUISE_BLOCK_TOO_LONG');
  const m=item.transform;if(!Array.isArray(m)||m.length!==6||m.some(v=>!Number.isFinite(v))||!Number.isFinite(item.width)||item.width<=0)throw invalid();
  const h=Math.hypot(m[2],m[3]),axis=Math.hypot(m[0],m[1]);if(h<1e-6||axis<1e-6)throw invalid();
  const style=styles[item.fontName]||{},ascent=style.ascent??.8,descent=style.descent??-.2;if(!Number.isFinite(ascent)||!Number.isFinite(descent)||ascent<=descent)throw invalid();
  const ux=m[0]/axis,uy=m[1]/axis,vx=m[2]/h,vy=m[3]/h;
  const corners=[[m[4]+vx*h*ascent,m[5]+vy*h*ascent],[m[4]+ux*item.width+vx*h*ascent,m[5]+uy*item.width+vy*h*ascent],[m[4]+vx*h*descent,m[5]+vy*h*descent],[m[4]+ux*item.width+vx*h*descent,m[5]+uy*item.width+vy*h*descent]];
  const piece:Piece={text:item.str,left:Math.min(...corners.map(p=>p[0])),right:Math.max(...corners.map(p=>p[0])),top:Math.max(...corners.map(p=>p[1])),bottom:Math.min(...corners.map(p=>p[1])),base:m[5],height:h,source};
  pieces.push(piece);
 }
 // Detect a persistent physical gutter before joining words into lines.
 const xs=[...new Set(pieces.map(p=>p.left))].sort((a,b)=>a-b);let split:number|undefined,gap=pageWidth*.18;
 for(let i=1;i<xs.length;i++){
  const rightStart=xs[i],distance=rightStart-xs[i-1];if(distance<=gap)continue;
  const left=pieces.filter(p=>p.left<rightStart&&p.right<=rightStart),right=pieces.filter(p=>p.left>=rightStart);
  if(left.length<2||right.length<2)continue;
  const leftEnd=Math.max(...left.map(p=>p.right));if(rightStart-leftEnd<Math.min(...left.map(p=>p.height),...right.map(p=>p.height))*.4)continue;
  gap=distance;split=(leftEnd+rightStart)/2;
 }
 const column=(p:Piece)=>split===undefined?0:p.left<split&&p.right>split?2+p.source:p.left<split?0:1;
 const lines:Line[]=[];
 for(const piece of pieces){
  const col=column(piece),line=lines.find(l=>l.column===col&&Math.abs(l.base-piece.base)<Math.max(piece.height,l.height)*.35&&Math.max(0,piece.left-l.right,l.left-piece.right)<=Math.max(piece.height,l.height)*1.8);
  if(line){line.pieces.push(piece);line.left=Math.min(line.left,piece.left);line.right=Math.max(line.right,piece.right);line.top=Math.max(line.top,piece.top);line.bottom=Math.min(line.bottom,piece.bottom);}
  else lines.push({...piece,pieces:[piece],column:col});
 }
 for(const line of lines){line.pieces.sort((a,b)=>a.left-b.left);line.text='';let right=line.left;for(const p of line.pieces){if(line.text&&p.left-right>line.height*.12&&!/\s$/.test(line.text)&&!/^\s/.test(p.text))line.text+=' ';line.text+=p.text;right=p.right;}line.text=line.text.trim();if(line.text.length>1200)throw new Error('CRUISE_BLOCK_TOO_LONG');}
 const byTop=(a:Line,b:Line)=>b.top-a.top||a.left-b.left;
 let ordered:Line[];
 if(split===undefined)ordered=lines.sort(byTop);
 else{
  const middle=split,spans=lines.filter(l=>l.left<middle&&l.right>middle).sort(byTop);let remaining=lines.filter(l=>!spans.includes(l));ordered=[];
  const columns=(list:Line[])=>{for(const line of list)line.column=line.left<middle?0:1;return list.sort((a,b)=>a.column!-b.column!||byTop(a,b));};
  for(const line of spans){const above=remaining.filter(l=>l.top>line.top);ordered.push(...columns(above));remaining=remaining.filter(l=>!above.includes(l));line.column=2+line.source;ordered.push(line);}ordered.push(...columns(remaining));
 }
 const blocks:CruiseBlock[]=[];let previous:Line|undefined;
 for(const line of ordered){
  const q=[line.left,line.top,line.right,line.top,line.left,line.bottom,line.right,line.bottom],last=blocks.at(-1),distance=previous?previous.base-line.base:Infinity;
  if(last&&previous&&previous.column===line.column&&distance>0&&distance<=Math.max(previous.height,line.height)*2.2&&Math.abs(previous.left-line.left)<=line.height*2.5&&last.quote.length+line.text.length+1<=1200){last.quote+='\n'+line.text;last.quads.push(q);}
  else blocks.push({id:`${document.id}-${document.fingerprint.slice(0,12)}-${pageIndex}-${line.source}`,documentId:document.id,fingerprint:document.fingerprint,pageIndex,quote:line.text,quads:[q]});
  previous=line;
 }
 return blocks;
}
