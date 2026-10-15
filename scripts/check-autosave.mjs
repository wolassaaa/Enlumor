import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
const source = path.resolve(process.argv[2] || 'src/main/workspace.ts');
const expected = Number(process.argv[3] || 0);
mkdirSync('.cache/autosave-check',{recursive:true});
const folder=mkdtempSync(path.resolve('.cache/autosave-check/run-'));
const out=path.join(folder,'workspace.cjs');
await build({entryPoints:[path.resolve('src/main/workspace.ts')],outfile:out,bundle:true,platform:'node',format:'cjs',plugins:[{name:'preserved-source',setup(build){build.onLoad({filter:/workspace\.ts$/},()=>({contents:readFileSync(source,'utf8'),loader:'ts',resolveDir:path.resolve('src/main')}));}}]});
const require=createRequire(import.meta.url), fs=require('node:fs');
const {Workspace}=require(out);
const file=path.join(folder,'source.pdf');writeFileSync(file,Buffer.alloc(8*1024*1024,65));
const workspace=new Workspace(path.join(folder,'state.sqlite'));
let reads=0;const actual=fs.readFileSync;
try {
 const doc=workspace.register(file,200);workspace.verified(doc.id);
 fs.readFileSync=(target,...args)=>{if(target===file)reads++;return actual(target,...args)};
 for(let i=0;i<20;i++)workspace.saveReading({documentId:doc.id,fingerprint:doc.fingerprint,pageIndex:i,offset:.2,zoom:1,rotation:0});
 console.log(`AUTOSAVE_FULL_READS=${reads}; LAST_PAGE=${workspace.reading(doc.id).pageIndex}; EXPECTED=${expected}`);
 if(reads!==expected)process.exitCode=1;
} finally {fs.readFileSync=actual;workspace.close();}
