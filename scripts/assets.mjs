import { cpSync, mkdirSync } from 'node:fs';
export function copyAssets(destination) {
  mkdirSync(destination, { recursive: true });
  for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) cpSync(`node_modules/pdfjs-dist/${folder}`, `${destination}/${folder}`, { recursive: true });
  cpSync('node_modules/pdfjs-dist/web/images', `${destination}/images`, { recursive: true });
}
