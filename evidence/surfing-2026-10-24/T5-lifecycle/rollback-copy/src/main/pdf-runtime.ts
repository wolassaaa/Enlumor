import { existsSync } from 'node:fs';
import path from 'node:path';
type RuntimeOptions = { packaged: boolean; resources: string; project: string; pythonOverride?: string; platform: string };
export function resolvePdfCommand(options: RuntimeOptions): { executable: string; args: string[]; bundled: boolean } {
  const worker = path.join(options.resources, 'pdf-worker', options.platform === 'win32' ? 'enlumor-pdf-worker.exe' : 'enlumor-pdf-worker');
  if (options.packaged && existsSync(worker)) return { executable: worker, args: [], bundled: true };
  const python = options.pythonOverride || path.join(options.project, '.venv', options.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!existsSync(python)) throw new Error(options.packaged ? 'PDF_RUNTIME_MISSING: PDF 组件缺失，请使用完整的 Enlumor 安装包。' : 'PDF_RUNTIME_MISSING: 开发环境缺少 Python，请运行 setup.ps1。');
  return { executable: python, args: [path.join(options.packaged ? options.resources : options.project, 'python/export_pdf.py')], bundled: false };
}
