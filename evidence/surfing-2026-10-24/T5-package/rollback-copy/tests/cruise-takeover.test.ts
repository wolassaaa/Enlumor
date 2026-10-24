import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';

// Exercise App's real capture handlers and once-installed reader callback without
// a browser/DOM renderer or production profiling hooks.
const hooks=vi.hoisted(()=>({slots:[] as any[],cursor:0,effects:[] as (()=>unknown)[],App:null as any,selected:null as any}));
vi.mock('react',async original=>({
 ...await original<typeof import('react')>(),
 useState:(initial:any)=>{const index=hooks.cursor++;if(!hooks.slots[index]){const slot={value:typeof initial==='function'?initial():initial,set:vi.fn()};slot.set.mockImplementation(next=>{slot.value=typeof next==='function'?next(slot.value):next;});hooks.slots[index]=slot;}const slot=hooks.slots[index];return[slot.value,slot.set];},
 useRef:(initial:any)=>{const index=hooks.cursor++;return hooks.slots[index]??=( {current:initial} );},
 useEffect:(effect:()=>unknown)=>{hooks.effects.push(effect);},useLayoutEffect:()=>{},
}));
vi.mock('react-dom/client',()=>({createRoot:()=>({render:(element:any)=>{hooks.App=element.type;}})}));
vi.mock('../src/renderer/pdf-reader',()=>({PdfReader:class{constructor(_container:any,_state:any,selected:any){hooks.selected=selected;}setDrawingTool(){}}}));

function render(){hooks.cursor=0;hooks.effects=[];return hooks.App();}
function find(tree:any,predicate:(node:any)=>boolean):any{
 if(!tree||typeof tree!=='object')return;
 if(predicate(tree))return tree;
 for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}
}
function slot(value:any){return hooks.slots.find(entry=>entry?.set&&entry.value===value);}

beforeAll(async()=>{
 vi.stubGlobal('window',{innerWidth:1440,enlumor:{onFlush:()=>()=>{},getLayout:()=>new Promise(()=>{})},addEventListener:()=>{}});
 vi.stubGlobal('document',{getElementById:()=>({})});
 vi.stubGlobal('ResizeObserver',class{observe(){}});
 await import('../src/renderer/main');
});
beforeEach(()=>{hooks.slots=[];hooks.selected=null;});
afterAll(()=>vi.unstubAllGlobals());

it('closed Cruise capture notifications schedule no App state work',()=>{
 const tree=render();
 for(const className of ['topbar','library','toolbar','annotations']){
  const node=find(tree,node=>node.props?.className===className);
  expect(node?.props.onClickCapture).toBeTypeOf('function');node.props.onClickCapture();
 }
 expect(hooks.slots.filter(entry=>entry?.set).flatMap(entry=>entry.set.mock.calls)).toEqual([]);
});

it('open Cruise retains capture takeover increments',()=>{
 let tree=render();
 find(tree,node=>node.props?.['aria-label']==='打开 Cruise').props.onClick();tree=render();
 const takeover=slot(0);expect(takeover).toBeDefined();
 for(const className of ['topbar','library','toolbar','annotations'])find(tree,node=>node.props?.className===className).props.onClickCapture();
 expect(takeover.value).toBe(4);
});

it('the once-installed reader selection callback sees later open and closed state',()=>{
 render();hooks.effects[0]();const selected=hooks.selected,takeover=slot(0),open=slot(false);
 selected([{}]);expect(takeover.value).toBe(0);
 open.set(true);render();selected([{}]);expect(takeover.value).toBe(1);
 selected([]);expect(takeover.value).toBe(1);
 open.set(false);render();selected([{}]);expect(takeover.value).toBe(1);
});
