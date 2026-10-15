import { spawnSync } from 'node:child_process';
import path from 'node:path';
const python = process.env.ENLUMOR_PYTHON || path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const result = spawnSync(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--console', '--name', 'enlumor-pdf-worker', '--distpath', '.cache/pdf-worker', '--workpath', '.cache/pyinstaller-build', '--specpath', '.cache', '--collect-all', 'pymupdf', 'python/export_pdf.py'], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
