import type {MarkView} from './editing-view';
type DisplayMark=Omit<Annotation,'author'> & {author?:'user';placement?:{dx:number;dy:number};visible?:boolean};
import { EraserTool } from './eraser-tool';
import{buildPageBlocks,type TextSpan}from'./cruise-blocks';
import type{CruiseBlock}from'../shared/cruise';
import { paintDrawing, type DrawingMode } from './drawing-svg';
import { LineTool, type DrawnLine } from './line-tool';
import { drawPageThumbnail } from './thumbnail-render';
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EventBus, PDFViewer, PDFLinkService, PDFFindController, ScrollMode } from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import { screenRectToQuad, quadToScreen, transform, validateAnnotation } from '../shared/geometry';
import type { Annotation, OpenedDocument, ReadingState } from '../shared/model';

GlobalWorkerOptions.workerSrc = workerUrl;
export type SelectionPart = { pageIndex: number; quote: string; quads: number[][] };
export type OutlineEntry = { id: string; title: string; navigable: boolean; children: OutlineEntry[] };
export class PdfReader {
  readonly bus = new EventBus();
  readonly viewer: PDFViewer;
  private link: PDFLinkService;
  private task?: PDFDocumentLoadingTask;
  private marks: DisplayMark[] = [];
  private active?: OpenedDocument;
  private generation = 0;
  private flash?: DisplayMark;
  private focusEpoch = 0;
  private flashTimer?: ReturnType<typeof setTimeout>;
  /** Stops the glide in progress, if any. */
  private glide?: () => void;
  private ready = false;
  private lineTool: LineTool;
  private eraser: EraserTool;
  private outlineTargets = new Map<string, string | any[]>();
  private blockCache=new Map<number,CruiseBlock[]>();
  constructor(readonly container: HTMLDivElement, onState: (state: ReadingState) => void, onSelection: (parts: SelectionPart[]) => void, private onNotice: (text: string) => void, private onOutline: (items: OutlineEntry[] | null) => void = () => {}, onLine:(line:DrawnLine)=>void=()=>{}, canDraw:()=>boolean=()=>true, drawingColor:()=>string=()=> '#5a7350', onErase:(ids:string[])=>void=()=>{}, private onTextNotice:(text:string)=>void=onNotice) {
    this.link = new PDFLinkService({ eventBus: this.bus }); this.link.externalLinkEnabled = false;
    const find = new PDFFindController({ eventBus: this.bus, linkService: this.link });
    this.viewer = new PDFViewer({ container, eventBus: this.bus, linkService: this.link, findController: find, annotationMode: 1, annotationEditorMode: -1, imageResourcesPath: new URL('./pdf-assets/images/', window.location.href).href });
    this.link.setViewer(this.viewer);
    this.lineTool=new LineTool(container,index=>this.viewer.getPageView(index),()=>this.ready&&canDraw(),onLine,drawingColor);
    this.eraser=new EraserTool(container,index=>this.viewer.getPageView(index),()=>this.marks as Annotation[],()=>this.ready&&canDraw(),onErase);
    this.bus.on('pagechanging', ({pageNumber}:{pageNumber:number}) => {
      this.eraser.cancel();const generation=this.generation;
      requestAnimationFrame(()=>{if(generation===this.generation&&this.ready)this.paint(pageNumber-1);});
      void this.reportTextCapability(pageNumber);
    });
    this.bus.on('pagerendered', ({ pageNumber }: { pageNumber: number }) => this.paint(pageNumber - 1));
    this.bus.on('scalechanging', () => { this.lineTool.cancel(); this.eraser.cancel(); this.paint(); onSelection([]); });
    this.bus.on('rotationchanging', () => { this.lineTool.cancel(); this.eraser.cancel(); this.paint(); onSelection([]); });
    this.bus.on('updatefindmatchescount', ({ matchesCount }: { matchesCount: { current: number; total: number } }) => onNotice(`搜索 ${matchesCount.current} / ${matchesCount.total}`));
    this.bus.on('updatefindcontrolstate', ({ matchesCount }: { matchesCount: { current: number; total: number } }) => onNotice(`搜索 ${matchesCount.current} / ${matchesCount.total}`));
    this.bus.on('updateviewarea', () => {
      if (!this.active || !this.ready) return;
      const index = this.viewer.currentPageNumber - 1;
      const view = this.viewer.getPageView(index);
      const offset = view ? Math.max(0, Math.min(1, (container.scrollTop - view.div.offsetTop) / view.div.clientHeight)) : 0;
      onState({ documentId: this.active.id, fingerprint: this.active.fingerprint, pageIndex: index, offset, zoom: Math.max(.25, Math.min(4, this.viewer.currentScale)), rotation: this.viewer.pagesRotation, layout:this.viewer.scrollMode===ScrollMode.PAGE?'single':'continuous' });
    });
    container.addEventListener('mouseup', () => onSelection(this.selection()));
    container.addEventListener('keyup', () => onSelection(this.selection()));
    container.addEventListener('scroll', () => onSelection([]), { passive: true });
    container.addEventListener('wheel', event => {
      if (!event.ctrlKey) return; event.preventDefault();
      this.zoom(this.viewer.currentScale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
  }
  async open(doc: OpenedDocument) {
    this.blockCache.clear();
    this.setDrawingTool(null);
    const generation = ++this.generation;
    this.outlineTargets.clear(); this.onOutline(null);
    this.ready = false; this.active = doc; this.marks = []; this.flash = undefined;
    this.viewer.setDocument(null); this.link.setDocument(null); await this.task?.destroy();
    if (generation !== this.generation) return;
    const base = new URL('./pdf-assets/', window.location.href).href;
    const task = this.task = getDocument({ data: doc.data.slice(), cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` });
    const pdf = await task.promise;
    if (generation !== this.generation) { await task.destroy(); return; }
    await new Promise<void>(resolve => {
      const initialized = () => {
        this.bus.off('pagesinit', initialized);
        const state = doc.reading;
        this.viewer.scrollMode = state?.layout==='single'?ScrollMode.PAGE:ScrollMode.VERTICAL;
        this.viewer.pagesRotation = state?.rotation || 0;
        this.viewer.currentScale = state?.zoom || 1;
        this.viewer.currentPageNumber = (state?.pageIndex || 0) + 1;
        requestAnimationFrame(() => {
          const page = this.viewer.getPageView(state?.pageIndex || 0);
          if (state && page) this.container.scrollTop = page.div.offsetTop + state.offset * page.div.clientHeight;
          this.ready = true; resolve();
        });
      };
      this.bus.on('pagesinit', initialized);
      this.link.setDocument(pdf); this.viewer.setDocument(pdf);
    });
    void this.reportTextCapability(this.viewer.currentPageNumber);
    void pdf.getOutline().then(items => {
      if (generation !== this.generation) return;
      const entries = (nodes: NonNullable<typeof items>, parent = ''): OutlineEntry[] => nodes.map((node, index) => {
        const id = `${parent}${index}`;
        if (node.dest) this.outlineTargets.set(id, node.dest);
        return { id, title: node.title, navigable: !!node.dest, children: entries(node.items, `${id}.`) };
      });
      this.onOutline(entries(items || []));
    }).catch(() => { if (generation === this.generation) { this.onOutline([]); this.onNotice('目录读取失败，可使用页码跳转。'); } });
  }
  private async reportTextCapability(pageNumber:number) {
    const document=this.viewer.pdfDocument,generation=this.generation;
    if(!document||!this.ready)return;
    try {
      const text=await(await document.getPage(pageNumber)).getTextContent();
      if(generation===this.generation&&document===this.viewer.pdfDocument&&pageNumber===this.viewer.currentPageNumber&&this.ready)
        this.onTextNotice(text.items.length?'':'当前页没有文字层，可阅读；文字选择、搜索与精确引用需要 OCR。');
    } catch {
      if(generation===this.generation&&document===this.viewer.pdfDocument&&pageNumber===this.viewer.currentPageNumber&&this.ready)
        this.onTextNotice('当前页文字层读取失败，可继续阅读页面。');
    }
  }
  async goToOutline(id: string) {
    const pdf = this.viewer.pdfDocument, target = this.outlineTargets.get(id);
    if (!pdf || !target) return;
    try {
      const destination = typeof target === 'string' ? await pdf.getDestination(target) : target;
      if (!destination) throw new Error('没有对应的页面位置');
      const ref = destination[0];
      const index = Number.isInteger(ref) ? ref : await pdf.getPageIndex(ref);
      if (pdf !== this.viewer.pdfDocument) return;
      if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) throw new Error('目录页码无效');
      this.viewer.scrollPageIntoView({ pageNumber: index + 1, destArray: destination, ignoreDestinationZoom: true });
    } catch { if (pdf === this.viewer.pdfDocument) this.onNotice('此目录项无法定位，可使用页码跳转。'); }
  }
  async drawThumbnail(pageNumber: number, canvas: HTMLCanvasElement, signal: AbortSignal): Promise<boolean> {
    const pdf = this.viewer.pdfDocument;
    if (!pdf || !this.ready) return false;
    return drawPageThumbnail(pdf, pageNumber, canvas, signal, () => pdf === this.viewer.pdfDocument, Math.min(2, window.devicePixelRatio || 1));
  }
  /** One page rendered on white at a given width, e.g. for scanning a QR code; null if no document is ready. */
  async renderPageImage(pageNumber:number,width:number):Promise<ImageData|null>{
    const pdf=this.viewer.pdfDocument;
    if(!pdf||!this.ready||!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pdf.numPages)return null;
    const page=await pdf.getPage(pageNumber);
    try{
      const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:width/base.width}),canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvas,viewport,annotationMode:0,background:'rgb(255,255,255)'}).promise;
      if(pdf!==this.viewer.pdfDocument)return null;
      return canvas.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,canvas.width,canvas.height);
    }finally{page.cleanup();}
  }
  async readPageBlocks(pageIndex:number):Promise<CruiseBlock[]>{
    const document=this.active,pdf=this.viewer.pdfDocument,generation=this.generation;
    if(!document||!pdf||!this.ready)throw new Error('CRUISE_NOT_READY');
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=document.pageCount)throw new Error('CRUISE_INVALID_PAGE');
    const cached=this.blockCache.get(pageIndex);if(cached)return structuredClone(cached);
    const page=await pdf.getPage(pageIndex+1),text=await page.getTextContent();
    if(generation!==this.generation||pdf!==this.viewer.pdfDocument||document!==this.active||!this.ready)throw new Error('CRUISE_SOURCE_CHANGED');
    const items=text.items.filter((item):item is typeof text.items[number]&TextSpan=>'str'in item);
    const blocks=buildPageBlocks(document,pageIndex,page.view[2]-page.view[0],items,text.styles);
    this.blockCache.set(pageIndex,blocks);if(this.blockCache.size>6)this.blockCache.delete(this.blockCache.keys().next().value!);
    return structuredClone(blocks);
  }
  clearCruiseFocus(){this.focusEpoch=(this.focusEpoch||0)+1;clearTimeout(this.flashTimer);const hadFlash=!!this.flash;this.flash=undefined;if(hadFlash)this.paint();}
  locateCruiseBlock(block:CruiseBlock,isCurrent:()=>boolean=()=>true){
    if(!isCurrent())return Promise.resolve();
    if(!this.active||!this.ready||!this.viewer.pdfDocument||block.documentId!==this.active.id||block.fingerprint!==this.active.fingerprint)throw new Error('CRUISE_SOURCE_CHANGED');
    const mark={...block,type:'highlight',author:'user',color:'#f4cf58',note:''};
    validateAnnotation(mark,this.active.pageCount);return this.focus(mark,isCurrent);
  }
  setEditingMarks(marks:(MarkView & {documentId:string;fingerprint:string})[],changedIds?:string[]){this.marks=marks.filter(m=>m.visible);this.paint(undefined,changedIds?new Set(changedIds):undefined);}
  setMarks(marks: Annotation[], changedIds?: string[]) { this.marks = marks; this.paint(undefined,changedIds?new Set(changedIds):undefined); }
  setDrawingTool(mode:DrawingMode|'erase'|null) {this.lineTool.setMode(mode==='erase'?null:mode);this.eraser.setEnabled(mode==='erase');}
  setLineEnabled(enabled:boolean) { this.setDrawingTool(enabled?'line':null); }
  clear() {
    this.blockCache.clear();
    this.setDrawingTool(null);
    ++this.generation; this.ready = false; this.active = undefined; this.marks = []; this.flash = undefined;
    this.outlineTargets.clear(); this.onOutline([]);
    this.viewer.setDocument(null); this.link.setDocument(null); void this.task?.destroy(); this.task = undefined;
  }
  setLayout(mode: 'continuous'|'single') { if(this.ready) { this.viewer.scrollMode=mode==='single'?ScrollMode.PAGE:ScrollMode.VERTICAL; this.paint(); } }
  zoom(value: number) { if (this.ready) this.viewer.currentScale = Math.max(.25, Math.min(4, value)); }
  fit(mode: 'page-width' | 'page-fit') { if (this.ready) this.viewer.currentScaleValue = mode; }
  rotate() { if (this.ready) this.viewer.pagesRotation = (this.viewer.pagesRotation + 90) % 360; }
  go(page: number, isCurrent:()=>boolean=()=>true) { if (isCurrent() && this.ready && Number.isInteger(page) && page >= 1 && page <= (this.active?.pageCount || 0)) this.viewer.currentPageNumber = page; }
  search(query: string, again = false, backwards = false) {
    if (!this.ready) return;
    this.bus.dispatch('find', { source: this, type: again ? 'again' : '', query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: backwards, matchDiacritics: false });
  }
  freeNoteAnchor():SelectionPart {const pageIndex=this.viewer.currentPageNumber-1,page=this.viewer.getPageView(pageIndex)?.pdfPage;if(!page||!this.ready)throw Error('EDIT_STALE');const [left,bottom,right,top]=page.view,x=Math.min(right-22,left+40),y=Math.max(bottom+22,top-60);return{pageIndex,quote:'',quads:[[x,y,x+20,y,x,y-20,x+20,y-20]]};}
  selection(): SelectionPart[] {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !this.active || !this.ready) return [];
    const range = selection.getRangeAt(0);
    if (!this.container.contains(range.startContainer) || !this.container.contains(range.endContainer)) return [];
    const parts: SelectionPart[] = [];
    for (const page of this.container.querySelectorAll<HTMLElement>('.page')) {
      const index = Number(page.dataset.pageNumber) - 1;
      const view = this.viewer.getPageView(index), bounds = page.getBoundingClientRect();
      const quads: number[][] = [], quotes = new Map<Element, string[]>();
      const layer = page.querySelector('.textLayer');
      if (!layer) continue;
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!range.intersectsNode(node)) continue;
        const local = document.createRange(); local.selectNodeContents(node);
        if (node === range.startContainer) local.setStart(node, range.startOffset);
        if (node === range.endContainer) local.setEnd(node, range.endOffset);
        if (!local.toString().trim()) continue;
        let item = node.parentElement!;
        while (item.parentElement?.tagName === 'SPAN' && !item.parentElement.classList.contains('markedContent')) item = item.parentElement;
        if (!quotes.has(item)) quotes.set(item, []);
        quotes.get(item)!.push(local.toString());
        for (const rect of local.getClientRects()) {
          if (rect.width < .1 || rect.height < .1) continue;
          quads.push(screenRectToQuad([rect.left - bounds.left - page.clientLeft, rect.top - bounds.top - page.clientTop, rect.right - bounds.left - page.clientLeft, rect.bottom - bounds.top - page.clientTop], view.viewport.transform));
        }
      }
      if (quads.length) parts.push({ pageIndex: index, quote: [...quotes.values()].map(text => text.join('')).join(' '), quads });
    }
    return parts;
  }
  /** Scrolls the reading area to `top` with an eased glide (longer for longer distances). Any reader input stops it where
   * it is, a newer glide replaces it, and with reduced motion it goes straight there. Resolves when it arrives or stops. */
  private glideTo(top:number):Promise<void>{
    this.glide?.();
    const el=this.container,from=el.scrollTop,to=Math.max(0,Math.min(top,el.scrollHeight-el.clientHeight)),distance=to-from;
    if(Math.abs(distance)<2||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){el.scrollTop=to;return Promise.resolve();}
    const duration=Math.min(700,280+Math.sqrt(Math.abs(distance))*6),start=performance.now(),inputs=['wheel','pointerdown','keydown'] as const;
    return new Promise(resolve=>{
      let done=false;
      const stop=()=>{if(done)return;done=true;for(const type of inputs)el.removeEventListener(type,stop);if(this.glide===stop)this.glide=undefined;resolve();};
      for(const type of inputs)el.addEventListener(type,stop,{passive:true});
      this.glide=stop;
      const frame=(now:number)=>{
        if(done)return;const t=Math.min(1,(now-start)/duration),eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
        el.scrollTop=from+distance*eased;if(t<1)requestAnimationFrame(frame);else stop();
      };
      requestAnimationFrame(frame);
    });
  }
  /** Where a mark sits when it is focused: a third of the way down the reading area. */
  private focusTop(mark:Pick<DisplayMark,'pageIndex'|'quads'>):number|null{
    const view=this.viewer.getPageView(mark.pageIndex);if(!view)return null;
    const rect=quadToScreen(mark.quads[0],view.viewport.transform);
    return Math.max(0,view.div.offsetTop+rect[1]-this.container.clientHeight/3);
  }
  /** Zooms to a fit or 1.6 times closer, as one smooth motion around a passage (or the middle of the view): the pages are
   * scaled with a short transform, then the real scale is applied and the passage kept where it was, in the same frame. */
  async zoomTo(mode:'width'|'page'|'in',anchor?:Pick<DisplayMark,'pageIndex'|'quads'>):Promise<void>{
    if(!this.ready)return;
    const view=this.viewer.getPageView(anchor?.pageIndex??this.viewer.currentPageNumber-1);if(!view)return;
    const from=this.viewer.currentScale,base={width:view.viewport.width/from,height:view.viewport.height/from};
    // PDF.js leaves room for the scrollbar and page borders when it fits a page; the same margins are used here.
    const width=(this.container.clientWidth-40)/base.width,page=Math.min(width,(this.container.clientHeight-10)/base.height);
    const to=Math.max(.25,Math.min(4,mode==='width'?width:mode==='page'?page:from*1.6));
    if(Math.abs(to-from)/from<.02)return;
    const el=this.container,pages=this.viewer.viewer as HTMLElement;
    const point=anchor?quadToScreen(anchor.quads[0],view.viewport.transform):null;
    // The anchor in page-container coordinates, and where it is on screen now.
    const ax=point?view.div.offsetLeft+(point[0]+point[2])/2:el.scrollLeft+el.clientWidth/2,ay=point?view.div.offsetTop+(point[1]+point[3])/2:el.scrollTop+el.clientHeight/2;
    const screenY=Math.max(el.clientHeight/3,Math.min(el.clientHeight*2/3,ay-el.scrollTop)),screenX=ax-el.scrollLeft;
    if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
      pages.style.transformOrigin=`${ax}px ${ay}px`;pages.style.transition='transform 220ms cubic-bezier(.4,0,.2,1)';pages.style.transform=`scale(${to/from})`;
      await new Promise<void>(resolve=>{const end=()=>{pages.removeEventListener('transitionend',end);resolve();};pages.addEventListener('transitionend',end);setTimeout(end,280);});
      if(!this.ready||view!==this.viewer.getPageView(view.id-1)){pages.style.transition='';pages.style.transform='';return;}
    }
    pages.style.transition='';pages.style.transform='';
    if(mode==='width')this.viewer.currentScaleValue='page-width';else if(mode==='page')this.viewer.currentScaleValue='page-fit';else this.viewer.currentScale=to;
    const scaled=this.viewer.getPageView(view.id-1)!,again=point?quadToScreen(anchor!.quads[0],scaled.viewport.transform):null;
    const nx=again?scaled.div.offsetLeft+(again[0]+again[2])/2:ax*this.viewer.currentScale/from,ny=again?scaled.div.offsetTop+(again[1]+again[3])/2:ay*this.viewer.currentScale/from;
    el.scrollLeft=Math.max(0,nx-screenX);el.scrollTop=Math.max(0,ny-(this.viewer.scrollMode===ScrollMode.PAGE?0:screenY));
  }
  focus(mark: DisplayMark, isCurrent:()=>boolean=()=>true):Promise<void> {
    const generation=this.generation,epoch=this.focusEpoch=(this.focusEpoch||0)+1;
    const current=()=>epoch===this.focusEpoch&&generation===this.generation&&this.ready&&mark.documentId===this.active?.id&&mark.fingerprint===this.active?.fingerprint&&isCurrent();
    if(!current())return Promise.resolve();
    // In continuous reading the passage is reached with a glide; the highlight stays a little longer to cover it.
    const target=this.viewer.scrollMode===ScrollMode.PAGE?null:this.focusTop(mark);
    this.flash = mark; this.paint();
    clearTimeout(this.flashTimer); this.flashTimer = setTimeout(() => { if(epoch===this.focusEpoch&&generation===this.generation){this.flash = undefined; this.paint();} }, target===null?1800:2400);
    if(target!==null)return this.glideTo(target);
    this.go(mark.pageIndex + 1);
    return new Promise(resolve=>requestAnimationFrame(() => {
      if(!current()){
        // An obsolete frame may clear only its own flash, never a newer focus.
        if(epoch===this.focusEpoch&&generation===this.generation){this.flash=undefined;this.paint();}
        resolve();return;
      }
      const view = this.viewer.getPageView(mark.pageIndex);
      if (!view) {resolve();return;}
      const rect = quadToScreen(mark.quads[0], view.viewport.transform);
      if(!current()){resolve();return;}
      this.container.scrollTop = Math.max(0, view.div.offsetTop + rect[1] - this.container.clientHeight / 3);
      resolve();
    }));
  }
  private paint(pageIndex?: number, changed?: Set<string>) {
    if (!this.active) return;
    const pages: HTMLElement[] = pageIndex === undefined ? [...this.container.querySelectorAll<HTMLElement>('.page')] : [this.viewer.getPageView(pageIndex)?.div].filter(Boolean);
    for (const page of pages) {
      const index = Number(page.dataset.pageNumber) - 1, view = this.viewer.getPageView(index);
      if (!view?.viewport || !page.querySelector('canvas')) continue;
      const old=page.querySelector<HTMLElement>('.enlumor-marks');
      const partial=!!changed&&!!old&&!this.flash;
      const existing=new Map<string,Element[]>();
      // Snapshot children before removing: HTMLCollection is live.
      if(partial)for(const node of [...old!.children]){const id=(node as HTMLElement).dataset.annotationId!;existing.set(id,[...(existing.get(id)||[]),node]);if(changed!.has(id))node.remove();}
      const overlay = partial?old!:document.createElement('div'); overlay.className = 'enlumor-marks';
      if(!partial)old?.remove();
      let insertionPoint:ChildNode|null=partial?overlay.firstChild:null;
      for (const {mark,flashing} of [...this.marks.map(mark=>({mark,flashing:false})), ...(this.flash ? [{mark:this.flash,flashing:true}] : [])].filter(({mark}) => mark.pageIndex === index)) {
        if(partial&&!changed!.has(mark.id)){insertionPoint=existing.get(mark.id)?.at(-1)?.nextSibling||null;continue;}
        for (const quad of mark.quads) {
          let [left, top, right, bottom] = quadToScreen(quad, view.viewport.transform);if(mark.type==='note'&&mark.placement){const delta=transform(mark.placement.dx,mark.placement.dy,view.viewport.transform),zero=transform(0,0,view.viewport.transform);left+=delta[0]-zero[0];top+=delta[1]-zero[1];right+=delta[0]-zero[0];bottom+=delta[1]-zero[1];}
          if(['line','arrow','ink'].includes(mark.type)&&!flashing) {
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('drawn-'+mark.type);svg.dataset.annotationId=mark.id;
            const points=mark.points!.flatMap((_,i,p)=>i%2===0?transform(p[i],p[i+1],view.viewport.transform):[]);
            paintDrawing(svg,mark.type as DrawingMode,points,mark.color,(mark.type==='line'?1.5/view.viewport.scale:1.125)*view.viewport.scale);overlay.insertBefore(svg,insertionPoint);continue;
          }
          if(['underline','strikeout'].includes(mark.type)&&!flashing){
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add(mark.type==='strikeout'?'strikeout-line':'underline-line');
            const p=mark.type==='strikeout'?[quad[0],(quad[1]+quad[5])/2,quad[2],(quad[3]+quad[7])/2]:[quad[4],quad[5],quad[6],quad[7]];
            svg.dataset.annotationId=mark.id;paintDrawing(svg,'line',[...transform(p[0],p[1],view.viewport.transform),...transform(p[2],p[3],view.viewport.transform)],mark.color,1.5);overlay.insertBefore(svg,insertionPoint);continue;
          }
          const block = document.createElement('div'); block.className = flashing ? 'mark flash' : `mark ${mark.type}`;
          block.dataset.annotationId=mark.id;
          Object.assign(block.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`, backgroundColor: mark.color });
          if(mark.type==='highlight'&&!flashing){const polygon=[0,2,6,4].map(i=>{const p=transform(quad[i],quad[i+1],view.viewport.transform);return `${p[0]-left}px ${p[1]-top}px`;}).join(',');block.style.clipPath=`polygon(${polygon})`;}
          if (mark.type === 'note') { block.textContent = '▤'; block.style.width = '20px'; block.style.height = '20px'; }
          overlay.insertBefore(block,insertionPoint);
        }
      }
      if(!partial)page.append(overlay);
      this.eraser?.refresh();
    }
  }
}
