import { expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { drawPageThumbnail } from '../src/renderer/thumbnail-render';
function fixture(promise: Promise<void> = Promise.resolve(), cancel = vi.fn()) {
  const page = { cleanup: vi.fn(), getViewport: ({scale}: {scale:number}) => ({width:480*scale,height:640*scale}), render: vi.fn(() => ({promise,cancel})) };
  return {page,pdf:{getPage:async()=>page} as unknown as PDFDocumentProxy,canvas:{style:{}} as HTMLCanvasElement};
}
it('thumbnail success cleans decoded page resources, not just the output canvas', async () => {
 const {page,pdf,canvas}=fixture();
 expect(await drawPageThumbnail(pdf,1,canvas,new AbortController().signal,()=>true,2)).toBe(true);
 expect(canvas.width).toBe(240);expect(canvas.height).toBe(320);
 expect(page.cleanup).toHaveBeenCalledOnce();
});
it('cancelled thumbnail waits for render settlement then cleans resources and never reports ready', async () => {
 let reject!: (error: Error) => void;
 const pending=new Promise<void>((_,r)=>{reject=r;});
 const cancel=vi.fn(()=>reject(new Error('cancelled')));
 const {page,pdf,canvas}=fixture(pending,cancel);const controller=new AbortController();
 const result=drawPageThumbnail(pdf,1,canvas,controller.signal,()=>true,1);
 await Promise.resolve();controller.abort();
 await expect(result).rejects.toThrow('cancelled');
 expect(cancel).toHaveBeenCalledOnce();expect(page.cleanup).toHaveBeenCalledOnce();
});
it('document replacement during getPage cleans unused page without starting a render', async () => {
 const {page,pdf,canvas}=fixture();let current=true;
 const result=drawPageThumbnail(pdf,1,canvas,new AbortController().signal,()=>current,1);current=false;
 expect(await result).toBe(false);expect(page.render).not.toHaveBeenCalled();expect(page.cleanup).toHaveBeenCalledOnce();
});
