import{it,expect,vi,afterEach}from'vitest';
import{initialCruise,cruiseReducer,type CruiseBlock}from'../src/shared/cruise';
vi.mock('pdfjs-dist',()=>({getDocument:vi.fn(),GlobalWorkerOptions:{}}));
vi.mock('pdfjs-dist/web/pdf_viewer.mjs',()=>({EventBus:class{},PDFViewer:class{},PDFLinkService:class{},PDFFindController:class{},ScrollMode:{}}));
import{PdfReader}from'../src/renderer/pdf-reader';
import{executeReadingCommand}from'../src/renderer/reading-commands';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const block:CruiseBlock={id:'b1',documentId:'doc',fingerprint:'f',pageIndex:0,quote:'original',quads:[[1,10,20,10,1,1,20,1]]};
function harness(){
 vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>fn());
 const r:any=Object.create(PdfReader.prototype);const annotations=[{id:'keep',note:'User annotation'}];let locations=0,pauses=0;
 Object.assign(r,{active:{id:'doc',fingerprint:'f',pageCount:2},ready:true,marks:annotations,viewer:{pdfDocument:{},getPageView:()=>null},go:()=>locations++,paint:()=>{}});
 let state=cruiseReducer(initialCruise(),{type:'loaded',blocks:[block],index:0});
 const ports={showEvidence:(b:CruiseBlock)=>r.locateCruiseBlock(b),clearFocus:()=>r.clearCruiseFocus(),pause:()=>{pauses++;state=cruiseReducer(state,{type:'pause',reason:'manual'});}};
 const execute=(command:any)=>{executeReadingCommand(command,ports);};
 return{r,annotations,ports,execute,snapshot:()=>({locations,pauses,state})};
}
it('show_evidence uses reader locate once; clear and pause are local and retain permanent annotations',()=>{const h=harness();vi.stubGlobal('window',{enlumor:new Proxy({},{get:()=>{throw Error('unexpected IPC');}})});h.execute({type:'show_evidence',block});expect(h.snapshot().locations).toBe(1);expect(h.r.flash).toMatchObject({id:'b1',quote:'original'});h.execute({type:'pause_session'});expect(h.snapshot()).toMatchObject({pauses:1,state:{status:'paused',requestId:null}});h.execute({type:'clear_focus'});expect(h.r.flash).toBeUndefined();expect(h.r.marks).toEqual([{id:'keep',note:'User annotation'}]);});
it.each([null,{}, {type:'start_model'}, {type:'show_evidence'}])('rejects unknown or malformed command %j before any location',command=>{const h=harness();expect(()=>h.execute(command)).toThrow();expect(h.snapshot().locations).toBe(0);});
it.each(['document','fingerprint','not-ready','missing-pdf','invalid-page','invalid-geometry'])('reader-bound show_evidence rejects %s without locating or writing annotations',change=>{const h=harness();let b=structuredClone(block);if(change==='document')h.r.active.id='other';if(change==='fingerprint')h.r.active.fingerprint='changed';if(change==='not-ready')h.r.ready=false;if(change==='missing-pdf')h.r.viewer.pdfDocument=null;if(change==='invalid-page')b.pageIndex=2;if(change==='invalid-geometry')b.quads=[[1,2]];expect(()=>h.execute({type:'show_evidence',block:b})).toThrow();expect(h.snapshot().locations).toBe(0);expect(h.r.marks).toEqual(h.annotations);});

it.each(['not-ready','missing-pdf','invalid-page','invalid-geometry'])('locateCruiseBlock rejects %s before focus even without dispatcher',change=>{const h=harness();const b=structuredClone(block);if(change==='not-ready')h.r.ready=false;if(change==='missing-pdf')h.r.viewer.pdfDocument=null;if(change==='invalid-page')b.pageIndex=2;if(change==='invalid-geometry')b.quads=[[1,2]];expect(()=>h.r.locateCruiseBlock(b)).toThrow();expect(h.snapshot().locations).toBe(0);});
