import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
test('simple provider setup defaults model, validates inline, saves and tests current draft',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'enlumor-simple-'));let calls=0;let model='';
 const server=createServer(async(req,res)=>{/* model discovery runs as soon as a service is reachable; only generation is counted */if(req.method==='GET'){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'fixture-one'},{id:'fixture-two'}]}));return;}let raw='';for await(const chunk of req)raw+=chunk;model=JSON.parse(raw).model;calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'OK'},finish_reason:'stop'}]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[path.resolve('.')]),'--user-data-dir='+folder]});
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'模型设置',exact:true}).click();
 await page.getByLabel('厂商预设',{exact:true}).selectOption({label:'DeepSeek'});
 await expect(page.getByLabel('模型 ID',{exact:true})).toHaveValue('deepseek-flash');
 await expect(page.getByLabel('协议',{exact:true})).not.toBeVisible();
 await expect(page.getByLabel('协议参数 JSON',{exact:true})).not.toBeVisible();
 await page.getByLabel('模型 ID',{exact:true}).fill('');await page.getByRole('button',{name:'保存并测试',exact:true}).click();
 await expect(page.getByText('请选择或填写模型 ID',{exact:true})).toBeVisible();expect(calls).toBe(0);
 await expect(page.getByLabel('模型 ID',{exact:true})).toBeFocused();
 await page.getByLabel('模型 ID',{exact:true}).fill('fixture-one');
 await page.getByText('高级设置',{exact:true}).click();
 await page.getByLabel('接口地址',{exact:true}).fill('http://127.0.0.1:'+(server.address() as any).port+'/v1');
 await page.getByRole('button',{name:'保存并测试',exact:true}).click();
 await expect(page.getByText('配置已保存，连接测试成功',{exact:true})).toBeVisible();expect(model).toBe('fixture-one');
 await page.getByLabel('模型 ID',{exact:true}).fill('fixture-two');await page.getByRole('button',{name:'保存并测试',exact:true}).click();
 await expect(page.getByText('配置已保存，连接测试成功',{exact:true})).toBeVisible();expect(model).toBe('fixture-two');expect(calls).toBe(2);
 await page.getByText('高级设置',{exact:true}).click();mkdirSync('evidence/settings-simplify',{recursive:true});await page.screenshot({path:'evidence/settings-simplify/settings.png'});
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('failed connection keeps saved credentials and retry uses corrected draft',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'enlumor-simple-retry-'));let fail=true;let calls=0;let authorized=false;
 const server=createServer(async(req,res)=>{/* model discovery runs as soon as a key is pasted; only generation is counted */if(req.method==='GET'){res.statusCode=fail?401:200;res.setHeader('content-type','application/json');res.end(fail?'{}':JSON.stringify({data:[{id:'fixture'}]}));return;}for await(const _ of req){}calls++;authorized=req.headers.authorization==='Bearer fixture-secret';res.setHeader('content-type','application/json');res.statusCode=fail?401:200;res.end(fail?'{}':JSON.stringify({choices:[{message:{content:'OK'},finish_reason:'stop'}]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[path.resolve('.')]),'--user-data-dir='+folder]});
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'模型设置',exact:true}).click();await page.getByText('高级设置',{exact:true}).click();
 await page.getByLabel('接口地址',{exact:true}).fill('http://127.0.0.1:'+(server.address() as any).port+'/v1');await page.getByLabel('API 密钥',{exact:true}).fill('fixture-secret');
 await page.getByRole('button',{name:'保存并测试',exact:true}).click();await expect(page.getByText('请选择或填写模型 ID',{exact:true})).toBeVisible();await expect(page.getByLabel('API 密钥',{exact:true})).toHaveValue('fixture-secret');expect(calls).toBe(0);
 await page.getByLabel('模型 ID',{exact:true}).fill('fixture');await page.getByRole('button',{name:'保存并测试',exact:true}).click();
 await expect(page.locator('.ai-settings [role="alert"]')).toContainText('密钥未填写或未通过认证');await expect(page.getByText('配置已保存；连接测试未通过，可修改后重试',{exact:true})).toBeVisible();await expect(page.getByLabel('API 密钥',{exact:true})).toHaveValue('');
 expect(authorized).toBe(true);expect(JSON.stringify(await page.evaluate(()=>window.enlumor.listAiProfiles()))).not.toContain('fixture-secret');fail=false;
 await page.getByRole('button',{name:'保存并测试',exact:true}).click();await expect(page.getByText('配置已保存，连接测试成功',{exact:true})).toBeVisible();expect(authorized).toBe(true);expect(calls).toBe(2);
 await page.setViewportSize({width:1024,height:768});await page.getByText('高级设置',{exact:true}).click();await page.screenshot({path:'evidence/settings-simplify/settings-1024.png'});
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('relay: a pasted key is enough to pick a model and its reported context window',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'enlumor-relay-'));let auth='';
 const server=createServer(async(req,res)=>{auth=String(req.headers.authorization||'');res.setHeader('content-type','application/json');if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'text-embedding-3-small'},{id:'anthropic/claude-sonnet-4',context_length:200000},{id:'qwen/qwen3-235b',context_length:131072}]}));return;}for await(const _ of req){}res.end(JSON.stringify({choices:[{message:{content:'OK'},finish_reason:'stop'}]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const app=await electron.launch({executablePath:process.env.ENLUMOR_TEST_APP,args:[...(process.env.ENLUMOR_TEST_APP?[]:[path.resolve('.')]),'--user-data-dir='+folder]});
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'模型设置',exact:true}).click();
 await page.getByLabel('厂商预设',{exact:true}).selectOption({label:'中转站 / 其他兼容接口'});
 await page.getByLabel('接口地址',{exact:true}).fill('http://127.0.0.1:'+(server.address() as any).port+'/v1');await page.getByLabel('API 密钥',{exact:true}).fill('relay-token');
 await expect(page.getByLabel('模型 ID',{exact:true})).toHaveValue('anthropic/claude-sonnet-4');expect(auth).toBe('Bearer relay-token');
 await expect(page.locator('#ai-model-help')).toContainText('已读取 3 个模型');await expect(page.locator('#ai-model-help')).toContainText('上下文窗口 200K · 服务商提供');
 await page.getByLabel('模型 ID',{exact:true}).fill('qwen/qwen3-235b');await expect(page.locator('#ai-model-help')).toContainText('上下文窗口 131K · 服务商提供');
 await page.getByRole('button',{name:'保存并测试',exact:true}).click();await expect(page.getByText('配置已保存，连接测试成功',{exact:true})).toBeVisible();
 const saved=await page.evaluate(()=>window.enlumor.listAiProfiles());expect((saved as any).value[0]).toMatchObject({model:'qwen/qwen3-235b',contextWindowTokens:131072});expect(JSON.stringify(saved)).not.toContain('relay-token');
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
