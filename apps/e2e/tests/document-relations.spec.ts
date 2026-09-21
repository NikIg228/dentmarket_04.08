import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';import path from 'node:path';import {writeFile} from 'node:fs/promises';
test.skip(process.env.E2E_DOCUMENT_UPLOAD_LIVE!=='true','Approved isolated audit environment required');
let child:ChildProcess,counter=0;
const requests=new Map<number,{resolve(value:unknown):void;reject(error:Error):void}>();
function fixture<T>(type:string,details:Record<string,unknown>={}):Promise<T>{return new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>{requests.delete(id);reject(Error('Relations fixture IPC timeout'));},30000);requests.set(id,{resolve:v=>{clearTimeout(timer);resolve(v as T);},reject:e=>{clearTimeout(timer);reject(e);}});child.send({id,type,...details});});}
test.beforeAll(async()=>{child=spawn(process.execPath,[path.resolve('../../scripts/verify-document-relations-web.mjs')],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Relations startup timeout')),75000);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Relations fixture exited ${code}`));});child.on('message',(m:{type?:string;id?:number;value?:unknown;error?:string})=>{if(m.type==='startup-diagnostics'){console.error(JSON.stringify(m.value));return;}if(m.type==='ready'){clearTimeout(timer);resolve();return;}if(m.id){const request=requests.get(m.id);requests.delete(m.id);if(m.error)request?.reject(Error(m.error));else request?.resolve(m.value);}});});await fixture('prepare');});
test.afterAll(async()=>{if(!child||child.exitCode!==null)return;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,15000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.disconnect();});if(child.exitCode===null)child.kill();});
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus){await page.screenshot({path:info.outputPath('failure.png'),fullPage:true}).catch(()=>undefined);await writeFile(info.outputPath('failure-aria.txt'),await page.locator('body').ariaSnapshot()).catch(()=>undefined);}await page.goto('about:blank');});
type Setup={runId:string;number:string;pdf:string;orderId:string;orderNumber:string;baseId:string;baseNumber:string;foreignOrderId:string;foreignBaseId:string;handoff:object};
type Stored={id:string;supplierOrderId:string|null;baseAgreementDocumentId:string;documentNumber:string;status:string;audit:number;outbox:number}[];
for(const key of ['buyer','supplier'])test(`real ${key} selects readable document relations and persists only chosen IDs`,async({page})=>{
  await page.setViewportSize(key==='buyer'?{width:1440,height:900}:{width:390,height:844});
  const data=await fixture<Setup>('setup',{key}),port=key==='buyer'?3101:3102;
  await page.goto(`http://127.0.0.1:${port}/documents#session=${encodeURIComponent(JSON.stringify(data.handoff))}`);
  await expect(page).toHaveURL(`http://127.0.0.1:${port}/documents`);
  const trigger=page.getByRole('button',{name:'Загрузить документ',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel(/^Тип документа\s*\*?$/).selectOption('CONTRACT_ADDENDUM');
  await dialog.getByLabel(/^Название\s*\*?$/).fill('AUD072 Дополнение (тест)');await dialog.getByLabel(/^Номер\s*\*?$/).fill(data.number);
  await dialog.getByLabel('Файл PDF или DOCX',{exact:true}).setInputFiles({name:'relations.pdf',mimeType:'application/pdf',buffer:Buffer.from(data.pdf,'base64')});
  const order=dialog.getByRole('combobox',{name:'Связанный заказ',exact:true}),base=dialog.getByRole('combobox',{name:'Основной договор',exact:true}),submit=dialog.getByRole('button',{name:'Загрузить',exact:true});
  await expect(submit).toBeDisabled();await expect(order.locator('option')).toHaveCount(2);
  await expect(order.locator(`option[value="${data.orderId}"]`)).toContainText(data.orderNumber);
  await expect(base.locator(`option[value="${data.baseId}"]`)).toContainText('Рамочный договор');
  await expect(order.locator(`option[value="${data.foreignOrderId}"]`)).toHaveCount(0);await expect(base.locator(`option[value="${data.foreignBaseId}"]`)).toHaveCount(0);
  expect(await order.textContent()).not.toContain(data.orderId);expect(await base.textContent()).not.toContain(data.baseId);
  if(key==='buyer')await order.selectOption(data.orderId);else await expect(order).toHaveValue('');
  if(key==='buyer'){await base.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');}else await base.selectOption(data.baseId);
  await expect(base).toHaveValue(data.baseId);await expect(submit).toBeEnabled();
  if(key==='buyer') {
    const group=dialog.getByRole('group',{name:'Связанный заказ',exact:true});await group.getByLabel('Поиск заказа',{exact:true}).fill('nothing-found-aud072');await group.getByRole('button',{name:'Найти: Связанный заказ',exact:true}).click();await expect(group).toContainText('Ничего не найдено');await expect(order).toHaveValue(data.orderId);
    const contracts=dialog.getByRole('group',{name:'Основной договор',exact:true});
    await contracts.getByLabel('Поиск договора',{exact:true}).fill('nothing-found-aud072');await contracts.getByRole('button',{name:'Найти: Основной договор',exact:true}).click();await expect(contracts).toContainText('Ничего не найдено');await expect(base).toHaveValue(data.baseId);
    // Explicit network simulation; not evidence of a real backend failure.
    await page.route('**/documents/archive?*',route=>route.abort('failed'),{times:1});
    await contracts.getByLabel('Поиск договора',{exact:true}).fill(data.baseNumber);await contracts.getByRole('button',{name:'Найти: Основной договор',exact:true}).click();await expect(contracts.getByRole('alert')).toContainText('Повторите поиск');await expect(base).toHaveValue(data.baseId);
    await contracts.getByRole('button',{name:'Найти: Основной договор',exact:true}).click();await expect(contracts.getByRole('alert')).toHaveCount(0);await expect(contracts).toContainText('Найдено: 1');
  }
  await base.focus();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await trigger.click();await expect(base).toHaveValue(data.baseId);await expect(order).toHaveValue(key==='buyer'?data.orderId:'');
  await base.scrollIntoViewIfNeeded();await expect(dialog).toHaveCSS('opacity','1');
  expect(await dialog.locator('.dm-document-upload-form').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`${key}-document-relations.png`),animations:'disabled'});
  const response=page.waitForResponse(r=>r.url().endsWith('/documents/upload')&&r.request().method()==='POST');await submit.click();const received=await response;expect(received.status()).toBe(201);
  expect(received.request().postDataJSON()).toMatchObject({baseAgreementDocumentId:data.baseId,...(key==='buyer'?{supplierOrderId:data.orderId}:{})});
  await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();const stored=await fixture<Stored>('readback',{key});await writeFile(test.info().outputPath('relations-readback.json'),JSON.stringify({role:key,viewport:page.viewportSize(),runId:data.runId,stored},null,2));
  expect(stored).toHaveLength(1);expect(stored[0]).toMatchObject({supplierOrderId:key==='buyer'?data.orderId:null,baseAgreementDocumentId:data.baseId,documentNumber:data.number,status:'GENERATED',audit:1,outbox:1});
});
