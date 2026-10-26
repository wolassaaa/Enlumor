import {SurfingSessions} from './surfing-sessions';
import {SurfingRuntime} from './surfing-runtime';
import {measureSurfingInputTokens} from './surfing-token-worker-host';
import {openEditingWorkspace} from './editing-workspace';
import {EditingSourceService} from './editing-sources';
import {EditingIpc,registerEditingIpc} from './editing-ipc';
import{CruiseSessions}from'./cruise-sessions';
import{ExplanationRequests}from'./cruise-requests';
import { app, BrowserWindow, dialog, ipcMain, protocol, net, safeStorage } from 'electron';
import {AiProfiles} from './ai-profiles';
import {validateBenchmarkManifest} from '../shared/benchmark';
import {generateText,listAiModelInfo,listAiModels} from './ai-client';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Workspace } from './workspace';
import { runPdfTask } from './python';
import type { AnnotationChange, OpenedDocument, ReadingState } from '../shared/model';

protocol.registerSchemesAsPrivileged([{ scheme: 'enlumor', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('Enlumor');
// The editing library is the default annotation path. --legacy-editing keeps a workspace that has not been upgraded on the
// legacy path; an upgraded workspace goes back by restoring its workspace.sqlite.pre-v5.*.bak (see docs/EDITING.md).
// --editing-preview is accepted for older scripts and changes nothing.
const legacyEditing=app.commandLine.hasSwitch('legacy-editing');
const customData=app.commandLine.getSwitchValue('user-data-dir');
let editingService:EditingIpc|null=null;
if (customData) { mkdirSync(customData, { recursive: true }); app.setPath('userData', customData); }
let workspace: Workspace;
let aiProfiles:AiProfiles;
let aiFlight:AbortController|undefined;
let cruiseRequests:ExplanationRequests;
let surfingRuntime:SurfingRuntime|undefined;
let window: BrowserWindow;
let closeReady = false, waitingClose = false;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const origin = process.env.ENLUMOR_DEV_URL || 'enlumor://app';

async function opened(id: string): Promise<OpenedDocument> {
  surfingRuntime?.invalidate();
  const doc = workspace.verified(id);
  return { ...doc, data: new Uint8Array(readFileSync(doc.path)), reading: workspace.reading(id) };
}
async function choosePdf(): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, { title: '打开 PDF', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  return result.canceled ? null : result.filePaths[0];
}

app.whenReady().then(async () => {
  mkdirSync(app.getPath('userData'), { recursive: true });
  const workspaceFile=path.join(app.getPath('userData'),'workspace.sqlite');
  if(legacyEditing)workspace=new Workspace(workspaceFile,{allowEditingSchema:true});
  else {
   // Upgrading to the editing schema backs the workspace up first and changes nothing if any step fails; then the app
   // still starts, on the legacy path, rather than refusing to open the reader's documents.
   try{const opened=await openEditingWorkspace(workspaceFile);workspace=opened.workspace;editingService=new EditingIpc(workspace,opened.edits,new EditingSourceService(workspace,opened.edits,runPdfTask));}
   catch(error){console.error('Editing library unavailable, using the legacy annotation path: '+(error instanceof Error?error.message:String(error)));workspace=new Workspace(workspaceFile,{allowEditingSchema:true});}
  }
  aiProfiles=new AiProfiles(workspace.db,{available:()=>safeStorage.isEncryptionAvailable(),encrypt:text=>safeStorage.encryptString(text),decrypt:data=>safeStorage.decryptString(Buffer.from(data))});
  const rendererRoot = path.resolve(__dirname, '../renderer');
  protocol.handle('enlumor', request => {
    const url = new URL(request.url);
    const file = path.resolve(rendererRoot, '.' + decodeURIComponent(url.pathname));
    if (url.host !== 'app' || !file.startsWith(rendererRoot + path.sep)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // The brand mark for the window and taskbar: the renderer output in a build, public/ when running from source.
  if (process.platform === 'win32') app.setAppUserModelId('local.enlumor.reader');
  const iconFile = process.platform === 'win32' ? 'enlumor-icon.ico' : 'enlumor-icon.png';
  const windowIcon = [path.join(__dirname, '../renderer', iconFile), path.join(__dirname, '../../public', iconFile)].find(file => existsSync(file));
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 940, minHeight: 640, backgroundColor: '#f5f2ed', title: 'Enlumor', ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  window.on('blur',()=>{surfingRuntime?.cancel();cruiseRequests?.cancel();if(!window.webContents.isDestroyed())window.webContents.send('cruise:background');});
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const handle = (name: string, fn: (input: any) => unknown) => ipcMain.handle(name, async (event, input) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(origin + '/')) return { ok: false, error: { code: 'INVALID_SENDER', message: '无效的请求来源' } };
    try { return { ok: true, value: await fn(input) }; }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { code: /^[A-Z_]+(?=:|$)/.exec(message)?.[0] || 'OPERATION_FAILED', message } };
    }
  });
  registerEditingIpc(handle,editingService);
  surfingRuntime=new SurfingRuntime({verified:id=>workspace.verified(id),extract:(request,signal)=>runPdfTask(request,signal),renderPage:(request,signal)=>runPdfTask(request,signal),profile:id=>aiProfiles.resolve(id),profileView:id=>aiProfiles.list().find(p=>p.id===id)||null,sessions:new SurfingSessions(workspace),measureInputTokens:(profile,prompt,signal)=>measureSurfingInputTokens(profile,prompt,signal,path.join(__dirname,'surfing-token-worker.cjs')),generate:(profile,prompt,options)=>generateText(profile,prompt,{...options,stream:true,fetch:(input,init)=>net.fetch(String(input),init)}),emit:event=>{if(!window.isDestroyed())window.webContents.send('surfing:text',event);}});
  handle('surfing:progress:get',context=>surfingRuntime!.getSavedProgress(context));
  handle('surfing:progress:save',input=>surfingRuntime!.saveProgress(input));
  handle('surfing:prepare',id=>surfingRuntime!.prepare(id));
  handle('surfing:ask',input=>surfingRuntime!.ask(input));
  handle('surfing:route',input=>surfingRuntime!.route(input));
  handle('surfing:explain',input=>surfingRuntime!.explain(input));
  handle('surfing:cancel',context=>surfingRuntime!.cancel(context));
  handle('surfing:deactivate',context=>surfingRuntime!.deactivate(context));

  cruiseRequests=new ExplanationRequests(async block=>{
    const doc=workspace.verified(block.documentId);
    if(block.fingerprint!==doc.fingerprint||block.pageIndex>=doc.pageCount)throw Error('CRUISE_SOURCE_CHANGED');
    await runPdfTask({operation:'verify-block',source:doc.path,fingerprint:doc.fingerprint,block});
  },id=>aiProfiles.resolve(id),(profile,prompt,options)=>generateText(profile,prompt,{...options,stream:true,fetch:(input,init)=>net.fetch(String(input),init)}),event=>{if(!window.isDestroyed())window.webContents.send('cruise:text',event);});
  const cruiseSessions=new CruiseSessions(workspace);
  handle('cruise:session:get',id=>cruiseSessions.get(id));
  handle('cruise:session:save',session=>cruiseSessions.save(session));
  handle('cruise:start',input=>cruiseRequests.start(input));
  handle('cruise:cancel',id=>{if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))throw Error('CRUISE_INVALID_REQUEST');cruiseRequests.cancel(id);});
  handle('document:list', () => workspace.list());
  handle('ai:profiles:list',()=>aiProfiles.list());
  handle('ai:profiles:save',input=>aiProfiles.save(input));
  handle('ai:profiles:delete',id=>aiProfiles.delete(id));
  // A benchmark PDF carries its own checks; the app validates them before offering test mode.
  handle('benchmark:get',async id=>{const doc=workspace.verified(id);const raw=await runPdfTask<unknown>({operation:'benchmark-manifest',source:doc.path,fingerprint:doc.fingerprint});return raw===null?null:validateBenchmarkManifest(raw);});
  handle('ai:models:discover',input=>listAiModelInfo(aiProfiles.discoveryProfile(input?.draft,input?.savedId),{fetch:(input,init)=>net.fetch(String(input),init)}));
  handle('ai:profiles:models',id=>listAiModels(aiProfiles.resolve(id),{fetch:(input,init)=>net.fetch(String(input),init)}));
  handle('ai:profiles:test',async id=>{
    if(aiFlight)throw new Error('AI_BUSY');
    const profile=aiProfiles.resolve(id),controller=aiFlight=new AbortController();
    try{await generateText(profile,{system:'Connection test. Reply with OK only.',user:'OK'},{stream:false,signal:controller.signal,fetch:(input,init)=>net.fetch(String(input),init)});}
    finally{if(aiFlight===controller)aiFlight=undefined;}
  });
  handle('layout:get', () => workspace.layout());
  handle('layout:save', layout => workspace.saveLayout(layout));
  handle('tabs:get', () => workspace.tabs());
  handle('tabs:save', session => workspace.saveTabs(session));
  handle('document:open', async () => {
    const file = await choosePdf(); if (!file) return null;
    const meta = await runPdfTask<{ pageCount: number }>({ operation: 'inspect', source: file });
    return opened(workspace.register(file, meta.pageCount).id);
  });
  handle('document:restore', id => opened(id));
  handle('document:rebind', async id => { workspace.document(id); const file = await choosePdf(); return file ? opened(workspace.rebind(id, file).id) : null; });
  handle('annotation:list', id => { workspace.verified(id); return workspace.annotations(id); });
  handle('annotation:change', (change: AnnotationChange) => workspace.apply(change));
  handle('reading:save', (state: ReadingState) => workspace.saveReading(state));
  handle('document:export', async id => {
    const doc = workspace.verified(id);
    const target = await dialog.showSaveDialog(window, { title: '导出批注 PDF（原文件保持不变）', defaultPath: path.join(path.dirname(doc.path), `${path.basename(doc.path, '.pdf')}-enlumor.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (target.canceled || !target.filePath) return { cancelled: true };
    const result = await runPdfTask<{ path: string; annotationCount: number }>({ operation: 'export', source: doc.path, target: target.filePath, fingerprint: doc.fingerprint, annotations: editingService ? editingService.exportAnnotations(id) : workspace.annotations(id) });
    return { cancelled: false, ...result };
  });
  window.on('close', event => {
    if (closeReady) return;
    event.preventDefault();
    if (waitingClose) return;
    waitingClose = true;
    window.webContents.send('reading:flush');
    closeTimer = setTimeout(async () => {
      waitingClose = false;
      const { response } = await dialog.showMessageBox(window, { type: 'error', message: '尚未确认保存，请重试保存后关闭。', buttons: ['保持打开', '不保存并关闭'], defaultId: 0, cancelId: 0 });
      if (response === 1) { closeReady = true; window.close(); }
    }, 10000);
  });
  // A dead renderer can never acknowledge the flush; without this the window could not be closed.
  window.webContents.on('render-process-gone', () => {
    closeReady = true;
    if (waitingClose) { clearTimeout(closeTimer); waitingClose = false; window.close(); }
  });
  ipcMain.on('reading:flushed', (event, success) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !waitingClose) return;
    clearTimeout(closeTimer); waitingClose = false;
    if (success === true) { closeReady = true; window.close(); }
    else dialog.showMessageBox(window, { type: 'error', message: '保存未完成，窗口保持打开。请先处理错误或重试。' });
  });
  void window.loadURL(process.env.ENLUMOR_DEV_URL || 'enlumor://app/index.html');
}).catch(error => {
  // Without this, a startup failure leaves no window and no explanation.
  dialog.showErrorBox('Enlumor 无法启动', error instanceof Error ? error.message : String(error));
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {surfingRuntime?.invalidate();aiFlight?.abort();cruiseRequests?.cancel();editingService?.close();workspace?.close();});



