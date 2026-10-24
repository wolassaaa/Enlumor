import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve('.');
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const inspectorSocket = createServer(); await new Promise(resolve => inspectorSocket.listen(0, '127.0.0.1', resolve));
const inspectorPort = inspectorSocket.address().port; await new Promise(resolve => inspectorSocket.close(resolve));
const profile = mkdtempSync(path.join(tmpdir(), 'enlumor-portable-'));
const child = spawn(path.resolve(process.argv[2] || 'release/Enlumor 0.1.1.exe'), [`--remote-debugging-port=${port}`, `--inspect=${inspectorPort}`, `--user-data-dir=${profile}`], { windowsHide: true, env: { ...process.env, ENLUMOR_PYTHON: '', PATH: `${process.env.SystemRoot}\\System32` } });
let browser;
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 500 }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!browser) throw Error('Portable CDP startup timed out');
  const page = browser.contexts()[0].pages()[0];
  await expect(page.getByRole('heading', { name: '让理解， 留在原文旁。' })).toBeVisible();
  const reply = await page.evaluate(() => window.enlumor.listDocuments());
  if (!reply.ok || reply.value.length !== 0) throw Error('Portable workspace did not initialize');
  console.log('PORTABLE_STARTUP_SQLITE: PASS');
  const source = path.join(root, '.cache/package-check/Enlumor reading.pdf');
  const output = path.join(root, '.cache/package-check/portable-no-python.pdf');
  const original = readFileSync(source);
  // The portable wrapper does not forward Electron's stdout for _electron.launch.
  // Use its local Node inspector solely to substitute native test file dialogs.
  const targets = await (await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).json();
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Inspector fixture timeout')), 5000);
    ws.addEventListener('message', event => { const data = JSON.parse(String(event.data)); if (data.id === 1) { clearTimeout(timeout); data.result?.exceptionDetails ? reject(Error(JSON.stringify(data.result.exceptionDetails))) : resolve(data); } });
  });
  const expression = `(()=>{const {dialog}=process.mainModule.require('electron');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(source)}]});dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(output)}});return true})()`;
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression } }));
  try { await response; } finally { ws.close(); }
  await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('.textLayer span'));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.querySelector('#viewerContainer').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('button', { name: '高亮选区', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
  await page.getByRole('button', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('导出完成');
  if (!existsSync(output) || !readFileSync(source).equals(original)) throw Error('Portable output/source integrity failed');
  console.log('PORTABLE_NO_PYTHON_OPEN_EXPORT: PASS');
  await page.close();
} finally { await browser?.close(); child.kill(); }
