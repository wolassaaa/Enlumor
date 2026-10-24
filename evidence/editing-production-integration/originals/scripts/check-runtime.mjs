import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const root = path.resolve('.'), folder = path.join(root, '.cache/runtime-proof');
const source = path.join(root, '.cache/utf8-check/中文.pdf');
if (!existsSync(source)) {
  mkdirSync(path.dirname(source), { recursive: true });
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  execFileSync(python, ['-c', `import pymupdf as f;d=f.open();d.new_page();d.save(${JSON.stringify(source)});d.close()`]);
}
const resources = path.join(folder, 'resources');
mkdirSync(resources, { recursive: true });
const worker = path.join(resources, 'pdf-worker');
if (!existsSync(worker)) cpSync(path.join(root, '.cache/pdf-worker/enlumor-pdf-worker'), worker, { recursive: true });
const stub = path.join(folder, 'electron-fixture.cjs');
writeFileSync(stub, `exports.app={isPackaged:true,getAppPath:()=>${JSON.stringify(root)},getPath:()=>${JSON.stringify(path.join(folder, 'extracted/Enlumor.exe'))}};`);
Object.defineProperty(process, 'resourcesPath', { value: resources, configurable: true });
const output = path.join(folder, 'runner.cjs');
await build({ entryPoints: [path.resolve(process.argv[2] || 'src/main/python.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', alias: { electron: stub }, logLevel: 'silent' });
delete process.env.ENLUMOR_PYTHON; process.env.PATH = `${process.env.SystemRoot}\\System32`;
try {
  const result = await createRequire(import.meta.url)(output).runPdfTask({ operation: 'inspect', source });
  if (result.pageCount !== 1) throw Error('INVALID_RESULT');
  console.log('PDF_RUNTIME: PASS');
} catch (error) { console.log(`PDF_RUNTIME: ${error.message.split(':')[0]}`); process.exitCode = 1; }
