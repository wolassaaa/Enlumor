import { benchmarkLaunch } from './benchmark-launch.mjs';
import { _electron as electron, chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve('.');
const evidence = process.env.ENLUMOR_EVIDENCE_DIR || 'evidence/performance';
mkdirSync('.cache/benchmark', { recursive: true }); mkdirSync(evidence, { recursive: true });
const scanned = process.argv.includes('--scanned');
const source = path.join(root, scanned ? '.cache/benchmark/200-scanned-pages.pdf' : '.cache/benchmark/200-pages-32MiB.pdf');
if (scanned && !existsSync(source)) execFileSync(path.join(root,'.venv/Scripts/python.exe'), ['-c', `import pymupdf as f,random;d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);pix=f.Pixmap(f.csGRAY,400,400,random.Random(i).randbytes(160000),False);p.insert_image(p.rect,stream=pix.tobytes('png'))\nd.save(${JSON.stringify(source)})`]);
if (!scanned && !existsSync(source)) execFileSync(path.join(root, '.venv/Scripts/python.exe'), ['-c', `import pymupdf as f;d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence page '+str(i+1),fontsize=16);p.insert_text((48,110),'Read the original. Keep the context.',fontsize=12)\nx=d.get_new_xref();d.update_object(x,'<<>>');d.update_stream(x,b'A'*(32*1024*1024),compress=False);d.set_toc([[1,'Part One',1],[2,'Evidence',51],[1,'Part Two',101]]);d.save(${JSON.stringify(source)})`]);
const label = process.argv[2] || 'baseline';
const portable = process.argv[3] || 'release/Enlumor 0.1.1.exe';
const startup = [], portableStartup = [];
const env = { ...process.env, ENLUMOR_PYTHON: path.join(root, '.venv/Scripts/python.exe') };
let app;
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  const launch = benchmarkLaunch(process.argv[3] ? path.resolve(process.argv[3]) : undefined, root);
  app = await electron.launch({ ...launch, args: [...launch.args, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'enlumor-bench-'))}`], env });
  const page = await app.firstWindow(); await expect(page.locator('.wordmark')).toBeVisible();
  startup.push(performance.now() - start);
  if (i < 2) await app.close();
}
let scrolling, saves;
try {
  await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }); }, source);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
  await expect(page.locator('#viewer canvas').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('status')).toContainText('已恢复', { timeout: 30000 });
  await page.evaluate(async () => {
    const list = await window.enlumor.listDocuments(); const doc = list.value[0];
    const marks = Array.from({ length: 1000 }, (_, i) => ({ id: `stress-${i}`, documentId: doc.id, fingerprint: doc.fingerprint, pageIndex: i % 200, type: 'highlight', author: 'user', color: '#f4cf58', quote: `Evidence ${i}`, note: '', quads: [[48,570,200,570,48,550,200,550]] }));
    await window.enlumor.applyAnnotationChange({ documentId: doc.id, upserts: marks, deletes: [] });
  });
  // Reload through the ordinary recent-document UI so real annotation cards are mounted.
  await page.locator('.recent>button').first().click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1000, { timeout: 30000 });
  if (process.argv.includes('--thumbnails')) {
    await page.getByRole('tab',{name:'缩略图',exact:true}).click();
    // Initial image decode is setup, like the body canvas above; measured budgets remain unchanged.
    await expect(page.locator('.thumbnail-rail canvas[data-rendered="true"]').first()).toBeVisible({timeout:30000});
  }
  scrolling = await page.evaluate(async () => {
    const frames = [], tasks = [];
    const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: 'longtask', buffered: false });
    const view = document.querySelector('#viewerContainer'); let last = performance.now();
    for (let i = 0; i < 180; i++) { await new Promise(requestAnimationFrame); const now = performance.now(); frames.push(now-last); last=now; view.scrollTop = (i % 60) * 80; const rail=document.querySelector('.thumbnail-rail'); if(rail) rail.scrollTop=(i % 60)*202; }
    observer.disconnect(); frames.sort((a,b)=>a-b);
    return { frameP50Ms: frames[Math.floor(frames.length*.5)], frameP95Ms: frames[Math.floor(frames.length*.95)], longTasks: tasks.length, worstLongTaskMs: Math.max(0,...tasks), retainedCanvases: document.querySelectorAll('#viewer canvas').length, thumbnailCanvases: document.querySelectorAll('.thumbnail-rail canvas').length };
  });
  saves = await page.evaluate(async () => {
    const list = await window.enlumor.listDocuments(); const doc = list.value[0]; const times=[];
    for (let i=0;i<12;i++) { const start=performance.now(); const result=await window.enlumor.saveReadingState({ documentId:doc.id,fingerprint:doc.fingerprint,pageIndex:i,offset:.2,zoom:1,rotation:0 }); if (!result.ok) throw Error(result.error.message); times.push(performance.now()-start); }
    times.sort((a,b)=>a-b); return { p50Ms:times[6],p95Ms:times[11] };
  });
} finally { await app.close(); }
for (let i = 0; i < 3; i++) {
  const server=createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const port=server.address().port; await new Promise(resolve=>server.close(resolve));
  const start=performance.now(); const child=spawn(path.resolve(portable),[`--remote-debugging-port=${port}`,`--user-data-dir=${mkdtempSync(path.join(tmpdir(),'enlumor-start-'))}`],{ windowsHide:true,env });
  let browser;
  try {
    for(let j=0;j<180;j++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:300});break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
    if(!browser)throw Error('startup timeout'); const page=browser.contexts()[0].pages()[0]; await expect(page.locator('.wordmark')).toBeVisible();
    portableStartup.push(performance.now()-start); await page.close();
  } finally { await browser?.close(); child.kill(); }
}
const result={label,fixture:scanned ? '200 scanned image pages / approximately 32MB / 1000 annotations' : '200 pages / 32MiB unused PDF stream / 1000 annotations',startupMs:startup,portableStartupMs:portableStartup,scrolling,readingSave:saves};
writeFileSync(`${evidence}/${label}.json`,JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
