import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared/model';
const bridge: Bridge = {
  openDocument: () => ipcRenderer.invoke('document:open'),
  restoreDocument: id => ipcRenderer.invoke('document:restore', id),
  rebindDocument: id => ipcRenderer.invoke('document:rebind', id),
  listDocuments: () => ipcRenderer.invoke('document:list'),
  getAnnotations: id => ipcRenderer.invoke('annotation:list', id),
  applyAnnotationChange: change => ipcRenderer.invoke('annotation:change', change),
  saveReadingState: state => ipcRenderer.invoke('reading:save', state),
  exportAnnotatedPdf: id => ipcRenderer.invoke('document:export', id),
  onFlush: handler => {
    const listener = async () => { try { await handler(); ipcRenderer.send('reading:flushed', true); } catch { ipcRenderer.send('reading:flushed', false); } };
    ipcRenderer.on('reading:flush', listener);
    return () => ipcRenderer.removeListener('reading:flush', listener);
  },
};
contextBridge.exposeInMainWorld('enlumor', bridge);
