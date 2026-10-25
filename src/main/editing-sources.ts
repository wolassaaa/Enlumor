import type { Workspace } from './workspace';
import type { LegacyInput, WorkspaceEdits } from './editing-workspace';
import type { CommandContext } from '../shared/document-commands';
import type { AnchorCandidate } from '../shared/editing-bridge';
import type { EditMark, VerifiedAnchor } from '../shared/editing-commands';
import { validateGeometry, validateMark, EditValidationError } from '../shared/editing-marks';
import { canonicalDigest } from '../shared/editing-planner';

type Bounds=[number,number,number,number];
type SourceChar={id:string;text:string;quad:number[]};
type SourceLine={id:string;order:number;direction:[number,number];chars:SourceChar[]};
type SourcePage={fingerprint:string;pageIndex:number;nativeBounds:Bounds;parserVersion:1;lines:SourceLine[]};
type SourceDocument={fingerprint:string;pageCount:number;pageBounds:Bounds[]};
export type EditingPdfRunner=<T>(request:object,signal?:AbortSignal)=>Promise<T>;
const normalized=(text:string)=>text.normalize('NFKC').replace(/\p{White_Space}/gu,'');
const noAnchor=():never=>{throw Error('ANCHOR_NOT_FOUND');};
function canceled(signal:AbortSignal){if(signal.aborted)throw Error('PDF_CANCELED');}
function quadValid(quad:number[],bounds:Bounds) {try{validateGeometry({quads:[quad]},'highlight',bounds);}catch{noAnchor();}}
function center(q:number[]):[number,number]{return [(q[0]+q[2]+q[4]+q[6])/4,(q[1]+q[3]+q[5]+q[7])/4];}
function sameEdges(a:number[],b:number[]):boolean {
  const onEdge=(start:number,end:number,point:number)=>Math.abs((a[end]-a[start])*(b[point+1]-a[start+1])-(a[end+1]-a[start+1])*(b[point]-a[start]))<=Math.hypot(a[end]-a[start],a[end+1]-a[start+1])*1e-4;
  return onEdge(0,2,0)&&onEdge(0,2,2)&&onEdge(4,6,4)&&onEdge(4,6,6);
}
function contains(q:number[],point:[number,number]):boolean {
  const order=[0,2,6,4];let orientation=0;
  for(let i=0;i<4;i++) {const a=order[i],b=order[(i+1)%4];const cross=(q[b]-q[a])*(point[1]-q[a+1])-(q[b+1]-q[a+1])*(point[0]-q[a]);if(Math.abs(cross)<1e-7)continue;const sign=Math.sign(cross);if(orientation&&sign!==orientation)return false;orientation=sign;}
  return true;
}
const MAX_CACHED_PAGES=48;
/** Trusted local parsing only; caches are disposable and never replace full source identity checks. */
export class EditingSourceService {
  private metadata=new Map<string,SourceDocument>();
  private pages=new Map<string,SourcePage>();
  constructor(private workspace:Workspace,private edits:WorkspaceEdits,private runPdfTask:EditingPdfRunner) {}
  private verified(context:CommandContext,signal:AbortSignal) {
    canceled(signal);
    try {const doc=this.workspace.verified(context.documentId);if(doc.fingerprint!==context.fingerprint)throw Error('SOURCE_CHANGED');return doc;}
    catch(e){this.metadata.delete(context.fingerprint);for(const key of this.pages.keys())if(key.startsWith(context.fingerprint+'/'))this.pages.delete(key);throw e;}
  }
  private async document(context:CommandContext,signal:AbortSignal):Promise<SourceDocument> {
    const doc=this.verified(context,signal);const cached=this.metadata.get(context.fingerprint);if(cached)return cached;
    const result=await this.runPdfTask<SourceDocument>({operation:'editing-document',source:doc.path,fingerprint:context.fingerprint},signal);
    this.verified(context,signal);
    if(result.fingerprint!==context.fingerprint||result.pageCount!==doc.pageCount||!Array.isArray(result.pageBounds)||result.pageBounds.length!==doc.pageCount)noAnchor();
    for(const b of result.pageBounds)if(!Array.isArray(b)||b.length!==4||b.some(n=>!Number.isFinite(n)||Math.abs(n)>1e7)||b[0]>=b[2]||b[1]>=b[3])noAnchor();
    this.metadata.set(context.fingerprint,structuredClone(result));return result;
  }
  async preparePage(context:CommandContext,pageIndex:number,signal:AbortSignal):Promise<void> {
    // document() always finishes with a full source verification; repeating it immediately only re-hashes the PDF.
    const metadata=await this.document(context,signal);
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=metadata.pageCount)noAnchor();
    const key=`${context.fingerprint}/${pageIndex}/1`,hit=this.pages.get(key);if(hit){this.pages.delete(key);this.pages.set(key,hit);return;}
    const doc=this.workspace.document(context.documentId);
    const result=await this.runPdfTask<SourcePage>({operation:'editing-page',source:doc.path,fingerprint:context.fingerprint,pageIndex},signal);
    this.verified(context,signal);
    if(result.fingerprint!==context.fingerprint||result.pageIndex!==pageIndex||result.parserVersion!==1||canonicalDigest(result.nativeBounds)!==canonicalDigest(metadata.pageBounds[pageIndex])||!Array.isArray(result.lines))noAnchor();
    let count=0;const ids=new Set<string>();
    for(let i=0;i<result.lines.length;i++) {const line=result.lines[i];if(typeof line.id!=='string'||line.order!==i||!Array.isArray(line.direction)||line.direction.length!==2||line.direction.some(n=>!Number.isFinite(n))||Math.hypot(...line.direction)<1e-6||!Array.isArray(line.chars))noAnchor();
      for(const c of line.chars){if(typeof c.id!=='string'||ids.has(c.id)||typeof c.text!=='string'||!c.text.length)noAnchor();ids.add(c.id);count+=c.text.length;quadValid(c.quad,result.nativeBounds);}
    }
    if(count>100000)throw Error('EDIT_TOO_LARGE');
    this.pages.set(key,structuredClone(result));
    // Per-character geometry is large; keep only recently used pages (Map iterates oldest first).
    while(this.pages.size>MAX_CACHED_PAGES)this.pages.delete(this.pages.keys().next().value!);
  }
  async prepareAnchor(context:CommandContext,candidate:AnchorCandidate,signal:AbortSignal):Promise<VerifiedAnchor> {return this.verifyCandidate(context,candidate,signal,true);}
  private async verifyCandidate(context:CommandContext,input:AnchorCandidate,signal:AbortSignal,persist:boolean):Promise<VerifiedAnchor> {
    canceled(signal);
    if(!input||typeof input.quote!=='string'||!Array.isArray(input.quads))noAnchor();
    if(input.quote.length>100000||input.quads.length>10000)throw Error('EDIT_TOO_LARGE');
    if(!normalized(input.quote)||!input.quads.length)noAnchor();
    // Copy before awaiting; the renderer can never mutate an in-flight candidate.
    const candidate=structuredClone(input);
    for(const q of candidate.quads)quadValid(q,[-1e7,-1e7,1e7,1e7]);
    await this.preparePage(context,candidate.pageIndex,signal);
    const source=this.pages.get(`${context.fingerprint}/${candidate.pageIndex}/1`)!;
    const chosen=new Map<string,{line:SourceLine;char:SourceChar;index:number}>();let lastLine=-1;
    for(const quad of candidate.quads) {
      quadValid(quad,source.nativeBounds);
      const matches=source.lines.flatMap(line=>line.chars.map((char,index)=>({line,char,index})).filter(item=>contains(quad,center(item.char.quad))));
      if(!matches.length)noAnchor();
      // A candidate crossing source lines/columns is ambiguous, even if concatenated text matches.
      if(new Set(matches.map(m=>m.line.id)).size!==1)noAnchor();
      const fresh=matches.filter(m=>!chosen.has(m.char.id));if(!fresh.length)continue;
      const line=fresh[0].line;if(line.order<lastLine)noAnchor();lastLine=line.order;
      for(const item of fresh)chosen.set(item.char.id,item);
    }
    const ordered=[...chosen.values()].sort((a,b)=>a.line.order-b.line.order||projection(a.char,a.line)-projection(b.char,b.line));
    if(normalized(ordered.map(item=>item.char.text).join(''))!==normalized(candidate.quote))noAnchor();
    const quads:number[][]=[];
    for(let i=0;i<ordered.length;) {
      const first=ordered[i];let last=first;let j=i+1;
      // Coalesce only collinear source edges; superscripts/mixed font heights retain their own four vertices.
      while(j<ordered.length&&ordered[j].line.id===first.line.id&&ordered[j].index===last.index+1&&sameEdges(first.char.quad,ordered[j].char.quad)){last=ordered[j++];}
      const a=first.char.quad,b=last.char.quad;const quad=[a[0],a[1],b[2],b[3],a[4],a[5],b[6],b[7]];quadValid(quad,source.nativeBounds);quads.push(quad);i=j;
    }
    if(quads.length>10000)throw Error('EDIT_TOO_LARGE');
    const value={documentId:context.documentId,fingerprint:context.fingerprint,pageIndex:candidate.pageIndex,quote:candidate.quote,quads};
    const anchor:VerifiedAnchor={id:'anchor-'+canonicalDigest(value),...value};
    this.verified(context,signal);if(persist)this.edits.saveAnchor(context,anchor);return anchor;
  }
  async resolveEnvironment(context:CommandContext,signal:AbortSignal):Promise<{pageBounds:readonly Bounds[];anchors:VerifiedAnchor[]}> {
    const metadata=await this.document(context,signal);
    return {pageBounds:structuredClone(metadata.pageBounds),anchors:this.edits.anchors(context)};
  }
  private mark(context:CommandContext,input:LegacyInput,anchor:VerifiedAnchor|null,reanchor=false):EditMark {
    if(!input.annotation)throw Error('LEGACY_READ_ONLY');const {author:_,...old}=input.annotation;
    return {...old,...(reanchor&&anchor?{pageIndex:anchor.pageIndex,quote:anchor.quote,quads:structuredClone(anchor.quads)}:{}),origin:this.edits.actor,retained:true,visible:true,version:1,anchorId:anchor?.id??null,placement:{dx:0,dy:0}};
  }
  async convertLegacyPage(context:CommandContext,pageIndex:number,signal:AbortSignal):Promise<void> {
    const metadata=await this.document(context,signal);
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=metadata.pageCount)noAnchor();
    const inputs=this.edits.legacyInputs(context.documentId).filter(x=>x.annotation?.pageIndex===pageIndex);
    for(const input of inputs) {
      this.verified(context,signal);
      let mark:EditMark|null=null,anchor:VerifiedAnchor|null=null,reason='';
      try {
        const a=input.annotation!;
        if(['highlight','underline','strikeout'].includes(a.type)||a.type==='note'&&a.quote!=='')anchor=await this.verifyCandidate(context,{pageIndex:a.pageIndex,quote:a.quote,quads:a.quads},signal,false);
        mark=this.mark(context,input,anchor);validateMark(mark,context,metadata.pageBounds);
      }catch(e){if(e instanceof EditValidationError)reason='LEGACY_READ_ONLY';else if(e instanceof Error&&e.message==='ANCHOR_NOT_FOUND')reason='ANCHOR_NOT_FOUND';else throw e;}
      this.verified(context,signal);this.edits.importLegacy(context,input,reason?null:mark,anchor,reason);
    }
  }
  async reanchorLegacy(context:CommandContext,legacyId:string,anchorId:string,expectedInputDigest:string,signal:AbortSignal):Promise<void> {
    const environment=await this.resolveEnvironment(context,signal);
    const input=this.edits.legacyInputs(context.documentId).find(x=>x.legacyId===legacyId);
    if(!input||input.inputDigest!==expectedInputDigest)throw Error('LEGACY_CHANGED');
    if(!input.annotation)throw Error('LEGACY_READ_ONLY');
    const anchor=environment.anchors.find(a=>a.id===anchorId)??noAnchor();
    const mark=this.mark(context,input,anchor,true);validateMark(mark,context,environment.pageBounds);
    this.verified(context,signal);
    this.edits.importLegacy(context,input,mark,anchor,'',{type:'legacy-reanchor',before:input.annotation,after:anchor,actor:this.edits.actor,at:Date.now()});
  }
}
function projection(char:SourceChar,line:SourceLine){const p=center(char.quad);return p[0]*line.direction[0]+p[1]*line.direction[1];}
