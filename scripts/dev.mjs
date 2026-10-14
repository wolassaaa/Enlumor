import { createServer } from 'vite';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import electron from 'electron';
await build({ entryPoints: ['src/main/index.ts', 'src/main/preload.ts'], outdir: 'dist/main', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, external: ['electron'], sourcemap: true });
const server = await createServer({ server: { port: 5173, strictPort: true, host: 'localhost' } });
await server.listen();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ENLUMOR_DEV_URL: 'http://localhost:5173' }, windowsHide: true });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
