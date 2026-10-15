import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Workspace } from './workspace';
import { runPdfTask } from './python';
import type { AnnotationChange, OpenedDocument, ReadingState } from '../shared/model';

protocol.registerSchemesAsPrivileged([{ scheme: 'enlumor', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('Enlumor');
const customData = app.commandLine.getSwitchValue('user-data-dir');
if (customData) { mkdirSync(customData, { recursive: true }); app.setPath('userData', customData); }
let workspace: Workspace;
let window: BrowserWindow;
let closeReady = false, waitingClose = false;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const origin = process.env.ENLUMOR_DEV_URL || 'enlumor://app';

async function opened(id: string): Promise<OpenedDocument> {
  const doc = workspace.verified(id);
  return { ...doc, data: new Uint8Array(readFileSync(doc.path)), reading: workspace.reading(id) };
}
async function choosePdf(): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, { title: '打开 PDF', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  return result.canceled ? null : result.filePaths[0];
}

app.whenReady().then(() => {
  mkdirSync(app.getPath('userData'), { recursive: true });
  workspace = new Workspace(path.join(app.getPath('userData'), 'workspace.sqlite'));
  const rendererRoot = path.resolve(__dirname, '../renderer');
  protocol.handle('enlumor', request => {
    const url = new URL(request.url);
    const file = path.resolve(rendererRoot, '.' + decodeURIComponent(url.pathname));
    if (url.host !== 'app' || !file.startsWith(rendererRoot + path.sep)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 940, minHeight: 640, backgroundColor: '#f3f1ec', title: 'Enlumor',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const handle = (name: string, fn: (input: any) => unknown) => ipcMain.handle(name, async (event, input) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(origin + '/')) return { ok: false, error: { code: 'INVALID_SENDER', message: '无效的请求来源' } };
    try { return { ok: true, value: await fn(input) }; }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { code: /^[A-Z_]+(?=:)/.exec(message)?.[0] || 'OPERATION_FAILED', message } };
    }
  });
  handle('document:list', () => workspace.list());
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
    const result = await runPdfTask<{ path: string; annotationCount: number }>({ operation: 'export', source: doc.path, target: target.filePath, fingerprint: doc.fingerprint, annotations: workspace.annotations(id) });
    return { cancelled: false, ...result };
  });
  window.on('close', event => {
    if (closeReady) return;
    event.preventDefault();
    if (waitingClose) return;
    waitingClose = true;
    window.webContents.send('reading:flush');
    closeTimer = setTimeout(() => { waitingClose = false; dialog.showMessageBox(window, { type: 'error', message: '尚未确认保存，请重试保存后关闭。' }); }, 10000);
  });
  ipcMain.on('reading:flushed', (event, success) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !waitingClose) return;
    clearTimeout(closeTimer); waitingClose = false;
    if (success === true) { closeReady = true; window.close(); }
    else dialog.showMessageBox(window, { type: 'error', message: '保存未完成，窗口保持打开。请先处理错误或重试。' });
  });
  void window.loadURL(process.env.ENLUMOR_DEV_URL || 'enlumor://app/index.html');
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => workspace?.close());
