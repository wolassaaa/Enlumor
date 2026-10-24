import type { PDFDocumentProxy } from 'pdfjs-dist';
export async function drawPageThumbnail(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, signal: AbortSignal, isCurrent: () => boolean, density: number): Promise<boolean> {
  if (signal.aborted || !isCurrent()) return false;
  const page = await pdf.getPage(pageNumber);
  try {
    if (!isCurrent() || signal.aborted) return false;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(120 / base.width, 160 / base.height) * density });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${viewport.width / density}px`; canvas.style.height = `${viewport.height / density}px`;
    const task = page.render({ canvas, viewport, annotationMode: 1 });
    const cancel = () => task.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try { await task.promise; return isCurrent() && !signal.aborted; }
    finally { signal.removeEventListener('abort', cancel); }
  } finally {
    // PDF.js defers cleanup while another render still uses this shared page.
    page.cleanup();
  }
}
