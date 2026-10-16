import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, cpSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertPerformance } from './performance-gate.mjs';
const root = path.resolve('.');
const { version } = JSON.parse(readFileSync('package.json','utf8'));
const stage = path.join(root,'.cache',`release-${version}-${Date.now()}`);
mkdirSync(stage,{recursive:true});
const run = (file,args,env={}) => execFileSync(file,args,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,...env}});
const npmCli = process.env.npm_execpath;
if (!npmCli) throw Error('Run npm run release:verified');
const task = name => run(process.execPath,[npmCli,'run',name]);
task('build'); task('test'); task('test:python'); task('build:worker');
run(process.execPath,['node_modules/electron-builder/cli.js','--win','zip',`--config.directories.output=${stage}`]);
const exe=path.join(stage,'win-unpacked/Enlumor.exe');
const evidence = process.env.ENLUMOR_EVIDENCE_DIR || `evidence/releases/${version}`;
mkdirSync(evidence,{recursive:true});
const env={ENLUMOR_TEST_APP:exe,ENLUMOR_EVIDENCE_DIR:evidence};
run(process.execPath,['node_modules/@playwright/test/cli.js','test'],env);
run(process.execPath,['scripts/check-package.mjs'],env);
run(process.execPath,['scripts/check-portable.mjs',exe]);
for (const [label,flags] of [['release',['--thumbnails']],['scanned',['--thumbnails','--scanned']]]) {
  run(process.execPath,['scripts/benchmark.mjs',label,exe,...flags],env);
  assertPerformance(JSON.parse(readFileSync(path.join(evidence,`${label}.json`),'utf8')));
}
const zip=path.join(stage,`Enlumor-${version}-win.zip`);
if(!existsSync(zip)) throw Error(`Missing ${zip}`);
const destination=path.join(root,'release',`Enlumor-${version}-win-x64`);
const zipDestination=path.join(root,'release',`Enlumor-${version}-win.zip`);
if(existsSync(destination)||existsSync(zipDestination)) throw Error('Version already released; increment package version');
// Publish only after functional and performance gates; failed gates leave latest untouched.
cpSync(path.join(stage,'win-unpacked'),destination,{recursive:true,errorOnExist:true,force:false});
copyFileSync(zip,zipDestination);
const sha256=createHash('sha256').update(readFileSync(zipDestination)).digest('hex');
writeFileSync('release/latest.json.tmp',JSON.stringify({version,exe:path.relative(path.join(root,'release'),path.join(destination,'Enlumor.exe')),zip:path.basename(zipDestination),sha256},null,2));
renameSync('release/latest.json.tmp','release/latest.json');
console.log(`VERIFIED_RELEASE: ${version} ${zipDestination} SHA256=${sha256}`);
