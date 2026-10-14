import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve('.');
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const profile = mkdtempSync(path.join(tmpdir(), 'enlumor-portable-'));
const child = spawn(path.join(root, 'release/Enlumor 0.1.0.exe'), [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { windowsHide: true, env: { ...process.env, ENLUMOR_PYTHON: path.join(root, '.venv/Scripts/python.exe') } });
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
  await page.close();
} finally { await browser?.close(); child.kill(); }
