import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve('.');
const python = path.join(root, '.venv/Scripts/python.exe');
const folder = mkdtempSync(path.join(tmpdir(), 'enlumor-e2e-'));
const source = path.join(folder, '中文 reading sample.pdf');
const output = path.join(folder, 'annotated.pdf');
execFileSync(python, ['-c', `import pymupdf as f; d=f.open();\nfor i in range(200):\n p=d.new_page(width=480,height=640);p.insert_text((48,72),'Evidence for reading page '+str(i+1),fontsize=16);p.insert_text((48,105),'A second line explains the idea.',fontsize=12)\nd[0].add_text_annot((48,160),'Original note'); d.save(${JSON.stringify(source)})`]);
const hash = () => createHash('sha256').update(readFileSync(source)).digest('hex');

test('packaged app opens and exports without external Python configuration', async () => {
  const app = await electron.launch({ executablePath: path.join(root, 'release/win-unpacked/Enlumor.exe'), args: [`--user-data-dir=${path.join(folder, 'no-python')}`], env: { ...process.env, ENLUMOR_PYTHON: '', PATH: `${process.env.SystemRoot}\\System32` } });
  try {
    await app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.source] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.output });
    }, { source, output });
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await expect(page.locator('.document-name')).toContainText('中文 reading sample.pdf');
    await selectFirst(app); await page.getByRole('button', { name: '高亮选区', exact: true }).click();
    await page.getByRole('button', { name: '导出批注 PDF', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('导出完成');
  } finally { await app.close(); }
});

test('reading layout collapses panels and keeps selection tools near the text', async () => {
  const app = await launch(path.join(folder, 'layout'));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await selectFirst(app);
    await expect(page.locator('.selection-popover')).toBeVisible();
    const toolPlacement = await page.evaluate(() => ({ bottom: document.querySelector('.selection-popover')!.getBoundingClientRect().bottom, selectionTop: getSelection()!.getRangeAt(0).getBoundingClientRect().top }));
    expect(toolPlacement.bottom).toBeLessThanOrEqual(toolPlacement.selectionTop);
    await page.locator('#viewerContainer').evaluate(element => { element.scrollTop += 120; });
    await expect(page.locator('.selection-popover')).toBeHidden();
    await selectFirst(app);
    await page.getByRole('button', { name: '收起文档栏', exact: true }).click();
    await expect(page.locator('.selection-popover')).toBeHidden();
    await page.getByRole('button', { name: '收起批注栏', exact: true }).click();
    await expect(page.locator('.library')).toBeHidden();
    await expect(page.locator('.annotations')).toBeHidden();
    await page.getByRole('button', { name: '展开批注栏', exact: true }).click();
    await expect(page.locator('.annotations')).toBeVisible();
  } finally { await app.close(); }
});

async function launch(data: string, scale = 1) {
  const app = await electron.launch({ args: [root, `--user-data-dir=${data}`, `--force-device-scale-factor=${scale}`], env: { ...process.env, ENLUMOR_PYTHON: python, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' } });
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.source] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.output });
  }, { source, output });
  return app;
}

for (const scale of [1, 1.5, 2]) test(`selection stays anchored across view rotation and zoom at Windows scale ${scale}`, async () => {
  const app = await launch(path.join(folder, `scale-${scale}`), scale);
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await selectFirst(app); await page.getByRole('button', { name: '高亮选区', exact: true }).click();
    const initial = await page.evaluate(async () => { const docs = await window.enlumor.listDocuments(); if (!docs.ok) throw Error('docs'); const r = await window.enlumor.getAnnotations(docs.value[0].id); if (!r.ok) throw Error('marks'); return r.value[0].quads[0]; });
    expect(initial[0]).toBeCloseTo(48, 0); expect(initial[2]).toBeCloseTo(248.08, 0);
    for (let rotation = 0; rotation < 4; rotation++) {
      await page.getByRole('button', { name: '旋转页面', exact: true }).click();
      await page.getByRole('button', { name: '放大', exact: true }).click();
      await selectFirst(app); await page.getByRole('button', { name: '高亮选区', exact: true }).click();
      const latest = await page.evaluate(async () => { const d = await window.enlumor.listDocuments(); if (!d.ok) throw Error('docs'); const a = await window.enlumor.getAnnotations(d.value[0].id); if (!a.ok) throw Error('marks'); return a.value.at(-1)!.quads[0]; });
      latest.forEach((value, i) => expect(Math.abs(value - initial[i])).toBeLessThan(1));
    }
  } finally { await app.close(); }
});

test('failed undo retries as undo and preserves the redo action', async () => {
  const data = path.join(folder, 'undo-retry'); const app = await launch(data);
  const db = new DatabaseSync(path.join(data, 'workspace.sqlite'));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await selectFirst(app); await page.getByRole('button', { name: '高亮选区', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
    db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON annotations BEGIN SELECT RAISE(FAIL,'simulated disk write failure'); END");
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('simulated disk write failure');
    db.exec('DROP TRIGGER fail_delete');
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重做', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
  } finally { db.close(); await app.close(); }
});

test('search markup does not duplicate selected text or quads', async () => {
  const app = await launch(path.join(folder, 'search-selection'));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await page.getByLabel('全文搜索').fill('reading'); await page.getByLabel('全文搜索').press('Enter');
    await expect(page.locator('.textLayer .highlight').first()).toBeVisible();
    await selectFirst(app); await page.getByRole('button', { name: '高亮选区', exact: true }).click();
    const marks = await page.evaluate(async () => { const d = await window.enlumor.listDocuments(); if (!d.ok) throw Error('docs'); const a = await window.enlumor.getAnnotations(d.value[0].id); if (!a.ok) throw Error('marks'); return a.value; });
    expect(marks[0].quote).toBe('Evidence for reading page 1');
    expect(new Set(marks[0].quads.map(q => JSON.stringify(q))).size).toBe(marks[0].quads.length);
  } finally { await app.close(); }
});

test('cross-page multiline selection is one undo step', async () => {
  const app = await launch(path.join(folder, 'cross-page'));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await expect(page.locator('.page[data-page-number="1"] .textLayer span').first()).toBeVisible();
    await page.getByLabel('跳转页码').fill('2'); await page.getByLabel('跳转页码').press('Enter');
    await expect(page.locator('.page[data-page-number="2"] .textLayer span').first()).toBeVisible();
    await page.evaluate(() => {
      const first = document.querySelector('.page[data-page-number="1"] .textLayer span')!.firstChild!;
      const last = document.querySelector('.page[data-page-number="2"] .textLayer span')!.firstChild!;
      const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, last.textContent!.length);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.getByRole('button', { name: '高亮选区', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(2);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(2);
  } finally { await app.close(); }
});

test('cancel, corrupt, encrypted and image-only PDFs have explicit outcomes', async () => {
  const scan = path.join(folder, 'image-only.pdf'), encrypted = path.join(folder, 'locked.pdf'), corrupt = path.join(folder, 'broken.pdf');
  writeFileSync(corrupt, 'not a PDF');
  execFileSync(python, ['-c', `import pymupdf as f;d=f.open();p=d.new_page();p.draw_rect(f.Rect(20,20,100,100),color=(0,0,0));d.save(${JSON.stringify(scan)});d.save(${JSON.stringify(encrypted)},encryption=f.PDF_ENCRYPT_AES_256,user_pw='secret',owner_pw='owner')`]);
  const app = await launch(path.join(folder, 'file-errors'));
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await expect(page.locator('.empty')).toBeVisible();
    for (const [file, expected] of [[corrupt, 'PDF'], [encrypted, 'PASSWORD_REQUIRED']] as const) {
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
      await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
      await expect(page.getByRole('alert')).toContainText(expected);
    }
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, scan);
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await expect(page.locator('#viewer canvas').first()).toBeVisible();
    await expect(page.locator('.notice')).toContainText('没有文字层');
    await expect(page.getByRole('button', { name: '高亮选区', exact: true })).toBeDisabled();
  } finally { await app.close(); }
});
async function selectFirst(app: ElectronApplication) {
  const page = await app.firstWindow();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.evaluate(() => {
    const span = document.querySelector('.textLayer span')!;
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.querySelector('#viewerContainer')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: '高亮选区', exact: true })).toBeEnabled();
  const placement = await page.evaluate(() => {
    const tool = document.querySelector('.selection-popover')!.getBoundingClientRect();
    const view = document.querySelector('#viewerContainer')!.getBoundingClientRect();
    return { left: tool.left, right: tool.right, min: view.left, max: view.right };
  });
  expect(placement.left).toBeGreaterThanOrEqual(placement.min);
  expect(placement.right).toBeLessThanOrEqual(placement.max);
}

test('offline reading, selected highlight, note, undo/redo, export and crash recovery', async () => {
  const data = path.join(folder, 'profile'); const before = hash();
  let app = await launch(data); let page = await app.firstWindow();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.context().route(/^https?:\/\//, route => route.abort());
  await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
  await expect(page.getByText('中文 reading sample.pdf', { exact: true }).first()).toBeVisible();
  await selectFirst(app);
  await page.getByRole('button', { name: '高亮选区', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(0);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
  await selectFirst(app);
  await page.getByRole('button', { name: '添加便签', exact: true }).click();
  await page.getByLabel('便签内容').fill('This note persists.');
  await page.getByRole('button', { name: '保存便签', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(2);
  await page.getByLabel('全文搜索').fill('second line');
  await page.getByLabel('全文搜索').press('Enter');
  await expect(page.locator('.textLayer .highlight').first()).toBeVisible();
  await page.getByLabel('跳转页码').fill('120'); await page.getByLabel('跳转页码').press('Enter');
  await expect(page.getByLabel('跳转页码')).toHaveValue('120');
  await page.waitForTimeout(1500);
  expect(await page.locator('#viewer canvas').count()).toBeLessThan(30);
  await page.getByRole('button', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('导出完成');
  const count = execFileSync(python, ['-c', `import pymupdf as f;d=f.open(${JSON.stringify(output)});p=d[0];print(len(list(p.annots())))`], { encoding: 'utf8' }).trim();
  expect(count).toBe('3'); expect(hash()).toBe(before); expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/reader.png' });
  app.process().kill(); await new Promise(resolve => app.process().once('exit', resolve));
  app = await launch(data); page = await app.firstWindow();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(2);
  await expect(page.getByLabel('跳转页码')).toHaveValue('120');
  await app.close();
});

test('rejects replaced source and permits same-content relocation', async () => {
  const app = await launch(path.join(folder, 'identity'));
  const moved = path.join(folder, 'relocated same content.pdf');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
    await selectFirst(app);
    const bytes = readFileSync(source); writeFileSync(source, Buffer.concat([bytes, Buffer.from('\n% replaced')]));
    await page.getByRole('button', { name: '高亮选区', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('SOURCE_CHANGED');
    expect(await page.locator('[data-testid="annotation-item"]').count()).toBe(0);
    writeFileSync(source, bytes);
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
    renameSync(source, moved);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, moved);
    await page.getByRole('button', { name: '重新关联 中文 reading sample.pdf', exact: true }).click();
    // Reading state is flushed before rebind; missing source must be explicitly discarded.
    await expect(page.getByRole('alert')).toContainText('SOURCE_MISSING');
    await page.getByRole('button', { name: '关闭文档并放弃未保存更改', exact: true }).click();
    await page.getByRole('button', { name: '重新关联 中文 reading sample.pdf', exact: true }).click();
    await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
  } finally { await app.close(); if (existsSync(moved)) renameSync(moved, source); }
});
