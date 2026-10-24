import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),folder=mkdtempSync(path.join(tmpdir(),'enlumor-navigation-')),python=path.join(root,'.venv/Scripts/python.exe'),source=path.join(folder,'three pages.pdf');
execFileSync(python,['-c',`import pymupdf as f;d=f.open();[(lambda p,i:p.insert_text((48,72),'Navigation page '+str(i)))(d.new_page(),i) for i in range(1,4)];d.save(${JSON.stringify(source)})`]);
async function launch(name:string){const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[root]),'--user-data-dir='+path.join(folder,name)],env:{...process.env,ENLUMOR_PYTHON:python}});await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();return {app,page};}
for(const mode of ['continuous','single'])test(`${mode}: boundary buttons and actual page ignore unsubmitted draft`,async()=>{
 const {app,page}=await launch(mode);try{await page.getByLabel('阅读模式',{exact:true}).selectOption(mode);const input=page.getByLabel('跳转页码',{exact:true}),prev=page.getByRole('button',{name:'上一页',exact:true}),next=page.getByRole('button',{name:'下一页',exact:true});await expect(prev).toBeDisabled();await expect(next).toBeEnabled();await input.fill('999');await next.click();await expect(input).toHaveValue('2');await input.fill('3');await input.press('Enter');await expect(input).toHaveValue('3');await expect(next).toBeDisabled();await expect(prev).toBeEnabled();await input.fill('0');await prev.click();await expect(input).toHaveValue('2');
 }finally{await app.evaluate(({app})=>app.exit(0));}
});
test('same-page viewport updates retain invalid feedback and unsubmitted draft',async()=>{
 const {app,page}=await launch('viewport');try{const input=page.getByLabel('跳转页码',{exact:true});await input.fill('999');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');
 await page.locator('#viewerContainer').evaluate(async e=>{e.scrollTop+=1;e.dispatchEvent(new Event('scroll'));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));});
 await expect(input).toHaveValue('999');await expect(input).toHaveAttribute('aria-invalid','true');await expect(page.getByText('请输入 1–3 之间的整数页码',{exact:true})).toBeVisible();
 }finally{await app.evaluate(({app})=>app.exit(0));}
});
test('invalid input stays on current page with accessible feedback; Escape resets and blur never jumps',async()=>{
 const {app,page}=await launch('validation');try{const input=page.getByLabel('跳转页码',{exact:true});await input.fill('2');await input.press('Enter');await expect(page.getByRole('button',{name:'上一页',exact:true})).toBeEnabled();
 for(const value of ['', '0','4','1.5','abc','1e0']){await input.fill(value);await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await expect(page.getByText('请输入 1–3 之间的整数页码',{exact:true})).toBeVisible();await input.press('Escape');await expect(input).toHaveValue('2');await expect(input).toHaveAttribute('aria-invalid','false');}
 await input.fill('3');await input.press('Tab');await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeEnabled();await input.press('Escape');await expect(input).toHaveValue('2');await input.fill(' 3 ');await input.press('Enter');await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();await expect(input).toHaveValue('3');
 }finally{await app.evaluate(({app})=>app.exit(0));}
});
