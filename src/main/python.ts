import { spawn } from 'node:child_process';
import { app } from 'electron';
import { resolvePdfCommand } from './pdf-runtime';

export function runPdfTask<T>(request: object, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error('PDF_CANCELED'));
  let command;
  try { command = resolvePdfCommand({ packaged: app.isPackaged, resources: process.resourcesPath, project: app.getAppPath(), pythonOverride: process.env.ENLUMOR_PYTHON, platform: process.platform }); }
  catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    let output = '', errors = '', settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    };
    const terminate = (error: Error) => { child.kill(); finish(error); };
    const abort = () => terminate(new Error('PDF_CANCELED'));
    const timeout = setTimeout(() => terminate(new Error('PDF_TIMEOUT: PDF 处理超时，原文件保持不变')), 120000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => { if (settled) return; output += data; if (output.length > 1024 * 1024) terminate(new Error('PDF_RESPONSE_TOO_LARGE')); });
    child.stderr.on('data', (data: string) => { if (errors.length < 8192) errors += data; });
    child.stdin.on('error', () => {});
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (settled) return;
      try {
        const result = JSON.parse(output);
        if (code !== 0 || !result.ok) throw new Error(result.error || errors || 'PDF_FAILED');
        finish(null, result.value as T);
      } catch (error) { finish(error); }
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    child.stdin.end(JSON.stringify(request));
  });
}
