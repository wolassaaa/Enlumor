import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await build({ entryPoints: ['src/main/index.ts', 'src/main/preload.ts'], outdir: 'dist/main', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, external: ['electron'], sourcemap: true });
await viteBuild();
