import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
test.skip(process.env.E2E_CATALOG_POLISH_LIVE !== 'true','Explicit approved audit DB/runtime required');
let child: ChildProcess, counter=0;
const pending=new Map<number,{resolve(value:unknown):void;reject(error:Error):void}>();
function fixture<T=unknown>(type:string):Promise<T>{return new Promise((resolve,reject)=>{
 const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error('Owned catalog IPC timeout'));},30000);
 pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v as T);},reject:e=>{clearTimeout(timer);reject(e);}});child.send({id,type});
});}
type Data={keyword:string;categoryId:string;categoryName:string;productId:string;offerId:string;legacyProductName:string;unit:string;runId:string;handoff:object;buyerHandoff:object;publicPage:object};
let data:Data;
test.beforeAll(async()=>{
 child=spawn(process.execPath,[path.resolve('../../scripts/verify-catalog-polish.mjs')],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Catalog runtime startup timeout')),75000);
  child.once('exit',code=>{clearTimeout(timer);reject(Error(`Owned catalog fixture exited ${code}`));});
  child.on('message',(m:{type?:string;id?:number;value?:unknown;error?:string})=>{
   if(m.type==='startup-diagnostics'){console.error(JSON.stringify(m.value));return;}
   if(m.type==='ready'){clearTimeout(timer);resolve();return;}
   if(m.id){const request=pending.get(m.id);pending.delete(m.id);if(m.error)request?.reject(Error(m.error));else request?.resolve(m.value);}
  });
 });
 data=await fixture<Data>('prepare');
});
test.afterAll(async()=>{
 if(!child||child.exitCode!==null)return;
 await new Promise<void>(resolve=>{const timer=setTimeout(resolve,15000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.disconnect();});
 if(child.exitCode===null)child.kill();
});
test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus)await page.screenshot({path:info.outputPath('failure.png'),fullPage:true}).catch(()=>undefined);
 await page.goto('about:blank');
});
const cards=(page:Page)=>page.getByTestId('product-card');
async function openCatalog(page:Page,suffix=''){
 await page.goto(`http://127.0.0.1:3101/catalog?q=${data.keyword}&sort=NAME_ASC${suffix}`);
 await expect(cards(page).first()).toBeVisible();
}
async function search(page:Page,value:string){const input=page.getByRole('textbox',{name:'Поиск по каталогу',exact:true});await input.fill(value);await input.press('Enter');}

test('unified catalog restores its loaded window and filters after product navigation',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await openCatalog(page,'&inStock=true&categoryId='+data.categoryId);
 await expect(cards(page)).toHaveCount(24);
 const firstIds=await cards(page).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-product-id')));
 await page.getByRole('link',{name:/Показать ещё/}).click();
 await expect(cards(page)).toHaveCount(26);await expect(page).toHaveURL(/count=26/);
 const ids=await cards(page).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-product-id')));
 expect(new Set(ids).size).toBe(26);expect(ids.slice(0,24)).toEqual(firstIds);
 await expect(page.getByRole('link',{name:/Показать ещё/})).toHaveCount(0);
 const returnUrl=page.url();await cards(page).first().getByRole('link',{name:/Открыть карточку/}).click();await expect(page).toHaveURL(/\/products\//);
 await page.getByRole('link',{name:'← Вернуться в каталог',exact:true}).click();await expect(cards(page)).toHaveCount(26);await expect(page).toHaveURL(returnUrl);
 await page.reload();await expect(cards(page)).toHaveCount(26);
 await page.getByRole('combobox',{name:'Сортировка каталога'}).selectOption('PRICE_ASC');
 await expect(cards(page)).toHaveCount(24);await expect(page).not.toHaveURL(/count=/);
 await search(page,'auditmissingnone'+data.keyword);await expect(page.getByText('Ничего не найдено',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Сбросить всё',exact:true}).click();
 await expect(page).not.toHaveURL(/categoryId=|inStock=/);
 await expect(page.getByRole('textbox',{name:'Поиск по каталогу'})).toHaveValue('auditmissingnone'+data.keyword);
 await page.screenshot({path:test.info().outputPath('catalog-restored-desktop-1440.png'),fullPage:true});
});

test('same offer package and unit prices survive product detail and keyboard comparison',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await openCatalog(page);
 const card=page.locator(`[data-testid="product-card"][data-product-id="${data.productId}"]`);
 await expect(card).toContainText(/1\s234,5\s₸/);await expect(card).toContainText(/123,45\s₸/);await expect(card).toContainText('AUD05 Коробка 10');
 await card.getByRole('link',{name:/Открыть карточку/}).click();
 await expect(page).toHaveURL(new RegExp(`/products/${data.productId}\\?returnTo=`));
 await expect(page.getByText(/1\s234,5\s₸ за упаковку/)).toBeVisible();
 const compare=page.getByRole('button',{name:'Сравнить и заказать'});await compare.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText(/123,45\s₸/);await expect(dialog).toContainText('В корзину добавляется 1 единица продажи (10');
 // A screenshot during Fluent's opening fade does not prove a transparent dialog.
 await expect(dialog).toHaveCSS('opacity','1');
 await expect(dialog).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.screenshot({path:test.info().outputPath('product-package-comparison-desktop-1440.png'),animations:'disabled'});
 await page.keyboard.press('Escape');await expect(compare).toBeFocused();
 await writeFile(test.info().outputPath('real-api-catalog-page.json'),JSON.stringify(data.publicPage,null,2));
});

test('mobile real pagination and explicitly simulated HTTP failure preserve request for retry',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openCatalog(page);
 await expect(cards(page)).toHaveCount(24);
 await page.getByRole('link',{name:/Показать ещё/}).click();await expect(cards(page)).toHaveCount(26);
 await page.route('**/catalog-search?**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"simulated"}'}),{times:1});
 await page.reload();
 await expect(page.getByText('Каталог временно недоступен. Запрос и фильтры сохранены — повторите загрузку.',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Поиск по каталогу'})).toHaveValue(data.keyword);await expect(cards(page)).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('catalog-simulated-error-mobile-390.png'),fullPage:true});
 await page.getByRole('button',{name:'Повторить',exact:true}).first().click();await expect(cards(page)).toHaveCount(26);
 await expect(page.getByRole('link',{name:/Показать ещё/})).toHaveCount(0);
});

test('delayed old request cannot overwrite a newer real result (transport scheduling simulated)',async({page})=>{
 await openCatalog(page);
 let release!:()=>void, captured!:()=>void, done!:()=>void;
 const hold=new Promise<void>(r=>{release=r;}), seen=new Promise<void>(r=>{captured=r;}), finished=new Promise<void>(r=>{done=r;});
 await page.route('**/catalog-search?**',async route=>{
  if(new URL(route.request().url()).searchParams.get('sort')!=='PRICE_ASC'){await route.continue();return;}
  const response=await route.fetch();captured();await hold;await route.fulfill({response}).catch(()=>undefined);done();
 });
 await page.getByRole('combobox',{name:'Сортировка каталога'}).selectOption('PRICE_ASC');await seen;
 await page.getByRole('combobox',{name:'Сортировка каталога'}).selectOption('NAME_ASC');await expect(cards(page)).toHaveCount(24);await expect(cards(page).first()).toContainText('Материал 00');
 release();await finished;await expect(cards(page)).toHaveCount(24);await expect(cards(page).first()).toContainText('Материал 00');
});

test('supplier JWT offer view explains actual sale-unit fallback for a published offer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto(`http://127.0.0.1:3102/#session=${encodeURIComponent(JSON.stringify(data.handoff))}`);
 await expect(page).toHaveURL('http://127.0.0.1:3102/');
 await page.getByRole('button',{name:'Предложения',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:data.legacyProductName});
 await expect(row).toContainText('отдельная фасовка не назначена');await expect(row).not.toContainText('перед публикацией');
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('supplier-packaging-desktop-1440.png')});
 await page.setViewportSize({width:390,height:844});await expect(row).toContainText('в единице продажи');
});

test('buyer JWT catalog shows a sale-unit price with its own packaging, and stored prices unchanged',async({page})=>{
 await page.goto(`http://127.0.0.1:3101/#session=${encodeURIComponent(JSON.stringify(data.buyerHandoff))}`);
 await expect(page).toHaveURL('http://127.0.0.1:3101/');
 const query=data.keyword+' Материал 00';
 const result=page.waitForResponse(response=>response.url().includes('/marketplace/search?')&&new URL(response.url()).searchParams.get('q')===query);
 await page.getByRole('textbox',{name:'Поиск по каталогу',exact:true}).fill(query);
 await page.getByRole('button',{name:'Найти',exact:true}).click();
 const response=await result;expect(response.status()).toBe(200);
 const card=page.locator(`[data-testid="product-card"][data-product-id="${data.productId}"]`);
 await expect(card).toContainText(/1\s234,5\s₸ за упаковку/);await expect(card).toContainText('AUD05 Коробка 10');
 await expect(card).toContainText(/123,45\s₸/);
 const readback=await fixture<{products:number;offers:number;prices:{offerId:string;amountMinor:string}[]}>('readback');
 expect(readback.products).toBe(26);expect(readback.offers).toBe(26);expect(readback.prices.find(p=>p.offerId===data.offerId)?.amountMinor).toBe('123450');
 await page.screenshot({path:test.info().outputPath('buyer-catalog-package-desktop.png')});
 await writeFile(test.info().outputPath('actual-authenticated-search.json'),JSON.stringify(await response.json(),null,2));
 await writeFile(test.info().outputPath('actual-db-price-readback.json'),JSON.stringify(readback,null,2));
});
