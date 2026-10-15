import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { PdfReader, type SelectionPart, type OutlineEntry } from './pdf-reader';
import { unwrap, type Annotation, type AnnotationChange, type Bridge, type DocumentInfo, type OpenedDocument, type ReadingState } from '../shared/model';
import './style.css';
declare global { interface Window { enlumor: Bridge } }

function Glyph({ name }: { name: 'library' | 'notes' | 'open' | 'export' | 'mark' | 'close' }) {
  const paths = { library: 'M4 4h5v16H4z M12 4h4v16h-4z M19 5l3 14', notes: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5', open: 'M3 8h7l2-3h8v5 M3 8v12h16l3-10H7l-4 10', export: 'M13 3h8v8 M21 3L10 14 M9 5H4v15h15v-5', mark: 'M5 15l9-11 5 4-9 11H5z M4 22h16', close: 'M6 6l12 12 M18 6L6 18' };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function OutlineTree({ items, navigate }: { items: OutlineEntry[]; navigate: (id: string) => void }) {
  return <ul className="outline-tree">{items.map(item => <li key={item.id}><button disabled={!item.navigable} onClick={() => navigate(item.id)}>{item.title}</button>{item.children.length > 0 && <OutlineTree items={item.children} navigate={navigate}/>}</li>)}</ul>;
}

function App() {
  const container = useRef<HTMLDivElement>(null), reader = useRef<PdfReader | null>(null);
  const [doc, setDoc] = useState<OpenedDocument | null>(null), [recent, setRecent] = useState<DocumentInfo[]>([]);
  const [marks, setMarks] = useState<Annotation[]>([]), [parts, setParts] = useState<SelectionPart[]>([]);
  const [status, setStatus] = useState('本地工作区就绪'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [page, setPage] = useState('1'), [zoom, setZoom] = useState(1), [query, setQuery] = useState('');
  const [color, setColor] = useState('#f4cf58'), [note, setNote] = useState<string | null>(null), [editing, setEditing] = useState<Annotation | null>(null);
  const [history, setHistory] = useState({ undo: [] as AnnotationChange[], redo: [] as AnnotationChange[] });
  const [libraryOpen, setLibraryOpen] = useState(true), [notesOpen, setNotesOpen] = useState(true);
  const [libraryView, setLibraryView] = useState<'documents' | 'outline'>('documents'), [outline, setOutline] = useState<OutlineEntry[] | null>([]);
  const [selectionPosition, setSelectionPosition] = useState({ left: 0, top: 0 });
  const current = useRef<ReadingState | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ change: AnnotationChange; kind: 'new' | 'undo' | 'redo' } | null>(null), flight = useRef<Promise<unknown> | null>(null), locked = useRef(false);
  const refresh = async () => setRecent(unwrap(await window.enlumor.listDocuments()));
  const fail = (reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)); setStatus('尚未保存 / 操作未完成'); };
  async function flush() {
    clearTimeout(timer.current);
    await flight.current;
    if (pending.current) throw new Error('UNSAVED_CHANGE');
    if (current.current) unwrap(await window.enlumor.saveReadingState(current.current));
  }
  useEffect(() => {
    reader.current = new PdfReader(container.current!, state => {
      current.current = state; setPage(String(state.pageIndex + 1)); setZoom(state.zoom);
      clearTimeout(timer.current); timer.current = setTimeout(() => { void flush().catch(fail); }, 500);
    }, selected => {
      setParts(old => !selected.length && !old.length ? old : selected);
      const selection = window.getSelection();
      if (selected.length && selection?.rangeCount) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const bounds = container.current!.getBoundingClientRect();
        const top = rect.top >= bounds.top + 64 ? rect.top - 52 : rect.bottom + 10;
        setSelectionPosition({ left: Math.max(bounds.left + 12, Math.min(bounds.right - 310, rect.left)), top: Math.max(bounds.top + 12, Math.min(bounds.bottom - 60, top)) });
      }
    }, setNotice, setOutline);
    const off = window.enlumor.onFlush(flush);
    void (async () => {
      try { const list = unwrap(await window.enlumor.listDocuments()); setRecent(list); if (list.length) await load(list[0].id); }
      catch (reason) { fail(reason); }
    })();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setParts([]); setNote(null); window.getSelection()?.removeAllRanges(); }
    };
    window.addEventListener('keydown', keyboard);
    const resized = () => setParts([]);
    window.addEventListener('resize', resized);
    return () => { off(); clearTimeout(timer.current); window.removeEventListener('keydown', keyboard); window.removeEventListener('resize', resized); };
  }, []);
  async function load(id?: string, rebind = false) {
    if (locked.current || pending.current) return;
    locked.current = true; setBusy(true); setError('');
    const job = (async () => {
      await flush();
      const opened = unwrap(await (id ? rebind ? window.enlumor.rebindDocument(id) : window.enlumor.restoreDocument(id) : window.enlumor.openDocument()));
      if (!opened) return;
      const annotations = unwrap(await window.enlumor.getAnnotations(opened.id));
      current.current = null; setParts([]); setNotice(''); setMarks([]); setQuery(''); setHistory({ undo: [], redo: [] });
      await reader.current!.open(opened);
      setDoc(opened); setPage(String((opened.reading?.pageIndex || 0) + 1)); setZoom(opened.reading?.zoom || 1);
      setMarks(annotations); reader.current!.setMarks(annotations);
      current.current = opened.reading || { documentId: opened.id, fingerprint: opened.fingerprint, pageIndex: 0, offset: 0, zoom: 1, rotation: 0 };
      setStatus('已恢复 · 原 PDF 只读'); await refresh();
    })();
    // load calls flush before assigning this job; no self-await cycle.
    flight.current = job;
    try { await job; } catch (reason) { fail(reason); } finally { flight.current = null; locked.current = false; setBusy(false); }
  }
  async function commit(change: AnnotationChange, kind: 'new' | 'undo' | 'redo' = 'new') {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setStatus('正在保存…'); pending.current = { change, kind };
    const job = (async () => {
      const result = unwrap(await window.enlumor.applyAnnotationChange(change));
      pending.current = null; setMarks(result.annotations); reader.current!.setMarks(result.annotations); setParts([]);
      setHistory(old => kind === 'undo' ? { undo: old.undo.slice(0, -1), redo: [...old.redo, result.inverse] } : kind === 'redo' ? { undo: [...old.undo, result.inverse], redo: old.redo.slice(0, -1) } : { undo: [...old.undo, result.inverse], redo: [] });
      setStatus('已保存 · 本地 SQLite');
    })();
    flight.current = job;
    try { await job; } catch (reason) { fail(reason); } finally { flight.current = null; locked.current = false; setBusy(false); }
  }
  function add(type: 'highlight' | 'note', text = '') {
    if (!doc || !parts.length) return;
    const upserts: Annotation[] = parts.map(part => ({ ...part, id: crypto.randomUUID(), documentId: doc.id, fingerprint: doc.fingerprint, type, note: text, color, author: 'user' }));
    void commit({ documentId: doc.id, upserts, deletes: [] });
  }
  async function exportPdf() {
    if (!doc || locked.current || pending.current) return;
    locked.current = true; setBusy(true); setError(''); setStatus('正在导出…');
    try { await flush(); const result = unwrap(await window.enlumor.exportAnnotatedPdf(doc.id)); setStatus(result.cancelled ? '已取消导出' : `导出完成 · ${result.path}`); }
    catch (reason) { fail(reason); } finally { locked.current = false; setBusy(false); }
  }
  return <div className="app">
    <header className="topbar"><div className="wordmark"><span className="brand-dot">e</span>enlumor</div><span className="edition">YOUR QUIET READING ROOM</span>
      <div className="panel-toggles"><button className={libraryOpen ? 'is-active' : ''} aria-label={libraryOpen ? '收起文档栏' : '展开文档栏'} aria-expanded={libraryOpen} onClick={() => { setParts([]); setLibraryOpen(!libraryOpen); }}><Glyph name="library"/></button><button className={notesOpen ? 'is-active' : ''} aria-label={notesOpen ? '收起批注栏' : '展开批注栏'} aria-expanded={notesOpen} onClick={() => { setParts([]); setNotesOpen(!notesOpen); }}><Glyph name="notes"/></button></div>
      <div className="top-actions"><button onClick={() => void load()} disabled={busy || !!pending.current}><Glyph name="open"/>打开 PDF</button><button className="primary" disabled={!doc || busy || !!pending.current} onClick={() => void exportPdf()}>导出批注 PDF <Glyph name="export"/></button></div>
    </header>
    <div className="workspace">
      <aside className="library" hidden={!libraryOpen}>
        <div className="section-label">LIBRARY / 你的阅读空间</div>
        <h2>{libraryView === 'documents' ? '文档' : '目录'}<span className="section-count">{(libraryView === 'documents' ? recent.length : outline?.length || 0).toString().padStart(2, '0')}</span></h2>
        <div className="library-tabs" role="tablist" aria-label="文档导航"><button role="tab" aria-selected={libraryView === 'documents'} onClick={() => setLibraryView('documents')}>文档</button><button role="tab" aria-selected={libraryView === 'outline'} disabled={!doc} onClick={() => setLibraryView('outline')}>目录</button></div>
        {libraryView === 'documents' ? <div className="recent-list">{recent.map(item => <div className={`recent ${doc?.id === item.id ? 'active' : ''}`} key={item.id}><button title={item.path} disabled={busy || !!pending.current} onClick={() => void load(item.id)}><span className="file-icon"><Glyph name="notes"/></span><span>{item.name}<small>{item.pageCount} 页 · 本地文件</small></span></button><button className="rebind" aria-label={`重新关联 ${item.name}`} disabled={busy || !!pending.current} onClick={() => void load(item.id, true)}>重新关联</button></div>)}{!recent.length && <div className="library-empty">还没有文档。<br/>打开 PDF 后，它会留在这里。</div>}</div> : <div className="recent-list" aria-label="PDF 目录">{outline === null ? <p className="library-empty">正在读取目录…</p> : outline.length ? <OutlineTree items={outline} navigate={id => void reader.current?.goToOutline(id)}/> : <p className="library-empty">此 PDF 没有目录，可使用页码跳转。</p>}</div>}
        <div className="library-footer"><span className="online-dot"/> 离线可用<span>所有阅读痕迹保存在这台电脑</span></div>
      </aside>
      <main className="reading"><div className="document-bar"><span className="document-name">{doc?.name || '还没有打开文档'}</span><span className="mode-pill">纯阅读</span></div>
        <div className="toolbar"><div className="toolbar-group"><button aria-label="上一页" disabled={!doc} onClick={() => reader.current?.go(Number(page) - 1)}>‹</button><input aria-label="跳转页码" className="page-input" disabled={!doc} value={page} onChange={event => setPage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') reader.current?.go(Number(page)); }}/><span className="muted">/ {doc?.pageCount || '—'}</span><button aria-label="下一页" disabled={!doc} onClick={() => reader.current?.go(Number(page) + 1)}>›</button></div>
          <div className="toolbar-group"><button aria-label="缩小" disabled={!doc} onClick={() => reader.current?.zoom(zoom / 1.1)}>−</button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button aria-label="放大" disabled={!doc} onClick={() => reader.current?.zoom(zoom * 1.1)}>+</button><button disabled={!doc} onClick={() => reader.current?.fit('page-width')}>适宽</button><button disabled={!doc} onClick={() => reader.current?.fit('page-fit')}>适页</button><button aria-label="旋转页面" disabled={!doc} onClick={() => reader.current?.rotate()}>↻</button></div>
          <form className="search" onSubmit={event => { event.preventDefault(); reader.current?.search(query); }}><input aria-label="全文搜索" placeholder="在文档中搜索…" disabled={!doc} value={query} onChange={event => setQuery(event.target.value)}/><button aria-label="搜索" disabled={!doc}>⌕</button><button type="button" aria-label="下一个搜索结果" disabled={!doc} onClick={() => reader.current?.search(query, true)}>↓</button></form>
        </div>
        {error && <div className="error" role="alert">{error}{pending.current && <button onClick={() => void commit(pending.current!.change, pending.current!.kind)}>重试保存</button>}{doc && <button disabled={busy} onClick={() => { clearTimeout(timer.current); pending.current = null; current.current = null; reader.current?.clear(); setDoc(null); setMarks([]); setParts([]); setHistory({ undo: [], redo: [] }); setError(''); setStatus('已关闭文档 · 已保存批注保留'); }}>关闭文档并放弃未保存更改</button>}<button aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
        {notice && <div className="notice">{notice}</div>}
        <div className="reader-stage"><div id="viewerContainer" ref={container} tabIndex={0}><div id="viewer" className="pdfViewer"/></div>
          {!doc && <div className="empty"><div className="paper-emblem" aria-hidden="true"><svg viewBox="0 0 140 100" fill="none"><path d="M70 21C50 9 25 10 12 16v64c20-7 38-6 58 4 20-10 38-11 58-4V16c-13-6-38-7-58 5Zm0 0v63M25 33l30 4M25 45l30 4M25 57l22 3M85 37l29-4M85 49l29-4M85 61l21-3"/></svg></div><span className="empty-index">A QUIETER PLACE TO READ</span><h1>让理解，<br/>留在原文旁。</h1><p>打开一本书、一篇论文，或今天的讲义。<br/>选中，标记，下次从这里继续。</p><button className="primary" disabled={busy} onClick={() => void load()}>打开 PDF <Glyph name="open"/></button><small>无需账户 · 离线可用 · 原文件保持不变</small><div className="empty-footnote"><span>01 — 阅读原文</span><span>02 — 留下思考</span><span>03 — 从这里继续</span></div></div>}
        </div>
        <footer className="statusbar"><span role="status">{status}</span><span>{doc ? `${marks.length} 条批注` : 'ENLUMOR / FOUNDATION'}</span></footer>
      </main>
      <aside className="annotations" hidden={!notesOpen}><div className="section-label">MARGINALIA / 页边思考</div><h2>批注 <span>{marks.length.toString().padStart(2, '0')}</span></h2>
        <div className="annotation-tools"><label className="color-label">颜色 <input type="color" aria-label="批注颜色" value={color} onChange={event => setColor(event.target.value)}/></label><button className="primary" disabled={!parts.length || busy || !!pending.current} onMouseDown={event => event.preventDefault()} onClick={() => add('highlight')}>高亮选区</button><button disabled={!parts.length || busy || !!pending.current} onMouseDown={event => event.preventDefault()} onClick={() => { setEditing(null); setNote(''); }}>添加便签</button></div>
        <div className="history"><button disabled={!history.undo.length || busy || !!pending.current} onClick={() => void commit(history.undo.at(-1)!, 'undo')}>撤销</button><button disabled={!history.redo.length || busy || !!pending.current} onClick={() => void commit(history.redo.at(-1)!, 'redo')}>重做</button></div>
        {parts.length > 0 && <div className="selection-preview">已选 {parts.length} 页原文<p>{parts.map(part => part.quote).join(' ').slice(0, 180)}</p></div>}
        <div className="annotation-list">{marks.map(mark => <article data-testid="annotation-item" className="annotation-card" key={mark.id} style={{ borderLeftColor: mark.color }}><button className="annotation-source" onClick={() => reader.current?.focus(mark)}><span>第 {mark.pageIndex + 1} 页 · {mark.type === 'note' ? '便签' : '高亮'}</span><p>{mark.quote || '页面便签'}</p></button>{mark.note && <p className="note-content">{mark.note}</p>}<div className="card-actions"><button disabled={busy || !!pending.current} onClick={() => void commit({ documentId: mark.documentId, upserts: [{ ...mark, color }], deletes: [] })}>应用颜色</button>{mark.type === 'note' && <button disabled={busy || !!pending.current} onClick={() => { setEditing(mark); setNote(mark.note); }}>编辑</button>}<button disabled={busy || !!pending.current} onClick={() => void commit({ documentId: mark.documentId, upserts: [], deletes: [mark.id] })}>删除</button></div></article>)}</div>
        {!marks.length && <div className="annotation-empty"><span>〰</span><p>选中一段原文<br/>留下你的第一个标记。</p><small>批注自动保存到本地工作区</small></div>}
      </aside>
    </div>
    {parts.length > 0 && doc && <div className="selection-popover" role="toolbar" aria-label="选区工具" style={selectionPosition} onMouseDown={event => event.preventDefault()}><span>{parts.length > 1 ? `${parts.length} 页选区` : '原文选区'}</span><button disabled={busy || !!pending.current} onClick={() => add('highlight')}><Glyph name="mark"/>高亮</button><button disabled={busy || !!pending.current} onClick={() => { setEditing(null); setNote(''); }}>写便签</button><button className="popover-close" aria-label="取消选区" onClick={() => { setParts([]); window.getSelection()?.removeAllRanges(); }}><Glyph name="close"/></button></div>}
    {note !== null && <div className="modal-backdrop"><form className="note-modal" onSubmit={event => { event.preventDefault(); if (editing) void commit({ documentId: editing.documentId, upserts: [{ ...editing, note }], deletes: [] }); else add('note', note); setNote(null); }}><div className="section-label">NOTE / 原文旁的想法</div><h2>{editing ? '编辑便签' : '添加便签'}</h2><textarea autoFocus aria-label="便签内容" value={note} maxLength={100000} onChange={event => setNote(event.target.value)}/><div><button type="button" onClick={() => setNote(null)}>取消</button><button className="primary" type="submit" disabled={!note.trim()}>保存便签</button></div></form></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
