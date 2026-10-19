import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('.'), folder = mkdtempSync(path.join(tmpdir(), 'enlumor-document-commands-'));
const python = path.join(root, '.venv/Scripts/python.exe');
const source = path.join(folder, 'command source.pdf'), other = path.join(folder, 'other source.pdf'), output = path.join(folder, 'command export.pdf');
const evidence = process.env.ENLUMOR_EVIDENCE_DIR || 'evidence/document-command-task2';
mkdirSync(evidence, { recursive: true });
execFileSync(python, ['-c', `import pymupdf as f
for filename,label in ((${JSON.stringify(source)},'Command'),(${JSON.stringify(other)},'Other')):
 d=f.open()
 for i in range(3):
  p=d.new_page(width=640,height=1000)
  p.insert_text((50,70),label+' page '+str(i+1),fontsize=15)
  for x,word in ((50,'left'),(350,'right')):
   p.insert_text((x,600),'Repeated evidence',fontsize=13)
   p.insert_text((x,620),word+' context page '+str(i+1),fontsize=13)
 d.save(filename)`]);
const hash = () => createHash('sha256').update(readFileSync(source)).digest('hex');
async function launch(name: string) {
 const app = await electron.launch({ executablePath: process.env.ENLUMOR_TEST_APP, args: [...(process.env.ENLUMOR_TEST_APP ? [] : [root]), '--user-data-dir=' + path.join(folder, name)], env: { ...process.env, ENLUMOR_PYTHON: python } });
 await app.evaluate(({ dialog }, files) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.source] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.output });
 }, { source, output });
 const page = await app.firstWindow();
 await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
 await expect(page.locator('.page[data-page-number="1"] .textLayer span').first()).toBeVisible();
 return { app, page };
}
async function pageThree(page: Page) {
 const input = page.getByLabel('跳转页码', { exact: true });
 await expect(input).toHaveValue('1');
 await input.fill('3'); await input.press('Enter');
 await expect(input).toHaveValue('3');
 await expect(page.locator('.page[data-page-number="3"] .textLayer span').first()).toBeVisible();
 await page.getByRole('button', { name: '读取本页阅读块', exact: true }).click();
 await expect(page.locator('.cruise-block-list [data-block-id]')).toHaveCount(3);
 await expect(page.getByRole('button', { name: '定位阅读块 3', exact: true })).toContainText('right context page 3');
}
// Gate browser frames from the test, not a production executor/debug hook. Restore
// scheduling immediately after the click, then release the retained callbacks only
// after the real cancellation/document change has completed.
async function holdFocusFrame(page: Page) {
 await page.evaluate(() => {
  const w = window as any;
  w.__commandTestFrames = [];
  w.__commandTestRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = cb => { w.__commandTestFrames.push(cb); return -w.__commandTestFrames.length; };
 });
 await page.getByRole('button', { name: '定位阅读块 3', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
 await page.evaluate(async () => {
  // show_evidence awaits native cached page extraction before PdfReader.focus.
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const w = window as any; window.requestAnimationFrame = w.__commandTestRaf;
 });
 expect(await page.evaluate(() => (window as any).__commandTestFrames.length)).toBeGreaterThan(0);
}
async function releaseFocusFrame(page: Page) {
 await page.evaluate(async () => {
  const w = window as any, frames: FrameRequestCallback[] = w.__commandTestFrames;
  delete w.__commandTestFrames; delete w.__commandTestRaf;
  for (const callback of frames) callback(performance.now());
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
 });
}

test('manual 1 to 3 navigation resolves the right repeated passage; clear retains note undo export and source hash', async () => {
 const { app, page } = await launch('evidence'); const before = hash();
 try {
  await pageThree(page);
  await page.getByRole('button', { name: '定位阅读块 3', exact: true }).click();
  await expect(page.locator('.flash')).toHaveCount(2);
  const aligned = await page.locator('.page[data-page-number="3"] .textLayer span').filter({ hasText: 'Repeated evidence' }).nth(1).evaluate(el => {
   const r = el.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
   return [...document.querySelectorAll('.flash')].some(mark => { const b = mark.getBoundingClientRect(); return x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2; });
  });
  expect(aligned).toBe(true);
  await page.locator('.page[data-page-number="3"] .textLayer span').filter({ hasText: 'right context page 3' }).evaluate(item => {
   const range = document.createRange(); range.selectNodeContents(item);
   const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
   document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('button', { name: '添加便签', exact: true }).click();
  await page.getByLabel('便签内容').fill('Source-bound command note');
  await page.getByRole('button', { name: '保存便签', exact: true }).click();
  await expect(page.locator('.note-content')).toHaveText('Source-bound command note');
  await page.getByRole('button', { name: '定位阅读块 3', exact: true }).click();
  await expect(page.locator('.flash')).toHaveCount(2);
  await page.getByRole('button', { name: '收起阅读块', exact: true }).click();
  await expect(page.locator('.flash')).toHaveCount(0);
  await expect(page.locator('.enlumor-marks .note')).toHaveCount(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.locator('.note-content')).toHaveText('Source-bound command note');
  await page.getByRole('button', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('导出完成');
  const notes = execFileSync(python, ['-c', `import pymupdf as f,json;d=f.open(${JSON.stringify(output)});print(json.dumps([(i,a.type[0],a.info['content']) for i,p in enumerate(d) for a in (p.annots() or [])]))`], { encoding: 'utf8' }).trim();
  expect(JSON.parse(notes)).toEqual([[2, 0, 'Source-bound command note']]);
  expect(hash()).toBe(before);
  await page.screenshot({ path: path.join(evidence, 'TASK2-evidence-note-export.png') });
 } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
});

for (const takeover of ['wheel', 'pause'] as const) test(`${takeover} cancels the actual pending focus frame without late scroll or flash`, async () => {
 const { app, page } = await launch('frame-' + takeover);
 try {
  await pageThree(page); await holdFocusFrame(page);
  const position = await page.locator('#viewerContainer').evaluate((container, takeover) => {
   container.scrollTop = (container.querySelector('.page[data-page-number="3"]') as HTMLElement).offsetTop + 10;
   if (takeover === 'wheel') container.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));
   else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
   return container.scrollTop;
  }, takeover);
  await releaseFocusFrame(page);
  expect(await page.locator('#viewerContainer').evaluate(container => container.scrollTop)).toBeCloseTo(position, 0);
  await expect(page.locator('.flash')).toHaveCount(0);
  await expect(page.getByLabel('跳转页码', { exact: true })).toHaveValue('3');
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
 } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
});

test('switching documents rejects an old actual focus frame and reads only the latest source', async () => {
 const { app, page } = await launch('switch-frame');
 try {
  await pageThree(page); await holdFocusFrame(page);
  await app.evaluate(({ dialog }, other) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [other] }); }, other);
  await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
  await expect(page.locator('.document-name')).toContainText('other source.pdf');
  await expect(page.locator('.page[data-page-number="1"] .textLayer span').first()).toHaveText('Other page 1');
  const position = await page.locator('#viewerContainer').evaluate(container => container.scrollTop);
  await releaseFocusFrame(page);
  expect(await page.locator('#viewerContainer').evaluate(container => container.scrollTop)).toBeCloseTo(position, 0);
  await expect(page.getByLabel('跳转页码', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: '读取本页阅读块', exact: true }).click();
  await expect(page.locator('.cruise-block-list')).toContainText('Other page 1');
  await expect(page.locator('.cruise-block-list')).not.toContainText('Command page');
  await expect(page.locator('.flash')).toHaveCount(0);
 } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
});
