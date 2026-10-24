import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePdfCommand } from '../src/main/pdf-runtime';

it('packaged worker takes precedence over absent or broken external Python paths', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'enlumor-runtime-'));
  try {
    const resources = path.join(root, 'resources');
    const exe = path.join(resources, 'pdf-worker/enlumor-pdf-worker.exe');
    mkdirSync(path.dirname(exe), { recursive: true }); writeFileSync(exe, 'fixture');
    expect(resolvePdfCommand({ packaged: true, resources, project: root, pythonOverride: 'missing-python.exe', platform: 'win32' })).toEqual({ executable: exe, args: [], bundled: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('development uses the project venv and names missing runtime only once', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'enlumor-runtime-'));
  try {
    expect(() => resolvePdfCommand({ packaged: false, resources: root, project: root, platform: 'win32' })).toThrow(/PDF_RUNTIME_MISSING/);
    const exe = path.join(root, '.venv/Scripts/python.exe'); mkdirSync(path.dirname(exe), { recursive: true }); writeFileSync(exe, 'fixture');
    expect(resolvePdfCommand({ packaged: false, resources: root, project: root, platform: 'win32' })).toEqual({ executable: exe, args: [path.join(root, 'python/export_pdf.py')], bundled: false });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
