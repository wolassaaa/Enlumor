import { spawn } from 'node:child_process';
import path from 'node:path';
const python = process.env.ENLUMOR_PYTHON || path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const child = spawn(python, process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
child.on('error', e => { console.error(e.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
