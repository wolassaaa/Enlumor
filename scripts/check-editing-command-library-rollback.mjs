import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';

// This audit restores only an isolated copy, never the live checkout or user data.
const root = path.resolve(import.meta.dirname, '..');
const baseline = '261e483139562ec1b41c54cb3d7b24947c7e2c0d';
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' });
const tracked = git(['ls-files', '--', 'src', 'tests', 'python', 'package.json', 'package-lock.json'])
  .trim().split(/\r?\n/).filter(Boolean);
const live = tracked.map(file => ({ file, hash: sha(path.join(root, file)) }));
const artifacts = path.join(root, '.cache', 'editing-command-library-rollback');
mkdirSync(artifacts, { recursive: true });
const copy = mkdtempSync(path.join(artifacts, 'run-'));
const archive = path.join(copy, 'baseline.zip');
const tree = ['src', 'tests', 'python', 'scripts', 'package.json', 'package-lock.json',
  'vitest.config.mts', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'index.html'];
git(['archive', '--format=zip', '--output=' + archive, baseline, '--', ...tree]);
// Git Bash's tar treats a Windows drive colon as a remote host; prefer Windows bsdtar.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe') : 'tar';
execFileSync(tar, ['-xf', archive, '-C', copy], { windowsHide: true });
const originals = JSON.parse(readFileSync(path.join(root, 'evidence/editing-command-library/ORIGINALS.json'), 'utf8').replace(/^\uFEFF/, ''));
for (const entry of originals) {
  const snapshot = path.join(root, entry.snapshot);
  if (sha(snapshot) !== entry.sha256) throw Error('Corrupt original snapshot: ' + entry.path);
  copyFileSync(snapshot, path.join(copy, entry.path));
  if (sha(path.join(copy, entry.path)) !== entry.sha256) throw Error('Original hash mismatch: ' + entry.path);
}
for (const file of ['src/shared/editing-commands.ts', 'src/shared/editing-marks.ts',
  'src/shared/editing-planner.ts', 'src/main/editing-executor.ts']) {
  if (existsSync(path.join(copy, file))) throw Error('Added editing source survived rollback: ' + file);
}
const run = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', copy],
  { cwd: root, encoding: 'utf8', windowsHide: true });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.error || run.status !== 0) throw Error('Baseline rollback unit failed: ' + run.status);
for (const entry of live) {
  if (sha(path.join(root, entry.file)) !== entry.hash) throw Error('Live file changed: ' + entry.file);
}
console.log('ROLLBACK: ORIGINAL_HASHES=PASS; BASELINE_261_TESTS=PASS; EDITING_LIBRARY_ABSENT_IN_COPY=YES; LIVE_MODIFIED_FILES_UNCHANGED=YES');
