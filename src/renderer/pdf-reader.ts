import { EraserTool } from './eraser-tool';
import { paintDrawing, type DrawingMode } from './drawing-svg';
import { LineTool, type DrawnLine } from './line-tool';
import { drawPageThumbnail } from './thumbnail-render';
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EventBus, PDFViewer, PDFLinkService, PDFFindController, ScrollMode } from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import { screenRectToQuad, quadToScreen, transform } from '../shared/geometry';
import type { Annotation, OpenedDocument, ReadingState } from '../shared/model';

GlobalWorkerOptions.workerSrc = workerUrl;
export type SelectionPart = { pageIndex: number; quote: string; quads: number[][] };
export type OutlineEntry = { id: string; title: string; navigable: boolean; children: OutlineEntry[] };
export class PdfReader {
  readonly bus = new EventBus();
  readonly viewer: PDFViewer;
  private link: PDFLinkService;
  private task?: PDFDocumentLoadingTask;
  private marks: Annotation[] = [];
  private active?: OpenedDocument;
  private generation = 0;
  private flash?: Annotation;
  private flashTimer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private lineTool: LineTool;
  private eraser: EraserTool;
  private outlineTargets = new Map<string, string | any[]>();
  constructor(readonly container: HTMLDivElement, onState: (state: ReadingState) => void, onSelection: (parts: SelectionPart[]) => void, private onNotice: (text: string) => void, private onOutline: (items: OutlineEntry[] | null) => void = () => {}, onLine:(line:DrawnLine)=>void=()=>{}, canDraw:()=>boolean=()=>true, drawingColor:()=>string=()=> '#5a7350', onErase:(ids:string[])=>void=()=>{}) {
    this.link = new PDFLinkService({ eventBus: this.bus }); this.link.externalLinkEnabled = false;
    const find = new PDFFindController({ eventBus: this.bus, linkService: this.link });
    this.viewer = new PDFViewer({ container, eventBus: this.bus, linkService: this.link, findController: find, annotationMode: 1, annotationEditorMode: -1, imageResourcesPath: new URL('./pdf-assets/images/', window.location.href).href });
    this.link.setViewer(this.viewer);
    this.lineTool=new LineTool(container,index=>this.viewer.getPageView(index),()=>this.ready&&canDraw(),onLine,drawingColor);
    this.eraser=new EraserTool(container,index=>this.viewer.getPageView(index),()=>this.marks,()=>this.ready&&canDraw(),onErase);
    this.bus.on('pagechanging', ({pageNumber}:{pageNumber:number}) => {
      this.eraser.cancel();const generation=this.generation;
      requestAnimationFrame(()=>{if(generation===this.generation&&this.ready)this.paint(pageNumber-1);});
    });
    this.bus.on('pagerendered', ({ pageNumber }: { pageNumber: number }) => this.paint(pageNumber - 1));
    this.bus.on('scalechanging', () => { this.lineTool.cancel(); this.eraser.cancel(); this.paint(); onSelection([]); });
    this.bus.on('rotationchanging', () => { this.lineTool.cancel(); this.eraser.cancel(); this.paint(); onSelection([]); });
    this.bus.on('textlayerrendered', async ({ pageNumber }: { pageNumber: number }) => {
      const document = this.viewer.pdfDocument;
      if (!document || !this.ready || pageNumber !== this.viewer.currentPageNumber) return;
      const text = await (await document.getPage(pageNumber)).getTextContent();
      if (this.viewer.pdfDocument === document) onNotice(text.items.length ? '' : '当前页没有文字层，可阅读；文字选择、搜索与精确引用需要 OCR。');
    });
    this.bus.on('updatefindmatchescount', ({ matchesCount }: { matchesCount: { current: number; total: number } }) => onNotice(`搜索 ${matchesCount.current} / ${matchesCount.total}`));
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
  setMarks(marks: Annotation[]) { this.marks = marks; this.paint(); }
  setDrawingTool(mode:DrawingMode|'erase'|null) {this.lineTool.setMode(mode==='erase'?null:mode);this.eraser.setEnabled(mode==='erase');}
  setLineEnabled(enabled:boolean) { this.setDrawingTool(enabled?'line':null); }
  clear() {
    this.setDrawingTool(null);
    ++this.generation; this.ready = false; this.active = undefined; this.marks = []; this.flash = undefined;
    this.outlineTargets.clear(); this.onOutline([]);
    this.viewer.setDocument(null); this.link.setDocument(null); void this.task?.destroy(); this.task = undefined;
  }
  setLayout(mode: 'continuous'|'single') { if(this.ready) { this.viewer.scrollMode=mode==='single'?ScrollMode.PAGE:ScrollMode.VERTICAL; this.paint(); } }
  zoom(value: number) { if (this.ready) this.viewer.currentScale = Math.max(.25, Math.min(4, value)); }
  fit(mode: 'page-width' | 'page-fit') { if (this.ready) this.viewer.currentScaleValue = mode; }
  rotate() { if (this.ready) this.viewer.pagesRotation = (this.viewer.pagesRotation + 90) % 360; }
  go(page: number) { if (this.ready && Number.isInteger(page) && page >= 1 && page <= (this.active?.pageCount || 0)) this.viewer.currentPageNumber = page; }
  search(query: string, again = false, backwards = false) {
    if (!this.ready) return;
    this.bus.dispatch('find', { source: this, type: again ? 'again' : '', query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: backwards, matchDiacritics: false });
  }
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
  focus(mark: Annotation) {
    this.go(mark.pageIndex + 1); this.flash = mark; this.paint();
    clearTimeout(this.flashTimer); this.flashTimer = setTimeout(() => { this.flash = undefined; this.paint(); }, 1800);
    requestAnimationFrame(() => {
      const view = this.viewer.getPageView(mark.pageIndex);
      if (!view) return;
      const rect = quadToScreen(mark.quads[0], view.viewport.transform);
      this.container.scrollTop = Math.max(0, view.div.offsetTop + rect[1] - this.container.clientHeight / 3);
    });
  }
  private paint(pageIndex?: number) {
    if (!this.active) return;
    const pages: HTMLElement[] = pageIndex === undefined ? [...this.container.querySelectorAll<HTMLElement>('.page')] : [this.viewer.getPageView(pageIndex)?.div].filter(Boolean);
    for (const page of pages) {
      const index = Number(page.dataset.pageNumber) - 1, view = this.viewer.getPageView(index);
      page.querySelector('.enlumor-marks')?.remove();
      if (!view?.viewport || !page.querySelector('canvas')) continue;
      const overlay = document.createElement('div'); overlay.className = 'enlumor-marks';
      for (const mark of [...this.marks, ...(this.flash ? [this.flash] : [])].filter(a => a.pageIndex === index)) {
        for (const quad of mark.quads) {
          const [left, top, right, bottom] = quadToScreen(quad, view.viewport.transform);
          if(['line','arrow','ink'].includes(mark.type)&&mark!==this.flash) {
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('drawn-'+mark.type);svg.dataset.annotationId=mark.id;
            const points=mark.points!.flatMap((_,i,p)=>i%2===0?transform(p[i],p[i+1],view.viewport.transform):[]);
            paintDrawing(svg,mark.type as DrawingMode,points,mark.color,(mark.type==='line'?1.5/view.viewport.scale:1.125)*view.viewport.scale);overlay.append(svg);continue;
          }
          if(['underline','strikeout'].includes(mark.type)&&mark!==this.flash){
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add(mark.type==='strikeout'?'strikeout-line':'underline-line');
            const p=mark.type==='strikeout'?[quad[0],(quad[1]+quad[5])/2,quad[2],(quad[3]+quad[7])/2]:[quad[4],quad[5],quad[6],quad[7]];
            paintDrawing(svg,'line',[...transform(p[0],p[1],view.viewport.transform),...transform(p[2],p[3],view.viewport.transform)],mark.color,1.5);overlay.append(svg);continue;
          }
          const block = document.createElement('div'); block.className = mark === this.flash ? 'mark flash' : `mark ${mark.type}`;
          Object.assign(block.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`, backgroundColor: mark.color });
          if (mark.type === 'note') { block.textContent = '▤'; block.style.width = '20px'; block.style.height = '20px'; }
          overlay.append(block);
        }
      }
      page.append(overlay);
      this.eraser?.refresh();
    }
  }
}
