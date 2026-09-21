import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
test.skip(process.env.E2E_ORDER_DECISIONS_LIVE!=='true','Approved isolated audit environment required');
let child:ChildProcess,counter=0;
const pending=new Map<number,{resolve(value:unknown):void;reject(error:Error):void}>();
function fixture<T=unknown>(type:string,details:Record<string,unknown>={}):Promise<T>{return new Promise((resolve,reject)=>{
 const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error('Order fixture IPC timeout'));},30000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value as T);},reject:error=>{clearTimeout(timer);reject(error);}});child.send({id,type,...details});
});}
type Entry={orderId:string;itemId:string;name:string;price:string;orderNumber:string;supplierHandoff:object;buyerHandoff:object};
type Readback={status:string;version:number;total:string;items:{quantity:string;accepted:string;price:string;total:string;reason:string|null}[];available:string;reserved:string;audit:number;outbox:number};
test.beforeAll(async()=>{
 child=spawn(process.execPath,[path.resolve('../../scripts/verify-order-decisions.mjs')],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Order runtime startup timeout')),75000);
  child.once('exit',code=>{clearTimeout(timer);reject(Error(`Owned order fixture exited ${code}`));});
  child.on('message',(m:{type?:string;id?:number;value?:unknown;error?:string})=>{
   if(m.type==='startup-diagnostics'){console.error(JSON.stringify(m.value));return;}
   if(m.type==='ready'){clearTimeout(timer);resolve();return;}
   if(m.id){const request=pending.get(m.id);pending.delete(m.id);if(m.error)request?.reject(Error(m.error));else request?.resolve(m.value);}
  });
 });await fixture('prepare');
});
test.afterAll(async()=>{if(!child||child.exitCode!==null)return;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,15000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.disconnect();});if(child.exitCode===null)child.kill();});
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus)await page.screenshot({path:info.outputPath('failure.png'),fullPage:true}).catch(()=>undefined);await page.goto('about:blank');});
async function openRole(page:Page,role:'buyer'|'supplier',handoff:object){
 const origin=`http://127.0.0.1:${role==='buyer'?3101:3102}`;
 await page.goto(`${origin}/#session=${encodeURIComponent(JSON.stringify(handoff))}`);await expect(page).toHaveURL(origin+'/');
 if((page.viewportSize()?.width??1440)<650)await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Заказы',exact:true}).click();
 await expect(page.getByRole('heading',{name:role==='buyer'?'Заказы':'Заказы покупателей',exact:true})).toBeVisible();
}
const row=(page:Page,entry:Entry)=>page.getByRole('row').filter({hasText:entry.orderNumber}).first();

test('diagnostic409 focus, Escape delivery and submit-lock lifecycle',async({page})=>{
 test.skip(process.env.E2E_ORDER_DIAGNOSTIC!=='true','Explicit bounded diagnostic only');
 await page.setViewportSize({width:1440,height:900});
 const index=6,entry=await fixture<Entry>('create',{index});await openRole(page,'supplier',entry.supplierHandoff);
 const trigger=row(page,entry).getByRole('button',{name:'Проверить и подтвердить',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog'),quantity=dialog.getByRole('spinbutton',{name:`Подтверждаемое количество: ${entry.name}`,exact:true});
 await quantity.fill('1.5');await dialog.getByRole('textbox',{name:`Причина изменения: ${entry.name}`,exact:true}).fill('Диагностический сохранённый черновик');
 await page.evaluate(orderId=>{
  const describe=(node:EventTarget|null)=>{const e=node instanceof Element?node:null;return e?{tag:e.tagName,id:e.id,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:e.tagName==='BUTTON'?e.textContent?.trim():undefined,inDialog:Boolean(e.closest('[role="dialog"]'))}:null;};
  const events:unknown[]=[];
  const capture=(phase:string)=>{
   const surface=document.querySelector('[role="dialog"]'),submit=Array.from(surface?.querySelectorAll('button')??[]).find(b=>b.textContent?.includes('Подтвердить заказ')||b.textContent?.includes('Сохраняем решение'));
   type Fiber={return?:Fiber;alternate?:Fiber;memoizedProps?:{order?:{id?:string}};memoizedState?:{memoizedState:unknown;next?:Fiber['memoizedState']}};
   const host=surface??document.getElementById(`supplier-order-${orderId}`),key=host&&Object.keys(host).find(k=>k.startsWith('__reactFiber$'));
   let fiber=host&&key?(host as unknown as Record<string,Fiber>)[key]:undefined;
   while(fiber&&fiber.memoizedProps?.order?.id!==orderId)fiber=fiber.return;
   const hooks=(f:Fiber|undefined)=>{const values:unknown[]=[];let h=f?.memoizedState;for(let i=0;h&&i<9;i++,h=h.next){const v=h.memoizedState;if(typeof v==='boolean')values.push({index:i,state:v});else if(v&&typeof v==='object'&&'current'in v&&typeof v.current==='boolean')values.push({index:i,ref:v.current});}return values;};
   const result={phase,at:performance.now(),active:describe(document.activeElement),dialogPresent:Boolean(surface),submitPresent:Boolean(submit),submitDisabled:submit?.disabled,submitText:submit?.textContent?.trim(),hooks:hooks(fiber),alternateHooks:hooks(fiber?.alternate)};events.push(result);return result;
  };
  for(const type of ['focusin','focusout','keydown','keyup'])for(const useCapture of [true,false])document.addEventListener(type,event=>{if(event instanceof KeyboardEvent&&event.key!=='Escape')return;events.push({type,phase:useCapture?'capture':'bubble',at:performance.now(),target:describe(event.target),active:describe(document.activeElement),defaultPrevented:event.defaultPrevented,path:event.composedPath().filter(n=>n instanceof Element).map(n=>(n as Element).tagName+((n as Element).getAttribute('role')?`[${(n as Element).getAttribute('role')}]`:''))});},useCapture);
  let previous='';const observer=new MutationObserver(()=>{const snapshot=capture('mutation');const signature=JSON.stringify({...snapshot,at:0});if(signature===previous)events.pop();else previous=signature;});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-busy','data-state']});
  Object.assign(window,{aud06Diagnostic:{events,capture,stop:()=>observer.disconnect()}});
 },entry.orderId);
 const capture=async(phase:string)=>page.evaluate(p=>(window as unknown as {aud06Diagnostic:{capture(p:string):unknown}}).aud06Diagnostic.capture(p),phase);
 const frames=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 expect(await fixture('confirm',{index,quantity:4})).toEqual({status:201});
 await capture('before-submit');let release!:()=>void,captured!:()=>void;
 const hold=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>captured=r);
 await page.route(`**/supplier-orders/${entry.orderId}/confirm`,async route=>{captured();await hold;await route.continue();},{times:1});
 const response=page.waitForResponse(r=>r.url().endsWith(`/supplier-orders/${entry.orderId}/confirm`)&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Подтвердить заказ',exact:true}).click();await seen;await capture('submitting');release();
 expect((await response).status()).toBe(409);await expect(dialog.getByRole('alert')).toContainText('Заказ не подтверждён');await capture('after409-alert');
 await expect(dialog.getByRole('button',{name:'Подтвердить заказ',exact:true})).toBeEnabled();await frames();await capture('after409-enabled-and-frames');
 await page.keyboard.press('Escape');await frames();await capture('after-Escape');
 await page.screenshot({path:test.info().outputPath('after409-escape.png'),animations:'disabled'});
 if(await dialog.isVisible())await dialog.getByRole('button',{name:'Закрыть окно',exact:true}).click();
 await expect(dialog).toBeHidden();await capture('after-explicit-close');await trigger.click();await expect(quantity).toHaveValue('1.5');
 await capture('reopened');await quantity.focus();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await capture('after-focused-Escape');
 const events=await page.evaluate(()=>{const d=(window as unknown as {aud06Diagnostic:{events:unknown[];stop():void}}).aud06Diagnostic;d.stop();return d.events;});
 await writeFile(test.info().outputPath('focus-lifecycle.json'),JSON.stringify({orderId:entry.orderId,events},null,2));
 expect(await readback(index,'diagnostic-conflict')).toMatchObject({status:'CONFIRMED',total:'50004',audit:1,outbox:1,reserved:'4'});
});
async function readback(index:number,name:string){const data=await fixture<Readback>('readback',{index});await writeFile(test.info().outputPath(name+'.json'),JSON.stringify(data,null,2));return data;}

for(const scenario of [
 {index:1,kind:'full',quantity:'4',status:'CONFIRMED',label:'Подтверждено',total:'36028797018963972',reserved:'4',available:'6'},
 {index:2,kind:'partial',quantity:'1.5',status:'PARTIALLY_CONFIRMED',label:'Частично подтверждено',total:'18752',reserved:'1.5',available:'8.5'},
 {index:3,kind:'rejected',quantity:'0',status:'REJECTED',label:'Отклонено',total:'0',reserved:'0',available:'10'},
])test(`real ${scenario.kind} decision, pending buyer state and immutable snapshots`,async({page})=>{
 await page.setViewportSize(scenario.index===2?{width:390,height:844}:{width:1440,height:900});
 const entry=await fixture<Entry>('create',{index:scenario.index});
 await openRole(page,'buyer',entry.buyerHandoff);await expect(row(page,entry)).toContainText('Ждёт подтверждения');
 await expect(page.getByTestId(`order-decision-${entry.orderId}`)).toHaveCount(0);
 const initial=await readback(scenario.index,'pending');expect(initial.status).toBe('AWAITING_CONFIRMATION');expect(initial.items[0]!.accepted).toBe('0');expect(initial.audit).toBe(0);
 await openRole(page,'supplier',entry.supplierHandoff);const orderRow=row(page,entry);
 const trigger=orderRow.getByRole('button',{name:'Проверить и подтвердить',exact:true});await trigger.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog'),quantity=dialog.getByRole('spinbutton',{name:`Подтверждаемое количество: ${entry.name}`,exact:true});
 await expect(quantity).toHaveValue('4');await quantity.fill('');await expect(dialog.getByRole('button',{name:'Подтвердить заказ',exact:true})).toBeDisabled();
 await quantity.fill('2');const reason=dialog.getByRole('textbox',{name:`Причина изменения: ${entry.name}`,exact:true});await reason.fill('Проверка сохранения черновика');
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 await trigger.click();await expect(quantity).toHaveValue('2');await expect(reason).toHaveValue('Проверка сохранения черновика');
 await quantity.fill(scenario.quantity);if(scenario.quantity!=='4')await reason.fill('Недостаточно доступного остатка');
 if(scenario.index===1)await expect(dialog).toContainText(/360\s287\s970\s189\s639,72\s₸/);
 if(scenario.index===2)await expect(dialog).toContainText('187,52 ₸');
 if(scenario.index===3)await expect(dialog).toContainText('Все позиции отклоняются');
 await expect(dialog).toHaveCSS('opacity','1');await page.screenshot({path:test.info().outputPath(`${scenario.kind}-preview.png`),animations:'disabled'});
 let release!:()=>void,captured!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;}),seen=new Promise<void>(resolve=>{captured=resolve;});
 await page.route(`**/supplier-orders/${entry.orderId}/confirm`,async route=>{captured();await hold;await route.continue();},{times:1});
 const response=page.waitForResponse(r=>r.url().endsWith(`/supplier-orders/${entry.orderId}/confirm`)&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Подтвердить заказ',exact:true}).click();await seen;
 await expect(quantity).toBeDisabled();await expect(dialog.getByRole('button',{name:'Сохраняем решение…',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Закрыть окно',exact:true}).click();await expect(dialog).toBeVisible();
 release();expect((await response).status()).toBe(201);await expect(dialog).toBeHidden();
 await expect(orderRow).toContainText(scenario.label);await expect(page.locator(`#supplier-order-${entry.orderId}`)).toBeFocused();
 if(scenario.index===3){await expect(page.getByText('Заказ отклонён, причины переданы клинике',{exact:true})).toBeVisible();await expect(page.getByText('Заказ подтверждён полностью',{exact:true})).toHaveCount(0);}
 const persisted=await readback(scenario.index,'confirmed');expect(persisted).toMatchObject({status:scenario.status,total:scenario.total,reserved:scenario.reserved,available:scenario.available,audit:1,outbox:1});
 expect(persisted.items[0]).toMatchObject({quantity:'4',accepted:scenario.quantity,price:entry.price,total:scenario.total});
 expect(await fixture('confirm',{index:scenario.index,quantity:Number(scenario.quantity),reason:'Недостаточно доступного остатка'})).toEqual({status:201});
 expect(await readback(scenario.index,'idempotent-repeat')).toEqual(persisted);
 await openRole(page,'buyer',await fixture<object>('handoff',{capability:'BUYER'}));await expect(row(page,entry)).toContainText(scenario.label);
 const details=page.getByTestId(`order-decision-${entry.orderId}`);
 if(scenario.index===1)await expect(details).toHaveCount(0);
 else {await expect(details).toContainText('Недостаточно доступного остатка');await expect(details).toContainText(scenario.index===2?'Поставщик изменил состав заказа':'Поставщик отклонил заказ');}
});

test('real conflicting supplier decision returns 409 without losing the local draft',async({page})=>{
 const index=4,entry=await fixture<Entry>('create',{index});await openRole(page,'supplier',entry.supplierHandoff);
 const trigger=row(page,entry).getByRole('button',{name:'Проверить и подтвердить',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog'),quantity=dialog.getByRole('spinbutton',{name:`Подтверждаемое количество: ${entry.name}`,exact:true});
 await quantity.fill('1.5');await dialog.getByRole('textbox',{name:`Причина изменения: ${entry.name}`,exact:true}).fill('Мой сохранённый черновик');
 expect(await fixture('confirm',{index,quantity:4})).toEqual({status:201});
 const response=page.waitForResponse(r=>r.url().endsWith(`/supplier-orders/${entry.orderId}/confirm`)&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Подтвердить заказ',exact:true}).click();expect((await response).status()).toBe(409);
 await expect(dialog.getByRole('alert')).toContainText('Заказ не подтверждён');await expect(quantity).toHaveValue('1.5');
 await expect(dialog.getByRole('group',{name:'Ошибка подтверждения заказа',exact:true})).toBeFocused();
 await expect(dialog.getByRole('button',{name:'Подтвердить заказ',exact:true})).toBeEnabled();
 await expect(page.getByText('Заказ подтверждён полностью',{exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 await trigger.click();await expect(quantity).toHaveValue('1.5');
 await expect(dialog.getByRole('textbox',{name:`Причина изменения: ${entry.name}`,exact:true})).toHaveValue('Мой сохранённый черновик');
 await expect(dialog).toHaveCSS('opacity','1');
 await page.screenshot({path:test.info().outputPath('actual-409-preserved-draft.png'),animations:'disabled'});
 await dialog.getByRole('button',{name:'Закрыть окно',exact:true}).click();await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 expect(await readback(index,'conflict')).toMatchObject({status:'CONFIRMED',total:'50004',audit:1,outbox:1,reserved:'4'});
});

test('explicitly simulated new snapshot blocks stale draft until an explicit restart',async({page})=>{
 const index=5,entry=await fixture<Entry>('create',{index});await openRole(page,'supplier',entry.supplierHandoff);
 const trigger=row(page,entry).getByRole('button',{name:'Проверить и подтвердить',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog'),quantity=dialog.getByRole('spinbutton',{name:`Подтверждаемое количество: ${entry.name}`,exact:true});
 await quantity.fill('2');await dialog.getByRole('textbox',{name:`Причина изменения: ${entry.name}`,exact:true}).fill('Черновик старой версии');await page.keyboard.press('Escape');
 await page.route('**/supplier-orders',async route=>{const response=await route.fetch();const rows=await response.json();await route.fulfill({response,json:rows.map((order:{id:string;version:number})=>order.id===entry.orderId?{...order,version:order.version+1}:order)});},{times:1});
 await page.getByRole('button',{name:'Обновить данные',exact:true}).click();await expect(page.getByRole('button',{name:'Обновить данные',exact:true})).toBeEnabled();
 await trigger.click();await expect(dialog).toContainText('Заказ обновился');await expect(quantity).toHaveValue('2');await expect(quantity).toBeDisabled();await expect(dialog.getByRole('button',{name:'Подтвердить заказ',exact:true})).toBeDisabled();
 await expect(dialog).toHaveCSS('opacity','1');await page.screenshot({path:test.info().outputPath('simulated-new-snapshot-stale-draft.png'),animations:'disabled'});
 await dialog.getByRole('button',{name:'Начать заново по актуальному заказу',exact:true}).click();await expect(quantity).toHaveValue('4');await expect(quantity).toBeEnabled();
 await expect(dialog).not.toContainText('Заказ обновился');await expect(dialog.getByRole('button',{name:'Подтвердить заказ',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Закрыть окно',exact:true}).click();await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 expect(await readback(index,'simulated-snapshot-no-write')).toMatchObject({status:'AWAITING_CONFIRMATION',version:1,audit:0,outbox:0});
});
