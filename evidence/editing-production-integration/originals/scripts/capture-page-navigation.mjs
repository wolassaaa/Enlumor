import {_electron as electron,expect} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),folder=mkdtempSync(path.join(tmpdir(),'enlumor-navigation-capture-')),source=path.join(folder,'navigation.pdf');
execFileSync(path.join(root,'.venv/Scripts/python.exe'),['-c',`import pymupdf as f;d=f.open();[(lambda p,i:p.insert_text((48,72),'Navigation page '+str(i),fontsize=18))(d.new_page(),i) for i in range(1,4)];d.save(${JSON.stringify(source)})`]);
const app=await electron.launch({executablePath:path.join(root,'release/Enlumor-0.1.11-win-x64/Enlumor.exe'),args:['--user-data-dir='+path.join(folder,'profile')]});
try{
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 const page=await app.firstWindow();await page.getByRole('button',{name:'打开 PDF',exact:true}).first().click();await expect(page.locator('.textLayer span').first()).toBeVisible();await expect(page.getByRole('button',{name:'上一页',exact:true})).toBeDisabled();
 await page.screenshot({path:'evidence/page-navigation/first-page.png'});
 const input=page.getByLabel('跳转页码',{exact:true});await input.fill('999');await input.press('Enter');await expect(page.getByText('请输入 1–3 之间的整数页码',{exact:true})).toBeVisible();
 await page.screenshot({path:'evidence/page-navigation/invalid-page.png'});
 await input.press('Escape');await expect(input).toHaveValue('1');await input.fill('3');await input.press('Enter');await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();await page.screenshot({path:'evidence/page-navigation/last-page.png'});
 console.log('NAVIGATION_CAPTURE: FIRST_DISABLED=YES; INVALID_FEEDBACK=YES; ESC_RESTORES=YES; LAST_DISABLED=YES');
}finally{await app.close();}
