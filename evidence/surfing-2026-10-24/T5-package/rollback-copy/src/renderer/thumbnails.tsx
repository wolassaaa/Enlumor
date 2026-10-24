import { useEffect, useRef } from 'react';
import type { PdfReader } from './pdf-reader';

/** Source-page previews only; persistent Enlumor marks stay in the reading viewport. */
export function ThumbnailRail({ reader, documentId, pageCount, currentPage }: { reader: PdfReader; documentId: string; pageCount: number; currentPage: number }) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rail.current!;
    const queue = new Set<HTMLButtonElement>(), visible = new Set<HTMLButtonElement>();
    let disposed = false, draining = false;
    let active: { button: HTMLButtonElement; controller: AbortController } | undefined;
    const release = (button: HTMLButtonElement) => {
      if (active?.button === button) active.controller.abort();
      const canvas = button.querySelector('canvas');
      if (canvas) { canvas.width = canvas.height = 0; canvas.remove(); }
    };
    const drain = async () => {
      if (draining || disposed) return;
      draining = true;
      try {
        while (queue.size && !disposed) {
          const button = queue.values().next().value!; queue.delete(button);
          if (!visible.has(button)) continue;
          const controller = new AbortController(); active = { button, controller };
          const preview = button.querySelector('.thumbnail-preview')!;
          const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
          preview.replaceChildren(canvas);
          try {
            const ready = await reader.drawThumbnail(Number(button.dataset.page), canvas, controller.signal);
            if (ready && !disposed && visible.has(button)) canvas.dataset.rendered = 'true';
          } catch {
            if (!controller.signal.aborted && !disposed) preview.textContent = '预览失败，点击跳转';
          } finally {
            active = undefined;
            if (disposed || !visible.has(button)) release(button);
          }
        }
      } finally { draining = false; }
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const button = entry.target as HTMLButtonElement;
        if (entry.isIntersecting) { visible.add(button); queue.add(button); }
        else { visible.delete(button); queue.delete(button); release(button); }
      }
      void drain();
    }, { root, rootMargin: '80px 0px' });
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) observer.observe(button);
    root.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
    return () => {
      disposed = true; observer.disconnect(); queue.clear(); active?.controller.abort();
      for (const button of visible) release(button);
      visible.clear();
    };
  }, [reader, documentId, pageCount]);
  return <div ref={rail} className="recent-list thumbnail-rail" role="region" aria-label="PDF 缩略图">
    {Array.from({ length: pageCount }, (_, index) => <button key={index} className="thumbnail" data-page={index + 1} aria-label={`第 ${index + 1} 页`} aria-current={currentPage === index + 1 ? 'page' : undefined} onClick={() => reader.go(index + 1)}>
      <span className="thumbnail-preview"/><span className="thumbnail-number">{index + 1}</span>
    </button>)}
  </div>;
}
