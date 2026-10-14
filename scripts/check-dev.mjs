import { createServer } from 'vite';
import { _electron as electron } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { copyAssets } from './assets.mjs';
copyAssets('public/pdf-assets');
const server = await createServer({ server: { port: 5173, host: 'localhost', strictPort: true } });
await server.listen();
let app;
try {
  app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'enlumor-dev-'))}`], env: { ...process.env, ENLUMOR_DEV_URL: 'http://localhost:5173' } });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '让理解， 留在原文旁。' }).waitFor({ timeout: 10000 });
  console.log('DEV_RENDERER: PASS');
} finally { if (app) await app.close(); await server.close(); }
