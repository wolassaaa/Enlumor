import { spawn } from 'node:child_process';
import { app } from 'electron';
import { resolvePdfCommand } from './pdf-runtime';

export function runPdfTask<T>(request: object): Promise<T> {
  let command;
  try { command = resolvePdfCommand({ packaged: app.isPackaged, resources: process.resourcesPath, project: app.getAppPath(), pythonOverride: process.env.ENLUMOR_PYTHON, platform: process.platform }); }
  catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    let output = '', errors = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('PDF_TIMEOUT: PDF 处理超时，原文件保持不变')); }, 120000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => { output += data; if (output.length > 1024 * 1024) { child.kill(); reject(new Error('PDF_RESPONSE_TOO_LARGE')); } });
    child.stderr.on('data', (data: string) => { if (errors.length < 8192) errors += data; });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(output);
        if (code !== 0 || !result.ok) throw new Error(result.error || errors || 'PDF_FAILED');
        resolve(result.value as T);
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
