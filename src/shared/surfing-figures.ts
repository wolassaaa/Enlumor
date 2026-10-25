import type {SurfingContext} from './surfing-context';
/** A figure or table the paper captions, located by its caption passage. The image itself is seen by viewing its page. */
export type SurfingFigure={id:string;kind:'figure'|'table';label:string;pageNumber:number;passageId:string;caption:string};
// A caption starts its line with the label and a separator: "Figure 3: …", "Fig. 2.", "Table 1 |", "图 4：".
const caption=/^\s*(figure|fig\.|table|tab\.|algorithm|图|表)\s*(\d{1,3}[a-z]?)\s*[:.：|]/i;
/** Figures and tables by caption, first caption per label; body mentions ("as Figure 3 shows") are not captions. */
export function indexSurfingFigures(snapshot:Pick<SurfingContext,'passages'>):SurfingFigure[]{
 const seen=new Set<string>(),figures:SurfingFigure[]=[];
 for(const p of snapshot.passages){
  const m=caption.exec(p.quote);if(!m)continue;
  const word=m[1].toLowerCase(),kind=word.startsWith('tab')||word==='表'?'table':'figure',label=`${kind==='table'?'Table':'Figure'} ${m[2]}`;
  if(seen.has(label))continue;seen.add(label);
  figures.push({id:`${kind}-${m[2].toLowerCase()}`,kind,label,pageNumber:p.pageIndex+1,passageId:p.id,caption:p.quote.slice(0,240)});
 }
 return figures;
}
