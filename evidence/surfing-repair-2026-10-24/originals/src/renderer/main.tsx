import {SurfingPanel} from './SurfingPanel';
import {lineAnchor} from '../shared/geometry';
import type {VerifiedAnchor} from '../shared/editing-commands';
import {EditingController} from './editing-controller';
import {projectEditingView,type MarkView} from './editing-view';
import type {EditingView} from '../shared/editing-bridge';
import type {EditCommand,EditMutation} from '../shared/editing-commands';
import{CruisePanel}from'./CruisePanel';
import type {CruiseBlock} from '../shared/cruise';
import { createReaderCommandHost } from './document-command-reader';
import type { DocumentCommand } from '../shared/document-commands';
import {ModelSettings} from './model-settings';
import { NoteDialog } from './note-dialog';
import { PanelDivider } from './panel-divider';
import { defaultLayout, fitPanels } from './layout';
import type { CSSProperties } from 'react';
import type { LayoutPreferences } from '../shared/model';
import { ThumbnailRail } from './thumbnails';
import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PdfReader, type SelectionPart, type OutlineEntry } from './pdf-reader';
import { unwrap, type Annotation as LegacyAnnotation, type AnnotationChange, type Bridge, type DocumentInfo, type OpenedDocument, type ReadingState } from '../shared/model';
import './style.css';
type Annotation=Omit<LegacyAnnotation,'author'> & {author?:'user'} & Partial<MarkView>;
type UiChange={documentId:string;upserts:Annotation[];deletes:string[]};
declare global { interface Window { enlumor: Bridge } }

function Glyph({ name }: { name: 'library' | 'notes' | 'open' | 'export' | 'mark' | 'close' }) {
  const paths = { library: 'M4 4h5v16H4z M12 4h4v16h-4z M19 5l3 14', notes: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5', open: 'M3 8h7l2-3h8v5 M3 8v12h16l3-10H7l-4 10', export: 'M13 3h8v8 M21 3L10 14 M9 5H4v15h15v-5', mark: 'M5 15l9-11 5 4-9 11H5z M4 22h16', close: 'M6 6l12 12 M18 6L6 18' };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function OutlineTree({ items, navigate }: { items: OutlineEntry[]; navigate: (id: string) => void }) {
  return <ul className="outline-tree">{items.map(item => <li key={item.id}><button disabled={!item.navigable} onClick={() => navigate(item.id)}>{item.title}</button>{item.children.length > 0 && <OutlineTree items={item.children} navigate={navigate}/>}</li>)}</ul>;
}

function App() {
  const editingEnabled=useRef(false),editingController=useRef<EditingController|null>(null),editingSnapshot=useRef<EditingView|null>(null);
  const [editingView,setEditingView]=useState<EditingView|null>(null);
  const [anchorPreview,setAnchorPreview]=useState<{mark:Annotation;anchor:VerifiedAnchor}|null>(null);
  async function previewAnchor(mark:Annotation){const s=editingController.current?.currentSession;if(!s||parts.length!==1)return;try{const anchor=unwrap(await window.enlumor.prepareEditingAnchor({sessionId:s.sessionId,requestId:crypto.randomUUID(),candidate:parts[0]}));if(editingController.current?.currentSession?.sessionId===s.sessionId)setAnchorPreview({mark,anchor});}catch(e){fail(e);}}
  const [geometryEdit,setGeometryEdit]=useState<{mark:Annotation;points:string;dx:string;dy:string}|null>(null);
  const [legacyPreview,setLegacyPreview]=useState<{legacy:EditingView['legacy'][number];anchor:VerifiedAnchor}|null>(null);
  async function applyGeometry(){if(!geometryEdit)return;const {mark,points,dx,dy}=geometryEdit;if(mark.version==null)return;
    const command:EditCommand=mark.type==='note'?{type:'set_mark_placement',id:mark.id,expectedVersion:mark.version,placement:{dx:Number(dx),dy:Number(dy)}}:{type:'set_mark_geometry',id:mark.id,expectedVersion:mark.version,geometry:{points:points.split(',').map(Number),quads:[lineAnchor(points.split(',').map(Number))]}};
    if(await submitEdit(command))setGeometryEdit(null);
  }
  async function previewReanchor(mark:Annotation){const s=editingController.current?.currentSession,legacy=editingSnapshot.current?.legacy.find(l=>l.legacyId===mark.id);if(!s||!legacy||parts.length!==1){fail(Error('请选择一页新原文再重新定位'));return;}
    try{const anchor=unwrap(await window.enlumor.prepareEditingAnchor({sessionId:s.sessionId,requestId:crypto.randomUUID(),candidate:parts[0]}));if(editingController.current?.currentSession?.sessionId===s.sessionId)setLegacyPreview({legacy,anchor});}catch(e){fail(e);}
  }
  async function confirmLegacy(){const s=editingController.current?.currentSession,p=legacyPreview;if(!s||!p)return;setBusy(true);try{const view=unwrap(await window.enlumor.reanchorLegacy({sessionId:s.sessionId,requestId:crypto.randomUUID(),legacyId:p.legacy.legacyId,anchorId:p.anchor.id,expectedInputDigest:p.legacy.inputDigest}));if(editingController.current?.currentSession?.sessionId===s.sessionId){acceptEditingView(view);setLegacyPreview(null);setParts([]);setStatus('已保存 · 兼容转换审计（保留原记录，不进入普通撤销）');}}catch(e){fail(e);}finally{setBusy(false);}}

  const preparePages=useRef(new Set<string>());
  function acceptEditingView(view:EditingView){
    const opened=activeDocument.current;if(!opened||opened.id!==view.context.documentId||opened.fingerprint!==view.context.fingerprint)return;
    const previous=editingSnapshot.current;editingSnapshot.current=view;setEditingView(view);
    const old=new Map(activeMarks.current.map(m=>[m.id,m]));
    const projected=projectEditingView(view).map(m=>{const prior=old.get(m.id);return prior&&m.version!==null&&m.version===prior.version?prior as MarkView & {documentId:string;fingerprint:string}:{...m,documentId:opened.id,fingerprint:opened.fingerprint};});
    const order=new Map(activeMarks.current.map((m,i)=>[m.id,i]));projected.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));const changed=projected.filter(m=>m!==old.get(m.id)).map(m=>m.id);
    const ids=new Set(projected.map(m=>m.id));for(const m of activeMarks.current)if(!ids.has(m.id))changed.push(m.id);
    if(!previous||changed.length){activeMarks.current=projected;setMarks(projected);reader.current?.setEditingMarks(projected,previous?changed:undefined);}
  }
  async function prepareNearby(index:number){const session=editingController.current?.currentSession;if(!session)return;
    for(const pageIndex of [index,index+1,index-1]){if(pageIndex<0||pageIndex>=(activeDocument.current?.pageCount||0))continue;const key=session.sessionId+'/'+pageIndex;if(preparePages.current.has(key))continue;preparePages.current.add(key);
      try{const view=unwrap(await window.enlumor.prepareEditingPage({sessionId:session.sessionId,requestId:crypto.randomUUID(),pageIndex}));if(editingController.current?.currentSession?.sessionId===session.sessionId)acceptEditingView(view);}catch(e){preparePages.current.delete(key);if(editingController.current?.currentSession?.sessionId===session.sessionId)fail(e);}
    }
  }
  async function submitEdit(command:EditCommand,retry=false){if(locked.current)return false;resetDrawing();locked.current=true;setBusy(true);setError('');setStatus('正在保存…');
    const job=(async()=>{const result=retry?await editingController.current!.retry():await editingController.current!.submit(command);if(result?.status!=='committed')throw Error(result&&'error'in result?result.error.message:'保存状态待确认 · 草稿保留');setStatus('已保存 · 本地 SQLite');setParts([]);return true;})();flight.current=job;
    try{return await job;}catch(e){fail(e);return false;}finally{flight.current=null;locked.current=false;setBusy(false);}
  }
  async function commitPreview(change:UiChange){
    if(change.upserts.length+Number(!!change.deletes.length)>64){fail(Error('EDIT_TOO_LARGE: 一次批量最多 64 项'));return false;}
    try{const session=editingController.current?.currentSession;if(!session)throw Error('EDIT_STALE');const operations:EditMutation[]=[];
      for(const mark of change.upserts){const old=activeMarks.current.find(m=>m.id===mark.id);if(old){if(!old.editable||old.version==null)throw Error('LEGACY_READ_ONLY');operations.push({type:'update_mark',id:old.id,expectedVersion:old.version,patch:{color:mark.color,note:mark.note}});}
        else if(['highlight','underline','strikeout'].includes(mark.type)||mark.type==='note'&&!!mark.quote){const a=unwrap(await window.enlumor.prepareEditingAnchor({sessionId:session.sessionId,requestId:crypto.randomUUID(),candidate:{pageIndex:mark.pageIndex,quote:mark.quote,quads:mark.quads}}));if(editingController.current?.currentSession?.sessionId!==session.sessionId)throw Error('EDIT_STALE');operations.push({type:'create_mark',markType:mark.type,pageIndex:mark.pageIndex,color:mark.color,note:mark.note,anchorId:a.id});}
        else operations.push({type:'create_mark',markType:mark.type,pageIndex:mark.pageIndex,color:mark.color,note:mark.note,geometry:{quads:mark.quads,...(mark.points?{points:mark.points}:{})}});
      }
      if(change.deletes.length){const targets=change.deletes.map(id=>{const m=activeMarks.current.find(x=>x.id===id);if(!m?.editable||m.version==null)throw Error('LEGACY_READ_ONLY');return{id,expectedVersion:m.version};});operations.push({type:'delete_marks',targets});}
      return await submitEdit(operations.length===1?operations[0]:{type:'apply_edit_batch',operations});
    }catch(e){fail(e);return false;}
  }
  const cruiseFlush=useRef<(()=>Promise<void>)|null>(null);
  const [cruiseOpen,setCruiseOpen]=useState(false),[cruiseTakeover,setCruiseTakeover]=useState(0);
  const cruiseOpenRef=useRef(cruiseOpen);cruiseOpenRef.current=cruiseOpen;
  const [surfingOpen,setSurfingOpen]=useState(false),[surfingTakeover,setSurfingTakeover]=useState(0);
  const surfingCancel=useRef<(()=>void)|null>(null);
  const surfingFlush=useRef<(()=>Promise<void>)|null>(null);
  const surfingOpenRef=useRef(surfingOpen);surfingOpenRef.current=surfingOpen;
  // PdfReader keeps its initial selection callback; read the current panel state.
  const commandHost=useRef<ReturnType<typeof createReaderCommandHost>|null>(null);
  function notifyCruiseTakeover(){commandHost.current?.invalidate();if(surfingOpenRef.current){if(surfingCancel.current)surfingCancel.current();else setSurfingTakeover(n=>n+1);}if(cruiseOpenRef.current)setCruiseTakeover(n=>n+1);}
  function documentCommand(command:DocumentCommand){
    commandHost.current??=createReaderCommandHost(()=>reader.current,()=>activeDocument.current);
    return commandHost.current.run(command);
  }
  function commandError(result:Awaited<ReturnType<typeof documentCommand>>){if(!result.ok&&result.error.code!=='COMMAND_CANCELED'&&result.error.code!=='COMMAND_STALE')fail(new Error(result.error.message));}
  const [modelSettingsOpen,setModelSettingsOpen]=useState(false);const modelSettingsTrigger=useRef<HTMLElement|null>(null);

  const [cruiseBlocks,setCruiseBlocks]=useState<CruiseBlock[]>([]),[blocksOpen,setBlocksOpen]=useState(false),[blocksBusy,setBlocksBusy]=useState(false);
  const blockEpoch=useRef(0),blockPage=useRef(1);
  function clearBlocks(){blockEpoch.current++;setCruiseBlocks([]);setBlocksOpen(false);}
  async function readBlocks(){const opened=activeDocument.current;if(!opened||!reader.current||blocksBusy)return;const epoch=blockEpoch.current,pageIndex=blockPage.current-1;resetDrawing();setParts([]);setBlocksBusy(true);try{const result=await documentCommand({type:'read_page',pageIndex});if(activeId.current===opened.id&&blockEpoch.current===epoch){if(result.ok&&result.result.kind==='page'){setCruiseBlocks(result.result.blocks);setBlocksOpen(true);}else commandError(result);}}catch(reason){if(activeId.current===opened.id&&blockEpoch.current===epoch)fail(reason);}finally{setBlocksBusy(false);}}
  const workspaceElement = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutPreferences>(defaultLayout), [layoutOpen, setLayoutOpen] = useState(false), [workspaceWidth, setWorkspaceWidth] = useState(window.innerWidth);
  const layoutRef = useRef(layout), layoutFlight = useRef<Promise<void> | null>(null), [layoutError, setLayoutError] = useState(false);
  function persistLayout(next: LayoutPreferences) {
    notifyCruiseTakeover();resetDrawing();setLayout(next); layoutRef.current = next; setParts([]);
    const job = (layoutFlight.current || Promise.resolve()).catch(() => {}).then(async () => { unwrap(await window.enlumor.saveLayout(next)); setLayoutError(false); });
    layoutFlight.current = job;
    void job.catch(reason => { setLayoutError(true); fail(reason); });
  }
  const container = useRef<HTMLDivElement>(null), reader = useRef<PdfReader | null>(null);
  const [doc, setDoc] = useState<OpenedDocument | null>(null), [recent, setRecent] = useState<DocumentInfo[]>([]);
  const [marks, setMarks] = useState<Annotation[]>([]), [parts, setParts] = useState<SelectionPart[]>([]);
  const [status, setStatus] = useState('本地工作区就绪'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [textNotice,setTextNotice]=useState('');
  const [busy, setBusy] = useState(false), [page, setPage] = useState('1'), [zoom, setZoom] = useState(1), [query, setQuery] = useState('');
  const [currentPage,setCurrentPage]=useState(1),[pageError,setPageError]=useState('');
  function syncPage(value:number){if(blockPage.current!==value){blockPage.current=value;clearBlocks();}setCurrentPage(value);setPage(String(value));setPageError('');}
  function navigatePage(value:number){if(!doc||busy)return;notifyCruiseTakeover();resetDrawing();setParts([]);setPage(String(value));setPageError('');void documentCommand({type:'go_to_page',pageIndex:value-1}).then(commandError);}
  function submitPage(){const value=page.trim(),number=Number(value);if(!doc)return;if(!/^\d+$/.test(value)||!Number.isSafeInteger(number)||number<1||number>doc.pageCount){setPageError(`请输入 1–${doc.pageCount} 之间的整数页码`);return;}navigatePage(number);}
  const [drawMode,setDrawMode]=useState<'line'|'arrow'|'ink'|'erase'|null>(null);
  function resetDrawing(){reader.current?.setDrawingTool(null);setDrawMode(null);}
  const [readingLayout,setReadingLayout]=useState<'continuous'|'single'>('continuous');
  const [color, setColor] = useState('#f4cf58'), [note, setNote] = useState<string | null>(null), [editing, setEditing] = useState<Annotation | null>(null);
  const colorRef=useRef(color);colorRef.current=color;
  const noteTrigger=useRef<HTMLElement|null>(null);
  const noteAnchor=useRef<{documentId:string;fingerprint:string;parts:SelectionPart[];free:boolean}|null>(null);
  const noteOpen = useRef(false); noteOpen.current = note !== null;
  const activeDocument = useRef<OpenedDocument | null>(null), activeMarks = useRef<Annotation[]>([]);
  const [tabs, setTabs] = useState<DocumentInfo[]>([]);
  const tabsRef = useRef<DocumentInfo[]>([]), activeId = useRef<string | null>(null);
  const histories = useRef(new Map<string, {undo:AnnotationChange[];redo:AnnotationChange[]}>());
  const emptyHistory = () => ({undo:[] as AnnotationChange[],redo:[] as AnnotationChange[]});
  const [history, setHistory] = useState({ undo: [] as AnnotationChange[], redo: [] as AnnotationChange[] });
  const [libraryOpen, setLibraryOpen] = useState(true), [notesOpen, setNotesOpen] = useState(true);
  const [libraryView, setLibraryView] = useState<'documents' | 'outline' | 'thumbnails'>('documents'), [outline, setOutline] = useState<OutlineEntry[] | null>([]);
  const selectionPopover=useRef<HTMLDivElement>(null);
  const [selectionPosition, setSelectionPosition] = useState({ left: 0, top: 0 });
  const current = useRef<ReadingState | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ change: UiChange; kind: 'new' | 'undo' | 'redo' } | null>(null), flight = useRef<Promise<unknown> | null>(null), locked = useRef(false);
  const refresh = async () => setRecent(unwrap(await window.enlumor.listDocuments()));
  const fail = (reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)); setStatus('尚未保存 / 操作未完成'); };
  async function flush() {
    clearTimeout(timer.current);
    if(noteOpen.current) throw new Error('UNSAVED_NOTE: 请先保存或取消便签');
    await flight.current;
    await editingController.current?.flush();
    await surfingFlush.current?.();
    await cruiseFlush.current?.();
    await layoutFlight.current;
    if (pending.current) throw new Error('UNSAVED_CHANGE');
    if (current.current) unwrap(await window.enlumor.saveReadingState(current.current));
  }
  useEffect(() => {
    reader.current = new PdfReader(container.current!, state => {
      const pageChanged=current.current?.documentId!==state.documentId||current.current?.pageIndex!==state.pageIndex;
      current.current = state; setReadingLayout(state.layout||'continuous'); if(pageChanged){syncPage(state.pageIndex + 1);if(editingEnabled.current)void prepareNearby(state.pageIndex);} setZoom(state.zoom);
      clearTimeout(timer.current); if(!noteOpen.current)timer.current = setTimeout(() => { void flush().catch(fail); }, 500);
    }, selected => {
      if(selected.length)notifyCruiseTakeover();
      setParts(old => !selected.length && !old.length ? old : selected);
    }, setNotice, setOutline, line=>{
      setDrawMode(null);const opened=activeDocument.current;if(!opened)return;
      void commit({documentId:opened.id,upserts:[{...line,id:crypto.randomUUID(),documentId:opened.id,fingerprint:opened.fingerprint,type:line.type,author:'user',color:colorRef.current,quote:'',note:''}],deletes:[]});
    }, ()=>!locked.current&&!pending.current&&!noteOpen.current&&!editingController.current?.hasDraft,()=>colorRef.current,ids=>{
      setDrawMode(null);const opened=activeDocument.current;if(!opened)return;
      void commit({documentId:opened.id,upserts:[],deletes:ids});
    },setTextNotice);
    const off = window.enlumor.onFlush(async()=>{surfingCancel.current?.();await flush();});
    void (async () => {
      try { editingEnabled.current=unwrap(await window.enlumor.getEditingCapabilities()).enabled;if(editingEnabled.current)editingController.current=new EditingController(window.enlumor,acceptEditingView); const savedLayout = unwrap(await window.enlumor.getLayout()); setLayout(savedLayout); layoutRef.current = savedLayout; const list = unwrap(await window.enlumor.listDocuments()); setRecent(list);
        const session = unwrap(await window.enlumor.getTabs());
        if (session) {
          const restored = session.openIds.map(id=>list.find(item=>item.id===id)).filter((item):item is DocumentInfo=>!!item);
          tabsRef.current=restored;setTabs(restored);
          if(session.activeId && restored.some(item=>item.id===session.activeId)) await load(session.activeId);
        } else if(list.length) await load(list[0].id); }
      catch (reason) { fail(reason); }
    })();
    const keyboard = (event: KeyboardEvent) => {
      if(document.querySelector('dialog.ai-settings[open]')){if(event.ctrlKey&&(event.key==='Tab'||event.key.toLowerCase()==='w'))event.preventDefault();return;}

      if (noteOpen.current && event.ctrlKey && (event.key === 'Tab' || event.key.toLowerCase() === 'w')) { event.preventDefault(); return; }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault(); const list=tabsRef.current; const index=list.findIndex(tab=>tab.id===activeId.current);
        const next=list[(index+(event.shiftKey?-1:1)+list.length)%list.length];if(next)void load(next.id);return;
      }
      if (event.ctrlKey && event.key.toLowerCase()==='w') { event.preventDefault(); if(activeId.current)void closeTab(activeId.current);return; }
      if(event.key==='Escape'&&noteOpen.current){event.preventDefault();if(!locked.current&&!pending.current)closeNote();return;}
      if (event.key === 'Escape') { void commandHost.current?.run({type:'pause'}).then(commandError); resetDrawing(); setParts([]); setNote(null); setLayoutOpen(false); window.getSelection()?.removeAllRanges(); }
    };
    window.addEventListener('keydown', keyboard);
    const observer = new ResizeObserver(entries => setWorkspaceWidth(entries[0].contentRect.width));
    observer.observe(workspaceElement.current!);
    const resized = () => {resetDrawing();setParts([]);};
    window.addEventListener('resize', resized);
    return () => { commandHost.current?.invalidate();observer.disconnect(); off(); clearTimeout(timer.current); window.removeEventListener('keydown', keyboard); window.removeEventListener('resize', resized); };
  }, []);
  useLayoutEffect(()=>{
    if(!parts.length||!container.current||!selectionPopover.current)return;
    const bounds=container.current.getBoundingClientRect(),popup=selectionPopover.current.getBoundingClientRect();
    const selection=getSelection();if(!selection?.rangeCount)return;
    const rect=selection.getRangeAt(0).getBoundingClientRect();
    const left=Math.max(bounds.left+12,Math.min(bounds.right-popup.width-12,rect.left));
    const candidate=rect.top-bounds.top>=popup.height+12?rect.top-popup.height-12:rect.bottom+10;
    const top=Math.max(bounds.top+12,Math.min(bounds.bottom-popup.height-12,candidate));
    setSelectionPosition(old=>Math.abs(old.left-left)<.1&&Math.abs(old.top-top)<.1?old:{left,top});
  },[parts]);
  async function load(id?: string, rebind = false, replacementTabs?: DocumentInfo[]) {
    if (locked.current || pending.current || noteOpen.current || editingController.current?.hasDraft) return false;
    surfingCancel.current?.();
    resetDrawing();locked.current = true; setBusy(true); setError('');
    let replacing = false;
    const previous = { document:activeDocument.current, marks:activeMarks.current, reading:current.current, tabs:[...tabsRef.current], activeId:activeId.current };
    const job = (async () => {
      await flush();
      const opened = unwrap(await (id ? rebind ? window.enlumor.rebindDocument(id) : window.enlumor.restoreDocument(id) : window.enlumor.openDocument()));
      if (!opened) return false;
      if(editingEnabled.current)await editingController.current!.activate(null);
      const annotations:Annotation[] = editingEnabled.current?[]:unwrap(await window.enlumor.getAnnotations(opened.id));
      const baseTabs=replacementTabs || tabsRef.current;
      const nextTabs=baseTabs.some(tab=>tab.id===opened.id) ? baseTabs.map(tab=>tab.id===opened.id?opened:tab) : [...baseTabs,opened];
      resetDrawing();previous.reading = current.current;
      commandHost.current?.invalidate();replacing = true; current.current=null;clearBlocks();setCruiseOpen(false);setSurfingOpen(false);setParts([]);setNotice('');setTextNotice('');
      await reader.current!.open(opened);
      unwrap(await window.enlumor.saveTabs({openIds:nextTabs.map(tab=>tab.id),activeId:opened.id}));
      setQuery('');setHistory(histories.current.get(opened.id) || emptyHistory());
      tabsRef.current=nextTabs.map(({id,path,name,fingerprint,pageCount,updatedAt})=>({id,path,name,fingerprint,pageCount,updatedAt}));setTabs(tabsRef.current);activeId.current=opened.id;
      activeDocument.current=opened;activeMarks.current=annotations;
      setDoc(opened); setReadingLayout(opened.reading?.layout||'continuous'); syncPage((opened.reading?.pageIndex || 0) + 1); setZoom(opened.reading?.zoom || 1);
      setMarks(annotations);if(editingEnabled.current){editingSnapshot.current=null;await editingController.current!.activate(opened.id);void prepareNearby(opened.reading?.pageIndex||0);}else reader.current!.setMarks(annotations as LegacyAnnotation[]);
      current.current = opened.reading || { documentId: opened.id, fingerprint: opened.fingerprint, pageIndex: 0, offset: 0, zoom: 1, rotation: 0 };
      replacing=false;setStatus('已恢复 · 原 PDF 只读'); await refresh(); return true;
    })();
    // load calls flush before assigning this job; no self-await cycle.
    flight.current = job;
    try { return await job; } catch (reason) {
      if(replacing) {
        try {
          unwrap(await window.enlumor.saveTabs({openIds:previous.tabs.map(tab=>tab.id),activeId:previous.activeId}));
          if(previous.document) {
            await reader.current!.open({...previous.document,reading:previous.reading});reader.current!.setMarks(previous.marks as LegacyAnnotation[]);
            current.current=previous.reading;activeDocument.current=previous.document;activeMarks.current=previous.marks;activeId.current=previous.activeId;
            setDoc(previous.document);setReadingLayout(previous.reading?.layout||'continuous');setMarks(previous.marks);setHistory(histories.current.get(previous.document.id)||emptyHistory());
            syncPage((previous.reading?.pageIndex||0)+1);setZoom(previous.reading?.zoom||1);
          } else clearCurrent();
        } catch(recovery) { clearCurrent();fail(new Error(`打开失败，恢复阅读视图也失败：${String(recovery)}`));return false; }
      }
      fail(reason); return false;
    } finally { flight.current = null; locked.current = false; setBusy(false); }
  }
  async function commit(change: UiChange, kind: 'new' | 'undo' | 'redo' = 'new'):Promise<boolean> {
    if(editingEnabled.current)return commitPreview(change);
    if (locked.current || (pending.current && pending.current.change!==change)) return false;
    if(change.documentId!==activeId.current){fail(new Error('DOCUMENT_MISMATCH: 批注不属于当前文档'));return false;}
    resetDrawing();locked.current = true; setBusy(true); setError(''); setStatus('正在保存…'); pending.current = { change, kind };
    const job = (async () => {
      const result = unwrap(await window.enlumor.applyAnnotationChange(change as AnnotationChange));
      pending.current = null;activeMarks.current=result.annotations; setMarks(result.annotations); reader.current!.setMarks(result.annotations,[...change.deletes,...change.upserts.map(mark=>mark.id)]); setParts([]);
      setHistory(old => {
        const next=kind==='undo'?{undo:old.undo.slice(0,-1),redo:[...old.redo,result.inverse]}:kind==='redo'?{undo:[...old.undo,result.inverse],redo:old.redo.slice(0,-1)}:{undo:[...old.undo,result.inverse],redo:[]};
        histories.current.set(change.documentId,next);return next;
      });
      setStatus('已保存 · 本地 SQLite');
    })();
    flight.current = job;
    try { await job; return true; } catch (reason) { fail(reason); return false; } finally { flight.current = null; locked.current = false; setBusy(false); }
  }
  function openNote(mark?:Annotation,trigger?:HTMLElement,free=false) {
    if(locked.current||pending.current)return;
    const opened=activeDocument.current;if(!opened)return;
    noteTrigger.current=trigger||document.activeElement as HTMLElement;resetDrawing();clearTimeout(timer.current);setError('');
    noteAnchor.current={documentId:opened.id,fingerprint:opened.fingerprint,free,parts:(free?[]:parts).map(p=>({...p,quads:p.quads.map(q=>[...q])}))};
    noteOpen.current=true;setEditing(mark||null);setNote(mark?.note||'');
  }
  function closeNote() {
    if(locked.current)return;
    // Explicit cancellation may discard only the uncommitted operation, never persisted marks.
    if(editingEnabled.current&&editingController.current?.hasDraft){void editingController.current.discard();setError('');setStatus('已放弃未保存便签 · 已保存标识保留');}
    if(pending.current){pending.current=null;setError('');setStatus('已放弃未保存便签 · 已保存批注保留');}
    noteOpen.current=false;noteAnchor.current=null;setNote(null);setEditing(null);
  }
  async function submitNote() {
    if(locked.current||note===null)return;
    const anchor=noteAnchor.current,opened=activeDocument.current;
    if(!anchor||!opened||anchor.documentId!==opened.id||anchor.fingerprint!==opened.fingerprint){
      fail(new Error('NOTE_DOCUMENT_MISMATCH: 文档已变化，便签草稿已保留'));return;
    }
    if(editingEnabled.current&&editingController.current?.hasDraft){if(await submitEdit({type:'list_marks'},true))closeNote();return;}
    let change:UiChange,kind:'new'|'undo'|'redo'='new';
    if(pending.current){change=pending.current.change;kind=pending.current.kind;}
    else if(editing)change={documentId:anchor.documentId,upserts:[{...editing,note}],deletes:[]};
    else {
      if(!anchor.parts.length){if(editingEnabled.current&&anchor.free){const p=reader.current!.freeNoteAnchor();change={documentId:anchor.documentId,deletes:[],upserts:[{...p,id:crypto.randomUUID(),documentId:opened.id,fingerprint:opened.fingerprint,type:'note',note,color}]};if(await commit(change))closeNote();return;}fail(new Error('NOTE_ANCHOR_MISSING: 原文定位已失效，草稿已保留。请取消后重新选择原文'));return;}
      change={documentId:anchor.documentId,upserts:anchor.parts.map(p=>({...p,id:crypto.randomUUID(),documentId:anchor.documentId,fingerprint:anchor.fingerprint,type:'note',note,color,author:'user'})),deletes:[]};
    }
    if(await commit(change,kind))closeNote();
  }
  function clearCurrent() {
    if(editingEnabled.current){void editingController.current?.activate(null);editingSnapshot.current=null;setEditingView(null);}
    commandHost.current?.invalidate();clearTimeout(timer.current);clearBlocks();setCruiseOpen(false);setSurfingOpen(false);current.current=null;activeId.current=null;activeDocument.current=null;activeMarks.current=[];reader.current?.clear();setDoc(null);setMarks([]);setParts([]);setHistory(emptyHistory());setQuery('');setNotice('');setTextNotice('');resetDrawing();syncPage(1);setZoom(1);setReadingLayout('continuous');
  }
  async function closeTab(id:string) {
    if(locked.current || pending.current || noteOpen.current)return;
    const index=tabsRef.current.findIndex(tab=>tab.id===id);if(index<0)return;
    surfingCancel.current?.();
    const remaining=tabsRef.current.filter(tab=>tab.id!==id);
    if(id===activeId.current && remaining.length) {
      if(await load(remaining[Math.min(index,remaining.length-1)].id,false,remaining))histories.current.delete(id);
      return;
    }
    resetDrawing();locked.current=true;setBusy(true);setError('');
    const job=(async()=>{
      await flush();
      const nextActive=id===activeId.current?null:activeId.current;
      unwrap(await window.enlumor.saveTabs({openIds:remaining.map(tab=>tab.id),activeId:nextActive}));
      tabsRef.current=remaining;setTabs(remaining);histories.current.delete(id);
      if(id===activeId.current)clearCurrent();
      setStatus('已关闭标签 · 文档与批注保留');
    })();
    flight.current=job;
    try{await job;}catch(reason){fail(reason);}finally{flight.current=null;locked.current=false;setBusy(false);}
  }
  function add(type: 'highlight' | 'underline' | 'strikeout' | 'note', text = '') {
    if (!doc || !parts.length) return;
    const upserts: Annotation[] = parts.map(part => ({ ...part, id: crypto.randomUUID(), documentId: doc.id, fingerprint: doc.fingerprint, type, note: text, color, author: 'user' }));
    void commit({ documentId: doc.id, upserts, deletes: [] });
  }
  async function exportPdf() {
    if (!doc || locked.current || pending.current) return;
    resetDrawing();locked.current = true; setBusy(true); setError(''); setStatus('正在导出…');
    try { await flush(); const result = unwrap(await window.enlumor.exportAnnotatedPdf(doc.id)); setStatus(result.cancelled ? '已取消导出' : `导出完成 · ${result.path}`); }
    catch (reason) { fail(reason); } finally { locked.current = false; setBusy(false); }
  }
  const panels = fitPanels(layout, workspaceWidth, libraryOpen, notesOpen);
  const previewPanel = (side:'left'|'right', value:number) => {
    const sizes=fitPanels({...layoutRef.current,[side]:value},workspaceWidth,libraryOpen,notesOpen);
    workspaceElement.current!.style.setProperty('--library-width', sizes.left+'px');
    workspaceElement.current!.style.setProperty('--notes-width', sizes.right+'px');
  };
  const commitPanel = (side:'left'|'right', value:number) => persistLayout({...layoutRef.current,[side]:value});
  return <div className="app" style={{'--ui-spacing':layout.spacing+'px'} as CSSProperties}>
    <header className="topbar" onClickCapture={()=>notifyCruiseTakeover()}><div className="wordmark"><span className="brand-dot">e</span>enlumor</div><span className="edition">YOUR QUIET READING ROOM</span>
      <div className="panel-toggles"><button className={libraryOpen ? 'is-active' : ''} aria-label={libraryOpen ? '收起文档栏' : '展开文档栏'} aria-expanded={libraryOpen} onClick={() => { resetDrawing();setParts([]); setLibraryOpen(!libraryOpen); }}><Glyph name="library"/></button><button className={notesOpen ? 'is-active' : ''} aria-label={notesOpen ? '收起批注栏' : '展开批注栏'} aria-expanded={notesOpen} onClick={() => { resetDrawing();setParts([]); setNotesOpen(!notesOpen); }}><Glyph name="notes"/></button></div>
      <button aria-label="布局设置" aria-expanded={layoutOpen} onClick={() => setLayoutOpen(!layoutOpen)}>布局</button><div className="top-actions"><button onClick={() => void load()} disabled={busy || !!pending.current}><Glyph name="open"/>打开 PDF</button><button className="primary" disabled={!doc || busy || !!pending.current} onClick={() => void exportPdf()}>导出批注 PDF <Glyph name="export"/></button></div>
    <button aria-label="模型设置" disabled={busy||!!pending.current} onClick={event=>{resetDrawing();setParts([]);modelSettingsTrigger.current=event.currentTarget;setModelSettingsOpen(true);}}>模型设置</button></header>
    {layoutOpen && <div className="layout-popover" role="region" aria-label="布局设置"><label>阅读间距 <select aria-label="阅读间距" value={layout.spacing} onChange={event=>persistLayout({...layoutRef.current,spacing:Number(event.target.value) as 12|16|24})}><option value="12">紧凑</option><option value="16">标准</option><option value="24">宽松</option></select></label><p>拖动侧栏边缘调宽；方向键微调，双击恢复宽度。</p><button onClick={()=>persistLayout(defaultLayout)}>恢复默认布局</button><button aria-label="关闭布局设置" onClick={()=>setLayoutOpen(false)}>完成</button></div>}
    <div className="workspace" ref={workspaceElement} style={{'--library-width':panels.left+'px','--notes-width':panels.right+'px'} as CSSProperties}>
      <aside onClickCapture={()=>notifyCruiseTakeover()} className="library" hidden={!libraryOpen}>
        <div className="section-label">LIBRARY / 你的阅读空间</div>
        <h2>{libraryView === 'documents' ? '文档' : libraryView === 'outline' ? '目录' : '缩略图'}<span className="section-count">{(libraryView === 'documents' ? recent.length : libraryView === 'thumbnails' ? doc?.pageCount || 0 : outline?.length || 0).toString().padStart(2, '0')}</span></h2>
        <div className="library-tabs" role="tablist" aria-label="文档导航"><button role="tab" aria-selected={libraryView === 'documents'} onClick={() => setLibraryView('documents')}>文档</button><button role="tab" aria-selected={libraryView === 'outline'} disabled={!doc} onClick={() => setLibraryView('outline')}>目录</button><button role="tab" aria-selected={libraryView === 'thumbnails'} disabled={!doc} onClick={() => setLibraryView('thumbnails')}>缩略图</button></div>
        {libraryView === 'documents' ? <div className="recent-list">{recent.map(item => <div className={`recent ${doc?.id === item.id ? 'active' : ''}`} key={item.id}><button title={item.path} disabled={busy || !!pending.current} onClick={() => void load(item.id)}><span className="file-icon"><Glyph name="notes"/></span><span>{item.name}<small>{item.pageCount} 页 · 本地文件</small></span></button><button className="rebind" aria-label={`重新关联 ${item.name}`} disabled={busy || !!pending.current} onClick={() => void load(item.id, true)}>重新关联</button></div>)}{!recent.length && <div className="library-empty">还没有文档。<br/>打开 PDF 后，它会留在这里。</div>}</div> : libraryView === 'thumbnails' ? libraryOpen && doc && reader.current && <ThumbnailRail key={doc.id} reader={reader.current} documentId={doc.id} pageCount={doc.pageCount} currentPage={currentPage}/> : <div className="recent-list" aria-label="PDF 目录">{outline === null ? <p className="library-empty">正在读取目录…</p> : outline.length ? <OutlineTree items={outline} navigate={id => void reader.current?.goToOutline(id)}/> : <p className="library-empty">此 PDF 没有目录，可使用页码跳转。</p>}</div>}
        <div className="library-footer"><span className="online-dot"/> 离线可用<span>所有阅读痕迹保存在这台电脑</span></div>
      </aside>
      {libraryOpen && <PanelDivider side="left" size={panels.left} max={Math.min(420,workspaceWidth-400-(notesOpen?panels.right+12:6))} start={()=>{notifyCruiseTakeover();resetDrawing();setParts([]);}} preview={value=>previewPanel('left',value)} commit={value=>commitPanel('left',value)} reset={()=>persistLayout({...layoutRef.current,left:208})}/>}
      <main className="reading">
        {tabs.length>0 && <div className="document-tabs" role="tablist" aria-label="已打开文档" onKeyDown={event=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
          event.preventDefault();const index=tabs.findIndex(tab=>tab.id===activeId.current);
          const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
          const buttons=event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');buttons[next]?.focus();void load(tabs[next].id);
        }}>{tabs.map(tab=><div className={`document-tab ${doc?.id===tab.id?'active':''}`} key={tab.id}>
          <button role="tab" aria-label={tab.name} aria-selected={doc?.id===tab.id} tabIndex={doc?.id===tab.id?0:-1} title={tab.path} disabled={busy||!!pending.current} onClick={()=>void load(tab.id)}>{tab.name}</button>
          <button aria-label={`关闭 ${tab.name}`} title="关闭标签（Ctrl+W）" disabled={busy||!!pending.current} onClick={()=>void closeTab(tab.id)} onKeyDown={event=>event.stopPropagation()}>×</button>
        </div>)}</div>}<div className="document-bar"><span className="document-name">{doc?.name || '还没有打开文档'}</span><span className="mode-pill">纯阅读</span></div>
        <div className="toolbar" onClickCapture={()=>notifyCruiseTakeover()}><button aria-label="打开 Surfing" disabled={!doc||busy} onClick={()=>{resetDrawing();setCruiseOpen(false);setSurfingOpen(true);}}>Surfing</button><button aria-label="打开 Cruise" disabled={!doc||busy} onClick={()=>{const open=()=>{resetDrawing();setSurfingOpen(false);setCruiseOpen(true);};if(surfingFlush.current)void surfingFlush.current().then(open).catch(fail);else open();}}>Cruise</button><button aria-label="读取本页阅读块" disabled={!doc||busy||blocksBusy} onClick={()=>void readBlocks()}>{blocksBusy?'读取中…':'阅读块'}</button><label className="reading-layout"><span className="sr-only">阅读模式</span><select aria-label="阅读模式" disabled={!doc||busy} value={readingLayout} onChange={event=>{notifyCruiseTakeover();setParts([]);resetDrawing();const mode=event.target.value as 'continuous'|'single';reader.current?.setLayout(mode);setReadingLayout(mode);}}><option value="continuous">连续滚动</option><option value="single">单页阅读</option></select></label><div className="toolbar-group"><button aria-label="上一页" disabled={!doc||busy||currentPage<=1} onClick={() => navigatePage(currentPage-1)}>‹</button><input aria-label="跳转页码" className="page-input" inputMode="numeric" aria-invalid={!!pageError} aria-describedby={pageError?"page-error":undefined} disabled={!doc||busy} value={page} onChange={event => {setPage(event.target.value);setPageError('');}} onKeyDown={event => {if(event.key==='Enter'){event.preventDefault();submitPage();}else if(event.key==='Escape'){event.preventDefault();syncPage(currentPage);}}}/><span className="muted">/ {doc?.pageCount || '—'}</span><button aria-label="下一页" disabled={!doc||busy||currentPage>=doc.pageCount} onClick={() => navigatePage(currentPage+1)}>›</button></div>
          <div className="toolbar-group"><button aria-label="缩小" disabled={!doc} onClick={() => reader.current?.zoom(zoom / 1.1)}>−</button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button aria-label="放大" disabled={!doc} onClick={() => reader.current?.zoom(zoom * 1.1)}>+</button><button disabled={!doc} onClick={() => reader.current?.fit('page-width')}>适宽</button><button disabled={!doc} onClick={() => reader.current?.fit('page-fit')}>适页</button><button aria-label="旋转页面" disabled={!doc} onClick={() => reader.current?.rotate()}>↻</button></div>
          <form className="search" onSubmit={event => { event.preventDefault(); notifyCruiseTakeover(); reader.current?.search(query); }}><input aria-label="全文搜索" placeholder="在文档中搜索…" disabled={!doc} value={query} onChange={event => setQuery(event.target.value)}/><button aria-label="搜索" disabled={!doc}>⌕</button><button type="button" aria-label="下一个搜索结果" disabled={!doc} onClick={() => reader.current?.search(query, true)}>↓</button></form>
        </div>
        {surfingOpen&&doc&&reader.current&&<SurfingPanel key={doc.id} document={doc} reader={reader.current} takeover={surfingTakeover} takeoverRef={surfingCancel} flushRef={surfingFlush} settingsOpen={modelSettingsOpen} onSettings={()=>{modelSettingsTrigger.current=window.document.activeElement as HTMLElement;setModelSettingsOpen(true);}} onExit={()=>setSurfingOpen(false)}/>}
        {cruiseOpen&&doc&&reader.current&&<CruisePanel key={doc.id} document={doc} reader={reader.current} takeover={cruiseTakeover} selection={parts} settingsOpen={modelSettingsOpen} flushRef={cruiseFlush} onSettings={()=>{modelSettingsTrigger.current=window.document.activeElement as HTMLElement;setModelSettingsOpen(true);}} onExit={()=>setCruiseOpen(false)}/>}
        {blocksOpen&&<section onClickCapture={()=>notifyCruiseTakeover()} className="cruise-block-list" aria-label="本页阅读块"><div><strong>本页阅读块 · 原文定位</strong><button aria-label="收起阅读块" onClick={()=>{void documentCommand({type:'clear_focus'}).then(commandError);setBlocksOpen(false);}}>收起</button></div>{cruiseBlocks.length?cruiseBlocks.map((block,index)=><button key={block.id} data-block-id={block.id} aria-label={`定位阅读块 ${index+1}`} onClick={()=>{resetDrawing();void documentCommand({type:'show_evidence',pageIndex:block.pageIndex,passageId:block.id}).then(commandError);}}>{block.quote}</button>):<p>当前页没有可用阅读块；扫描页需要文字层，可略过或继续普通阅读。</p>}</section>}
        {pageError && <div id="page-error" className="notice" role="alert">{pageError}</div>}
        {(error||pending.current||layoutError||editingController.current?.hasDraft) && <div className="error" role="alert">{error||'存在未保存更改'}{editingController.current?.hasDraft&&note===null&&<><button disabled={busy} onClick={()=>void submitEdit({type:'list_marks'},true)}>重试保存</button><button disabled={busy} onClick={()=>{void editingController.current?.discard().then(()=>{setError('');setStatus('已放弃草稿 · 已保存标识保留');});}}>放弃草稿</button></>}{layoutError && <button onClick={()=>persistLayout(layoutRef.current)}>重试布局保存</button>}{pending.current && note===null && <button disabled={busy} onClick={() => void commit(pending.current!.change, pending.current!.kind)}>重试保存</button>}{doc && note===null && <button disabled={busy} onClick={() => { pending.current = null; if(activeId.current)histories.current.delete(activeId.current); clearCurrent(); setError(''); setStatus('已关闭文档 · 已保存批注保留'); }}>关闭文档并放弃未保存更改</button>}<button aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
        {(textNotice||notice) && <div className="notice">{[textNotice,notice].filter(Boolean).join(' · ')}</div>}
        <div className="reader-stage"><div id="viewerContainer" ref={container} tabIndex={0} onWheelCapture={()=>notifyCruiseTakeover()} onPointerDownCapture={()=>notifyCruiseTakeover()} onKeyDownCapture={event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))notifyCruiseTakeover();}}><div id="viewer" className="pdfViewer"/></div>
          {!doc && <div className="empty"><div className="paper-emblem" aria-hidden="true"><svg viewBox="0 0 140 100" fill="none"><path d="M70 21C50 9 25 10 12 16v64c20-7 38-6 58 4 20-10 38-11 58-4V16c-13-6-38-7-58 5Zm0 0v63M25 33l30 4M25 45l30 4M25 57l22 3M85 37l29-4M85 49l29-4M85 61l21-3"/></svg></div><span className="empty-index">A QUIETER PLACE TO READ</span><h1>让理解，<br/>留在原文旁。</h1><p>打开一本书、一篇论文，或今天的讲义。<br/>选中，标记，下次从这里继续。</p><button className="primary" disabled={busy} onClick={() => void load()}>打开 PDF <Glyph name="open"/></button><small>无需账户 · 离线可用 · 原文件保持不变</small><div className="empty-footnote"><span>01 — 阅读原文</span><span>02 — 留下思考</span><span>03 — 从这里继续</span></div></div>}
        </div>
        <footer className="statusbar"><span role="status">{status}</span><span>{doc ? `${marks.length} 条批注` : 'ENLUMOR / FOUNDATION'}</span></footer>
      </main>
      {notesOpen && <PanelDivider side="right" size={panels.right} max={Math.min(460,workspaceWidth-400-(libraryOpen?panels.left+12:6))} start={()=>{notifyCruiseTakeover();resetDrawing();setParts([]);}} preview={value=>previewPanel('right',value)} commit={value=>commitPanel('right',value)} reset={()=>persistLayout({...layoutRef.current,right:282})}/>}
      <aside onClickCapture={()=>notifyCruiseTakeover()} className="annotations" hidden={!notesOpen}><div className="section-label">MARGINALIA / 页边思考</div><h2>批注 <span>{marks.length.toString().padStart(2, '0')}</span></h2>
        <div className="annotation-tools"><label className="color-label">颜色 <input type="color" aria-label="批注颜色" value={color} onChange={event => setColor(event.target.value)}/></label><button className="primary" disabled={!parts.length || busy || !!pending.current} onMouseDown={event => event.preventDefault()} onClick={() => add('highlight')}>高亮选区</button><button disabled={!parts.length || busy || !!pending.current} onMouseDown={event=>event.preventDefault()} onClick={()=>add('underline')}>下划线选区</button><button disabled={!parts.length||busy||!!pending.current} onMouseDown={event=>event.preventDefault()} onClick={()=>add('strikeout')}>删除线选区</button><button aria-label="绘制直线" aria-pressed={drawMode==='line'} disabled={!doc||busy||!!pending.current} onClick={()=>{setParts([]);const mode=drawMode==='line'?null:'line';reader.current?.setDrawingTool(mode);setDrawMode(mode);}}>直线</button><button aria-label="绘制箭头" aria-pressed={drawMode==='arrow'} disabled={!doc||busy||!!pending.current} onClick={()=>{setParts([]);const mode=drawMode==='arrow'?null:'arrow';reader.current?.setDrawingTool(mode);setDrawMode(mode);}}>箭头</button><button aria-label="绘制画笔" aria-pressed={drawMode==='ink'} disabled={!doc||busy||!!pending.current} onClick={()=>{setParts([]);const mode=drawMode==='ink'?null:'ink';reader.current?.setDrawingTool(mode);setDrawMode(mode);}}>画笔</button><button aria-label="整笔擦除" title="只擦除画笔整条笔迹；Esc取消" aria-pressed={drawMode==='erase'} disabled={!doc||busy||!!pending.current} onClick={()=>{setParts([]);const mode=drawMode==='erase'?null:'erase';reader.current?.setDrawingTool(mode);setDrawMode(mode);}}>整笔擦除</button><button disabled={!parts.length || busy || !!pending.current} onMouseDown={event => event.preventDefault()} onClick={event => openNote(undefined,event.currentTarget)}>添加便签</button>{editingEnabled.current&&<button disabled={!doc||busy} onClick={event=>openNote(undefined,event.currentTarget,true)}>自由便签</button>}</div>
        {drawMode==='erase'&&<p className="eraser-hint">仅擦除本软件新建的画笔整条笔迹；原 PDF 不变。Esc 取消。</p>}
        <div className="history"><button disabled={!(editingEnabled.current?editingView?.history.undoIds.length:history.undo.length) || busy || !!pending.current} onClick={() => editingEnabled.current?void submitEdit({type:'undo_edit',operationId:editingView!.history.undoIds[0]}):void commit(history.undo.at(-1)!, 'undo')}>撤销</button><button disabled={!(editingEnabled.current?editingView?.history.redoIds.length:history.redo.length) || busy || !!pending.current} onClick={() => editingEnabled.current?void submitEdit({type:'redo_edit',operationId:editingView!.history.redoIds[0]}):void commit(history.redo.at(-1)!, 'redo')}>重做</button></div>
        {parts.length > 0 && <div className="selection-preview">已选 {parts.length} 页原文<p>{parts.map(part => part.quote).join(' ').slice(0, 180)}</p></div>}
        <div className="annotation-list">{marks.map(mark => <article data-testid="annotation-item" className="annotation-card" data-mark-id={mark.id} key={mark.id} style={{ borderLeftColor: mark.color }}><button className="annotation-source" onClick={() => reader.current?.focus(mark)}><span>第 {mark.pageIndex + 1} 页 · {mark.type === 'note' ? '便签' : mark.type==='underline'?'下划线':mark.type==='strikeout'?'删除线':mark.type==='ink'?'画笔':mark.type==='arrow'?'箭头':mark.type==='line'?'直线':'高亮'}</span><p>{mark.quote || (mark.type==='ink'?'页面笔迹':mark.type==='arrow'?'页面箭头':mark.type==='line'?'页面直线':'页面便签')}</p></button>{mark.note && <p className="note-content">{mark.note}</p>}{editingEnabled.current&&<small className="editing-source">{mark.origin?.kind==='ai'?'AI':'人工'} · {mark.editable?'已保存':'只读 · '+mark.reason} · {mark.retained?'已固定':'未固定'}{mark.visible===false?' · 已隐藏':''}</small>}<div className="card-actions">{editingEnabled.current&&mark.editable&&mark.anchorId&&<button disabled={busy||parts.length!==1} onClick={()=>void previewAnchor(mark)}>更换原文</button>}{editingEnabled.current&&mark.editable===false&&<button disabled={busy||parts.length!==1} onClick={()=>void previewReanchor(mark)}>重新定位</button>}{editingEnabled.current&&mark.editable&&['note','line','arrow','ink'].includes(mark.type)&&<button disabled={busy} onClick={()=>setGeometryEdit({mark,points:mark.points?.join(',')||'',dx:String(mark.placement?.dx||0),dy:String(mark.placement?.dy||0)})}>{mark.type==='note'?'位置':'端点'}</button>}{editingEnabled.current&&mark.editable&&mark.version!=null&&<><button disabled={busy} onClick={()=>void submitEdit({type:'set_marks_visibility',targets:[{id:mark.id,expectedVersion:mark.version!}],visible:!mark.visible})}>{mark.visible?'隐藏':'显示'}</button><button disabled={busy} onClick={()=>void submitEdit({type:'set_marks_retention',targets:[{id:mark.id,expectedVersion:mark.version!}],retained:!mark.retained})}>{mark.retained?'取消固定':'固定'}</button></>}<button disabled={busy || !!pending.current || mark.editable===false} onClick={() => void commit({ documentId: mark.documentId, upserts: [{ ...mark, color }], deletes: [] })}>应用颜色</button>{mark.type === 'note' && <button disabled={busy || !!pending.current || mark.editable===false} onClick={event => openNote(mark,event.currentTarget)}>编辑</button>}<button disabled={busy || !!pending.current || mark.editable===false} onClick={() => void commit({ documentId: mark.documentId, upserts: [], deletes: [mark.id] })}>删除</button></div></article>)}</div>
        {!marks.length && <div className="annotation-empty"><span>〰</span><p>选中一段原文<br/>留下你的第一个标记。</p><small>批注自动保存到本地工作区</small></div>}
      </aside>
    </div>
    {parts.length > 0 && doc && <div ref={selectionPopover} onClickCapture={()=>notifyCruiseTakeover()} className="selection-popover" role="toolbar" aria-label="选区工具" style={{...selectionPosition,maxWidth:Math.max(200,(container.current?.clientWidth||400)-24)}} onMouseDown={event => event.preventDefault()}><span>{parts.length > 1 ? `${parts.length} 页选区` : '原文选区'}</span><button disabled={busy || !!pending.current} onClick={() => add('highlight')}><Glyph name="mark"/>高亮</button><button disabled={busy||!!pending.current} onClick={()=>add('underline')}>下划线</button><button disabled={busy||!!pending.current} onClick={()=>add('strikeout')}>删除线</button><button disabled={busy || !!pending.current} onClick={event => openNote(undefined,event.currentTarget)}>写便签</button><button className="popover-close" aria-label="取消选区" onClick={() => { setParts([]); window.getSelection()?.removeAllRanges(); }}><Glyph name="close"/></button></div>}
    {anchorPreview&&<dialog open className="legacy-reanchor anchor-replace" aria-label="更换原文确认"><h2>更换原文确认</h2><p>旧原文 · 第 {anchorPreview.mark.pageIndex+1} 页：{anchorPreview.mark.quote}</p><p>新原文 · 第 {anchorPreview.anchor.pageIndex+1} 页：{anchorPreview.anchor.quote}</p><p>{JSON.stringify(anchorPreview.mark.quads)} → {JSON.stringify(anchorPreview.anchor.quads)}</p><button disabled={busy} onClick={()=>{void submitEdit({type:'replace_mark_anchor',id:anchorPreview.mark.id,expectedVersion:anchorPreview.mark.version!,anchorId:anchorPreview.anchor.id}).then(ok=>{if(ok)setAnchorPreview(null);});}}>确认更换原文</button><button disabled={busy} onClick={()=>setAnchorPreview(null)}>取消</button></dialog>}
    {geometryEdit&&<dialog open className="editing-geometry" aria-label="调整标识位置"><h2>调整{geometryEdit.mark.type==='note'?'便签偏移':'路径坐标'}</h2>{geometryEdit.mark.type==='note'?<><label>横向偏移<input aria-label="横向偏移" type="number" value={geometryEdit.dx} onChange={e=>setGeometryEdit({...geometryEdit,dx:e.target.value})}/></label><label>纵向偏移<input aria-label="纵向偏移" type="number" value={geometryEdit.dy} onChange={e=>setGeometryEdit({...geometryEdit,dy:e.target.value})}/></label><p>仅改变便签显示偏移；原文锚点保持不变。</p></>:<label>原生 PDF 坐标<input aria-label="端点坐标" value={geometryEdit.points} onChange={e=>setGeometryEdit({...geometryEdit,points:e.target.value})}/></label>}<button disabled={busy} onClick={()=>void applyGeometry()}>应用位置</button><button disabled={busy} onClick={()=>setGeometryEdit(null)}>取消</button></dialog>}
    {legacyPreview&&<dialog open className="legacy-reanchor" aria-label="确认重新定位"><h2>兼容转换确认</h2><p>旧原文 · 第 {legacyPreview.legacy.annotation.pageIndex+1} 页：{legacyPreview.legacy.annotation.quote}</p><p>新原文 · 第 {legacyPreview.anchor.pageIndex+1} 页：{legacyPreview.anchor.quote}</p><p>旧位置 {JSON.stringify(legacyPreview.legacy.annotation.quads)} → 新位置 {JSON.stringify(legacyPreview.anchor.quads)}</p><p>保留原记录与兼容转换审计；这不是普通可撤销编辑。</p><button disabled={busy} onClick={()=>void confirmLegacy()}>确认兼容转换</button><button disabled={busy} onClick={()=>setLegacyPreview(null)}>取消</button></dialog>}
    {modelSettingsOpen && <ModelSettings returnFocus={modelSettingsTrigger.current} close={()=>setModelSettingsOpen(false)}/>}
    {note !== null && <NoteDialog returnFocus={noteTrigger.current} value={note} editing={!!editing} busy={busy} pending={!!pending.current||!!editingController.current?.hasDraft} error={error} change={setNote} submit={()=>void submitNote()} cancel={closeNote} dismiss={()=>setError('')}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);


