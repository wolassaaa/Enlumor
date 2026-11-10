// In-app test mode with a REAL model, on the QR-only benchmark PDFs in .cache/benchmarks.
// Costs money, so it runs only with ENLUMOR_INAPP=1 (scripts/acceptance/run-acceptance.ps1 sets it) and ENLUMOR_ACCEPTANCE_*.
import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pickDefaultModel,resolveContextWindow} from '../../src/shared/ai-models';

const root=path.resolve('.');
const here=path.join(root,'.cache/benchmarks');
const python=process.env.ENLUMOR_PYTHON||path.join(root,'.venv/Scripts/python.exe');
const enabled=process.env.ENLUMOR_INAPP==='1';
const endpoint=(process.env.ENLUMOR_ACCEPTANCE_ENDPOINT||'').trim();
const key=(process.env.ENLUMOR_ACCEPTANCE_KEY||'').trim();
const wanted=(process.env.ENLUMOR_ACCEPTANCE_MODEL||'').trim();
const protocol=process.env.ENLUMOR_ACCEPTANCE_PROTOCOL||(/anthropic\.com/.test(endpoint)?'anthropic-messages':/googleapis\.com/.test(endpoint)?'gemini':'openai-chat');
const files=(process.env.ENLUMOR_INAPP_FILES||'lumen-qr-only.pdf,attention-qr-only.pdf,attention-hard-qr-only.pdf').split(',');

for(const file of files)
test(`in-app test mode with the real model: ${file}`,async()=>{
  test.skip(!enabled,'set ENLUMOR_INAPP=1 to run (real model calls)');
  test.skip(!endpoint,'no key configured');
  test.setTimeout(30*60_000);
  const app=await electron.launch({args:[root,'--user-data-dir='+mkdtempSync(path.join(tmpdir(),'enlumor-inapp-'))],env:{...process.env,ENLUMOR_PYTHON:python,ENLUMOR_ACCEPTANCE_KEY:''}});
  try{
    const page=await app.firstWindow();
    await page.setViewportSize({width:1440,height:900});
    // Losing focus would cancel the request (known bug, see docs/STATUS.md); keep the run measurable.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].removeAllListeners('blur'));
    const draft={id:'real',name:'真实模型',protocol,endpoint,model:wanted,maxOutputTokens:Number(process.env.ENLUMOR_ACCEPTANCE_MAX_OUTPUT||2048),timeoutMs:120000,parameters:{},credential:{kind:'api-key',apiKey:key}};
    const found:any=await page.evaluate(d=>window.enlumor.discoverAiModels({draft:d as any}),draft);
    const models:{id:string;contextWindow?:number}[]=found.ok?found.value:[];
    const model=wanted||pickDefaultModel(models.map(m=>m.id))||'';
    expect(model,'model id').not.toBe('');
    const saved:any=await page.evaluate(d=>window.enlumor.saveAiProfile(d as any),{...draft,model,contextWindowTokens:resolveContextWindow(model,models.find(m=>m.id===model)?.contextWindow).tokens});
    expect(saved.ok,'profile saved').toBe(true);
    await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]});},path.join(here,file));
    await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();
    await page.getByRole('button',{name:'进入测试模式',exact:true}).click({timeout:20000});
    await page.getByLabel('确认发送全文进行测试',{exact:true}).check();
    await page.getByRole('button',{name:'开始测试',exact:true}).click();
    await expect(page.getByLabel('测试得分',{exact:true})).toBeVisible({timeout:25*60_000});
    const score=await page.getByLabel('测试得分',{exact:true}).innerText();
    const results=await page.getByLabel('测试结果',{exact:true}).innerText();
    const out=path.join(here,`in-app-${file.replace('.pdf','')}`);
    writeFileSync(out+'.txt',`模型：${model}\n${score}\n\n${results}\n`);
    await page.getByLabel('测试模式',{exact:true}).screenshot({path:out+'.png'});
    console.log(`IN_APP ${file} ${model} ${score}`);
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
});
