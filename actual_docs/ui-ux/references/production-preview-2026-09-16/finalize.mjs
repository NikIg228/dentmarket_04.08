import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>fs.readFile(path.join(root,p),'utf8');
const scope={window:{}};vm.runInNewContext(await read('pages.js'),scope);const pages=scope.window.DM_PAGES;
const layout=JSON.parse(await read('evidence/browser-layout-checks.json'));
const docs=JSON.parse(await read('evidence/document-responsive-fix.json'));
const shared=JSON.parse(await read('evidence/final-shared-header-layout.json'));
const staticReport=JSON.parse(await read('evidence/static-validation.json'));
const control=new Set(['buyer-documents','buyer-orders','supplier-offers','admin-overview','components-overlays']);
const result=(id,w)=>{const q=layout.filter(x=>x.id===id&&x.width===w).at(-1);return q?(q.h1===1&&!q.missingTemplate&&!q.unnamedControls&&q.scrollWidth<=q.viewport+1?'PASS':'FAIL'):'NOT_RUN'};
const body=['# Матрица дизайн-покрытия · v1.0','',
'78 поверхностей / 69 шаблонов. Это не 78 независимых app routes. Общие состояния переиспользуются; source в PAGE_INVENTORY.md.','',
'DOM = один h1, известный шаблон, именованные основные controls, отсутствие горизонтального переполнения страницы. Это не полный визуальный или функциональный PASS.','',
'| ID / роль | HTML | DOM 1536 | DOM 390 | DOM 360 | Визуальная приёмка всех состояний | Утверждение |','|---|---|---|---|---|---|---|',
...pages.map(p=>`| [${p.id}](rendered/${p.id}.html) / ${p.role} | CREATED | ${result(p.id,1536)} | ${result(p.id,390)} | ${result(p.id,360)} | ${control.has(p.id)?'Контрольный desktop осмотрен; полная NOT_RUN':'NOT_RUN'} | PENDING |`),'',
'## Состояния и повторное использование','',
'- Loading / empty / error / no-access / expired session / 404: отдельные `system-*` референсы.','- Validation / partial result / price-stock conflict / disabled action / upload error: `components-feedback`, `components-controls`, `buyer-cart`, `supplier-import-review`.','- Open modal / combobox / popover / unsaved changes: `components-overlays`.','- Native select и базовые поля интерактивны; сложные keyboard/nested-popup контракты ещё не приняты.','- Публичный статичный юридический текст: некоторые async состояния N/A; реальное содержание берётся из утверждённой редакции.','',
'## Адресная перепроверка','',
`PDF overflow на 768 был FAIL; после изменения только .doc-preview: ${docs.checks.filter(x=>x.pass).length}/${docs.checks.length} PASS по двум ролям и четырём ширинам.`,
`После добавления доступного пункта города в профиль и help у header search: ${shared.filter(x=>x.pass).length}/${shared.length} геометрических проверок общей оболочки на 390×844, 1024×768, 1440×900, 1920×1080.`,
'Остальной контент не менялся. Старые FAIL сохранены в исходном журнале, а не затёрты.','',
'## Не выдаётся за выполнение','',
'OWNER_APPROVED для новых макетов = 0. Engineering IMPLEMENTED/RUNTIME_TESTED не присваиваются.','Точный PNG export — BLOCKED после трёх попыток. Полная ручная визуальная приёмка, все интерактивные состояния, физические устройства и production — не подтверждены.',''];
await fs.writeFile(path.join(root,'COVERAGE_MATRIX.md'),body.join('\n'));
const textFiles=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(/\.(?:js|mjs|css|html|md|json|txt)$/.test(e.name))textFiles.push(p)}}await walk(root);
const whitespace=[];for(const file of textFiles){const content=await fs.readFile(file,'utf8');if(content.split(/\r?\n/).some(l=>/[\t ]+$/.test(l)))whitespace.push(path.relative(root,file));}
const hashes={};for(const f of ['pages.js','app.js','templates.js','style.css','gallery.js','viewer.js','serve.mjs'])hashes[f]=crypto.createHash('sha256').update(await read(f)).digest('hex');
const report={scope:'Only production-preview-2026-09-16 artifacts',branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes,surfaces:pages.length,templates:new Set(pages.map(p=>p.template)).size,structurePass:staticReport.results.filter(x=>x.structure==='PASS').length,domPassByWidth:Object.fromEntries([1536,390,360].map(w=>[w,pages.filter(p=>result(p.id,w)==='PASS').length])),textFiles:textFiles.length,trailingWhitespace:whitespace,exactPngExport:'BLOCKED',fullVisualAcceptance:'NOT_RUN',ownerApproval:'PENDING',runtimeAcceptance:'NOT_IN_SCOPE'};
await fs.writeFile(path.join(root,'evidence','final-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(whitespace.length)process.exitCode=1;
