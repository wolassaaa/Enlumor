import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export function runPdfTask<T>(request: object): Promise<T> {
  const base = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
  const python = process.env.ENLUMOR_PYTHON || path.join(base, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const script = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'python/export_pdf.py');
  if (!existsSync(python)) return Promise.reject(new Error('PYTHON_MISSING: 请运行项目 setup.ps1 或设置 ENLUMOR_PYTHON 为虚拟环境 Python 路径'));
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    let output = '', errors = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('PDF_TIMEOUT: PDF 处理超时，原文件保持不变')); }, 120000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => { output += data; if (output.length > 1024 * 1024) { child.kill(); reject(new Error('PDF_RESPONSE_TOO_LARGE')); } });
    child.stderr.on('data', (data: string) => { if (errors.length < 8192) errors += data; });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => {
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
