import { _electron as electron, chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve('.'), python = path.join(root, '.venv/Scripts/python.exe');
const folder = path.join(root, '.cache/package-check'); mkdirSync(folder, { recursive: true });
const source = path.join(folder, 'Enlumor reading.pdf'), output = path.join(folder, 'Enlumor annotated.pdf');
execFileSync(python, ['-c', `import pymupdf as f;d=f.open();p=d.new_page(width=480,height=640);p.insert_text((45,55),'ENLUMOR / READING NOTES',fontsize=11,color=(.25,.4,.3));p.insert_text((45,110),'A quieter place to read.',fontsize=24);p.insert_text((45,165),'Understanding stays beside the original.',fontsize=15);p.insert_text((45,200),'Select a passage. Keep a thought. Return tomorrow.',fontsize=12);p.insert_text((45,280),'01 / Evidence before explanation',fontsize=17);p.insert_text((45,320),'A useful reading tool preserves both context and progress.',fontsize=11);p.insert_text((45,345),'Highlights point back to the text, not away from it.',fontsize=11);p.add_text_annot((45,380),'This note belongs to the original PDF.');d.save(${JSON.stringify(source)})`]);
const app = await electron.launch({ executablePath: path.resolve(process.env.ENLUMOR_TEST_APP || 'release/win-unpacked/Enlumor.exe'), args: [`--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'enlumor-package-'))}`], env: { ...process.env, ENLUMOR_PYTHON: '', PATH: `${process.env.SystemRoot}\\System32` } });
try {
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.source] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.output });
  }, { source, output });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '打开 PDF', exact: true }).first().click();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.textLayer span')].find(span => span.textContent === 'Understanding stays beside the original.') || document.querySelector('.textLayer span');
    const range = document.createRange(); range.selectNodeContents(item);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.querySelector('#viewerContainer').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('.selection-popover')).toBeVisible();
  await page.locator('.selection-popover').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  mkdirSync((process.env.ENLUMOR_EVIDENCE_DIR || 'evidence/ui-runtime'), { recursive: true });
  await page.screenshot({ path: (process.env.ENLUMOR_EVIDENCE_DIR || 'evidence/ui-runtime') + '/selection.png' });
  await page.getByRole('button', { name: '高亮选区', exact: true }).click();
  await expect(page.locator('[data-testid="annotation-item"]')).toHaveCount(1);
  await page.getByRole('button', { name: '适宽', exact: true }).click();
  await page.getByRole('button', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('导出完成');
  mkdirSync('evidence', { recursive: true });
  await page.screenshot({ path: (process.env.ENLUMOR_EVIDENCE_DIR || 'evidence/ui-runtime') + '/reader.png' });
  console.log('PACKAGED_READER: PASS');
  console.log(JSON.stringify(await app.evaluate(({ app }) => ({ packaged: app.isPackaged, electron: process.versions.electron, node: process.versions.node, sqlite: process.versions.sqlite }))));
} finally { await app.close(); }

const edge = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await edge.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(pathToFileURL(output).href);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: (process.env.ENLUMOR_EVIDENCE_DIR || 'evidence/ui-runtime') + '/edge-export.png' });
  console.log('EDGE_PDF_OPEN: PASS (visual screenshot requires inspection)');
} finally { await edge.close(); }
