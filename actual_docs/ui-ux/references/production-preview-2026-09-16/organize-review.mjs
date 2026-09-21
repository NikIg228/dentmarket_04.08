// Reproducible review packaging only; no app imports, servers, installs or API/DB calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = path.join(root, 'review');
const checkOnly = process.argv.includes('--check');
assert(process.argv.slice(2).every(arg => arg === '--check'), 'Use no arguments or --check');
const read = name => fs.readFile(path.join(root, name));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const slash = value => value.split(path.sep).join('/');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pending = 'Ожидает утверждения';
const roleNames = {public:'Публичное', buyer:'Покупатель', supplier:'Поставщик', admin:'Оператор', auth:'Авторизация'};
const categories = [
  ['01-публичные-страницы', 'Публичные страницы'],
  ['02-покупатель', 'Покупатель'],
  ['03-поставщик', 'Поставщик'],
  ['04-оператор', 'Оператор'],
  ['05-авторизация', 'Авторизация'],
  ['06-модальные-окна-и-панели', 'Модальные окна и контекстные панели'],
  ['07-компоненты', 'Компоненты'],
  ['08-системные-состояния', 'Системные состояния'],
  ['09-юридические-страницы', 'Юридические страницы'],
].map(([folder, title]) => ({folder, title}));
// These are existing contextual surfaces, including full-page presentations of panels.
// The combined overlays atlas stays in Components; it is not split into invented screens.
const panels = new Set([
  'buyer-order-detail', 'buyer-document-detail', 'buyer-document-upload', 'buyer-reviews',
  'supplier-onboarding', 'supplier-order-detail', 'supplier-shipment', 'supplier-offer-editor',
  'supplier-import-review', 'supplier-agreement', 'supplier-corrections', 'supplier-document-detail',
  'admin-organization-create',
]);
const titles = {
  'public-home':'Главная', 'public-suppliers':'Для поставщиков',
  'public-catalog':'Каталог', 'product-offers':'Товар и предложения',
  'system-empty':'Пустой список', 'system-loading':'Загрузка документов',
  'system-error':'Ошибка загрузки', 'system-forbidden':'Нет доступа',
  'system-session':'Сессия завершена', 'system-not-found':'Страница не найдена',
};
const categoryFor = item => {
  if (panels.has(item.id)) return categories[5];
  if (item.id.startsWith('components-')) return categories[6];
  if (item.id.startsWith('system-')) return categories[7];
  if (item.id.startsWith('legal-')) return categories[8];
  return categories[{public:0,buyer:1,supplier:2,admin:3,auth:4}[item.role]];
};

const pagesInput = await read('pages.js');
const context = {window:{}};
vm.runInNewContext(pagesInput.toString('utf8'), context, {timeout:1500, filename:'pages.js'});
const pages = Array.from(context.window.DM_PAGES);
const sourceManifest = JSON.parse(await read('source-manifest.json'));
assert.equal(pages.length, 78, 'This approved organization scope contains exactly 78 surfaces');
assert.equal(sourceManifest.pages, pages.length);
assert.equal(new Set(pages.map(item => item.id)).size, pages.length);
for (const id of panels) assert(pages.some(item => item.id === id), `Unknown panel ${id}`);
const entries = pages.map(item => {
  assert(/^[a-z0-9-]+$/.test(item.id), `Unsafe surface ID ${item.id}`);
  const category = categoryFor(item);
  assert(category, `Unclassified ${item.id}`);
  return {...item, title:titles[item.id] || item.title, category:category.folder,
    categoryTitle:category.title, file:`${category.folder}/${item.id}.html`, status:pending};
}).sort((a,b) => categories.findIndex(c => c.folder === a.category) - categories.findIndex(c => c.folder === b.category));

const outputs = new Map();
const inputs = {'pages.js':hash(pagesInput), 'source-manifest.json':hash(await read('source-manifest.json'))};
const emit = (file, data) => {
  assert(!outputs.has(file), `Duplicate output ${file}`);
  const target = path.resolve(outputRoot, file);
  assert(target.startsWith(outputRoot + path.sep), `Output escapes review root: ${file}`);
  outputs.set(file, Buffer.isBuffer(data) ? data : Buffer.from(data));
};
const relative = (from, to) => slash(path.relative(path.dirname(path.join(outputRoot, from)), path.join(outputRoot, to)));
const a = (href, label) => `<a href="${escape(href)}">${escape(label)}</a>`;
const link = (from, to, label) => a(relative(from,to), label);
const css = 'body{margin:0;background:#fafaf8;color:#172c30;font:16px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px}h1{line-height:1.15}a{color:#006451}a:focus-visible{outline:3px solid #006451;outline-offset:4px}.review-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 24px;background:#f0f4f1;border-block:1px solid #cbd6cf;font:14px/1.5 system-ui,sans-serif}.review-toolbar a{color:#00503e}.review-toolbar p{margin:0}.review-status{color:#805015;background:#fff5e4;border:1px solid #e3d3af;border-radius:4px;padding:2px 8px;font-size:13px}.review-list{list-style:none;padding:0}.review-list li{padding:14px 0;border-bottom:1px solid #dce2dd;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.review-list small{color:#536170}.review-card{margin:24px 0;padding:16px;border:1px solid #dce2dd;background:white}.review-card img{display:block;max-width:100%;height:auto}.review-links{display:flex;gap:16px;flex-wrap:wrap}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #dce2dd;text-align:left}@media(max-width:600px){main{padding:20px 14px}.review-toolbar{padding:12px;gap:8px}.review-list li{display:block}.review-list small{display:block}}';
emit('review.css', css + '\n');
const document = (file,title,body) => `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="${relative(file,'review.css')}"></head><body><main>${body}</main></body></html>\n`;
const status = `<span class="review-status">${pending}</span>`;
const itemLink = (from, item) => `<li>${link(from,item.file,`${entries.indexOf(item)+1}. ${item.title}`)} ${status}<small>${roleNames[item.role]} · ${escape(item.id)} · исходный статус ${escape(item.implementation)}</small></li>`;
const panelNote = from => `<p>Здесь существующие модальные окна и контекстные панели, некоторые показаны полноэкранным макетом. Общие modal, select, popover и несохранённые изменения объединены в одном ${link(from,entries.find(p=>p.id==='components-overlays').file,'атласе раскрытых элементов')}. Отдельные несуществующие экраны не создавались.</p>`;
const navigation = (item, index) => `<nav class="review-toolbar" aria-label="Просмотр референсов"><p><strong>${index+1}/78 · ${escape(item.title)}</strong> · ${escape(item.categoryTitle)} · ${status}</p><div class="review-links">${link(item.file,'index.html','Весь набор')}${index ? link(item.file,entries[index-1].file,'← Предыдущий') : ''}${index < entries.length-1 ? link(item.file,entries[index+1].file,'Следующий →') : link(item.file,'10-дополнительные-концепты/index.html','Далее: дополнительные концепты →')}${link(item.file,'CHECKLIST.md','Чеклист')}</div></nav>`;

for (const [index,item] of entries.entries()) {
  const source = `rendered/${item.id}.html`;
  const data = await read(source);
  inputs[source] = hash(data);
  const sourceUrl = new URL(source, 'https://preview.invalid/');
  // Relocate existing links/assets; never use <base>, which the old server forbids.
  let html = data.toString('utf8').replace(/\r\n/g,'\n').replace(/\b(href|src)="([^"]+)"/g, (full,attr,value) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return full;
    const url = new URL(value.replaceAll('&amp;','&'), sourceUrl);
    const target = path.join(root,decodeURIComponent(url.pathname.slice(1)));
    const destination = slash(path.relative(path.dirname(path.join(outputRoot,item.file)),target));
    return `${attr}="${escape(destination + url.search + url.hash)}"`;
  });
  assert(html.includes('<body>') && html.includes('</body>'), `Unexpected snapshot ${source}`);
  html = html.replace('</head>', `<link rel="stylesheet" href="${relative(item.file,'review.css')}"></head>`)
    .replace('<body>', `<body>${navigation(item,index)}`)
    .replace('</body>', `${navigation(item,index)}</body>`);
  // Only style the review navigation in snapshot pages; don't restyle the reference itself.
  html = html.replace(`href="${relative(item.file,'review.css')}"`, `href="${relative(item.file,'snapshot-navigation.css')}"`);
  emit(item.file, html);
}
// Reuse just the packaging rules, leaving the snapshot's body/type/layout CSS intact.
const navigationCss = css.slice(css.indexOf('.review-toolbar'), css.indexOf('.review-list'));
emit('snapshot-navigation.css', navigationCss + '\n.review-links{display:flex;gap:16px;flex-wrap:wrap}\n.review-toolbar a:focus-visible{outline:3px solid #006451;outline-offset:4px}\n');

for (const category of categories) {
  const file = `${category.folder}/index.html`;
  const members = entries.filter(item => item.category === category.folder);
  const note = category === categories[5] ? panelNote(file) : '';
  emit(file, document(file,category.title,`${link(file,'index.html','← Весь набор')}<h1>${escape(category.title)}</h1><p>${members.length} элементов. Все ${pending.toLowerCase()}.</p>${note}<ul class="review-list">${members.map(item=>itemLink(file,item)).join('')}</ul>`));
}

const imageSets = [
  {folder:'00-исходное-направление',title:'Четыре исходных PNG · визуальное направление',
    note:'Не скриншоты приложения. Историческое направление OWNER_DIRECTION; включение в утверждаемый набор ожидает решения владельца.',
    files:sourceManifest.originals.map(item=>({source:`originals/${item.name}`,name:item.name,sha256:item.sha256,title:({'04-catalog.png':'Каталог · фильтры слева','03-product-offers.png':'Товар и предложения','02-cart-reprice.png':'Корзина и reprice','01-supplier-order.png':'Заказ поставщика'})[item.name]}))},
  {folder:'10-дополнительные-концепты',title:'Дополнительные AI-концепты · PROPOSED',
    note:'Два дополнительных листа, не новые страницы приложения и не часть счётчика 78 HTML. Не утверждены.',
    files:[{source:'concepts/buyer-documents-ai.png',name:'buyer-documents-ai.png',title:'Документолог · AI-концепт'},
      {source:'concepts/components-overlays-ai.png',name:'components-overlays-ai.png',title:'Раскрытые элементы · AI-концепт'}]},
];
const images = [];
for (const set of imageSets) {
  const file = `${set.folder}/index.html`;
  const cards = [];
  for (const item of set.files) {
    const data = await read(item.source);
    if (item.sha256) assert.equal(hash(data),item.sha256,`Original changed: ${item.source}`);
    inputs[item.source] = hash(data);
    const imageFile = `${set.folder}/${item.name}`;
    emit(imageFile,data);
    images.push({file:imageFile,source:item.source,title:item.title,sha256:hash(data),status:pending});
    cards.push(`<article class="review-card"><h2>${escape(item.title)}</h2><p>${status}</p>${link(file,imageFile,'Открыть PNG в полном размере')}<img src="${relative(file,imageFile)}" alt="${escape(item.title)}" loading="lazy"></article>`);
  }
  emit(file,document(file,set.title,`${link(file,'index.html','← Весь набор')}<h1>${set.title}</h1><p>${set.note}</p>${cards.join('')}<p>${link(file,entries[0].file,'Начать 78 HTML →')}</p>`));
}

const intro = '<p>Все элементы ожидают утверждения владельца. Просмотр не означает согласование дизайна или новой бизнес-функции. Это организация существующего набора; исходники и прежние точки входа сохранены.</p>';
const sequence = `<ol><li>${link('index.html','00-исходное-направление/index.html','Посмотреть четыре исходных PNG')}.</li><li>${link('index.html',entries[0].file,'Начать последовательный просмотр 1/78')}; дальше используйте «Следующий» сверху или снизу каждого экрана.</li><li>${link('index.html','10-дополнительные-концепты/index.html','Посмотреть два дополнительных концепта')}.</li><li>${link('index.html','CHECKLIST.md','Сверить чеклист')} и сообщить решения/замечания по ID. Ни один пункт не утверждён автоматически.</li></ol>`;
const overview = `<table><thead><tr><th>Папка</th><th>HTML</th></tr></thead><tbody>${categories.map(c=>`<tr><td>${link('index.html',`${c.folder}/index.html`,c.folder)}</td><td>${entries.filter(p=>p.category===c.folder).length}</td></tr>`).join('')}<tr><th>Всего, без повторов</th><th>78</th></tr></tbody></table>`;
const sections = categories.map(c=>`<section><h2>${escape(c.title)}</h2>${c===categories[5]?panelNote('index.html'):''}<ul class="review-list">${entries.filter(p=>p.category===c.folder).map(p=>itemLink('index.html',p)).join('')}</ul></section>`).join('');
emit('index.html',document('index.html','Platforma.Market · набор на утверждение',`<h1>Все референсы за один проход</h1>${intro}${sequence}${overview}<p>Диагностические screens/evidence PNG исключены. HTML — статичные снимки; ссылки «прототип» внутри ведут в сохранённую интерактивную версию. Для просмотра достаточно открыть этот файл в браузере.</p><p>${a('../index.html','Прежняя галерея')} · ${a('../PAGE_INVENTORY.md','Происхождение поверхностей')} · ${a('../COMPONENT_ATLAS.md','Ограничения компонентов')}</p>${sections}`));

const checklist = ['# Чеклист просмотра · все пункты ожидают утверждения','',
  'Этот файл генерируется. Для личных отметок сохраните копию или сообщите решения в чате по ID; генерация не хранит и не присваивает согласование.',
  'Проход: четыре исходных PNG → 78 HTML кнопкой «Следующий» → два дополнительных концепта. Чекбоксы означают только просмотр.','',
  ...imageSets.slice(0,1).flatMap(s=>['## Исходное направление','',...images.filter(i=>i.file.startsWith(s.folder+'/')).map(i=>`- [ ] [${i.title}](${i.file}) — ${pending}.`),'']),
  ...categories.flatMap(c=>[`## ${c.title} · ${entries.filter(p=>p.category===c.folder).length}`,'',...entries.filter(p=>p.category===c.folder).map(p=>`- [ ] ${entries.indexOf(p)+1}. [${p.title}](${p.file}) · ${p.id} · ${roleNames[p.role]} — ${pending}. Замечание: ______`),'']),
  '## Дополнительные концепты','',...images.filter(i=>i.file.startsWith(imageSets[1].folder+'/')).map(i=>`- [ ] [${i.title}](${i.file}) — PROPOSED, ${pending.toLowerCase()}.`),'',
  'Modal/select/popover/несохранённые изменения находятся в одном components-overlays; он учитывается один раз в компонентах. Диагностические PNG не включены.',''];
emit('CHECKLIST.md',checklist.join('\n'));
const manifest = {kind:'reference-review-packaging',approval:'PENDING',surfaceCount:entries.length,
  categories:categories.map(c=>({...c,count:entries.filter(p=>p.category===c.folder).length})),
  surfaces:entries.map(({id,title,role,category,file,status})=>({id,title,role,category,file,status})),
  images,inputs,outputs:Object.fromEntries([...outputs].map(([file,data])=>[file,hash(data)])),
  excluded:'screens/ and evidence/ diagnostic images; no new app routes or business approvals'};
emit('manifest.json',JSON.stringify(manifest,null,2)+'\n');

// Validate all relocated HTML/CSS links (including fonts, prototype links and query IDs).
let checkedLinks = 0;
const visited = new Set();
async function verifyLinks(file, data) {
  const ext = path.extname(file);
  if (!['.html','.css'].includes(ext) || visited.has(file)) return;
  visited.add(file);
  const content = data.toString('utf8');
  const refs = ext === '.css' ? [...content.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1])
    : [...content.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m=>m[1]);
  for (const raw of refs) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
    const url = new URL(raw.replaceAll('&amp;','&'),'https://preview.invalid/'+slash(path.relative(root,file)));
    const target = path.resolve(root,decodeURIComponent(url.pathname.slice(1)));
    assert(target.startsWith(root + path.sep),`Link escapes preview: ${raw}`);
    const rel = slash(path.relative(outputRoot,target));
    const targetData = outputs.get(rel) || await fs.readFile(target);
    checkedLinks++;
    const id = url.searchParams.get('page');
    if (id) assert(pages.some(p=>p.id===id),`Unknown linked surface ${id}`);
    if (path.extname(target)==='.css') await verifyLinks(target,targetData);
  }
}
for (const [file,data] of outputs) await verifyLinks(path.join(outputRoot,file),data);
// No deletion. Unknown files are preserved; stale generated paths require explicit review.
let previous;
try { previous = JSON.parse(await fs.readFile(path.join(outputRoot,'manifest.json'),'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous) for (const file of Object.keys(previous.outputs)) assert(outputs.has(file),`Stale generated path needs review: ${file}`);
for (const [file,data] of outputs) {
  const target = path.join(outputRoot,file);
  if (checkOnly) {
    const actual = await fs.readFile(target);
    const textFile = !file.endsWith('.png');
    assert.equal(hash(textFile ? actual.toString('utf8').replace(/\r\n/g,'\n') : actual),hash(data),`Regenerate changed output ${file}`);
  } else {
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,data);
  }
}
console.log(JSON.stringify({mode:checkOnly?'CHECK':'GENERATE',surfaces:entries.length,uniqueIds:new Set(entries.map(p=>p.id)).size,
  categories:manifest.categories,originals:4,concepts:2,files:outputs.size,checkedLinks,approval:'PENDING'},null,2));
