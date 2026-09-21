import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'actual_docs/ui-ux/references/production-preview-2026-09-16');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const req=createRequire(path.join(root,'package.json')),sharp=req('sharp');
for(const dir of ['originals','assets','concepts','screens','evidence'])fs.mkdirSync(path.join(out,dir),{recursive:true});
const sources=[['01-supplier-order.png','19_23_11'],['02-cart-reprice.png','19_23_04'],['03-product-offers.png','19_22_51'],['04-catalog.png','19_22_42']];
const originals=[];
for(const [name,time]of sources){const file=`C:/Users/user/Desktop/Изображение Codex 14 сент. 2026 г., ${time}.png`,target=path.join(out,'originals',name);if(!fs.existsSync(target))fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);if(hash(file)!==hash(target))throw Error('Original mismatch');const m=await sharp(file).metadata();originals.push({name,source:file,sha256:hash(file),width:m.width,height:m.height,role:'OWNER_DIRECTION',pixelModified:false});}
const fonts=[];let css='';
const cssRoot=path.join(root,'apps/buyer-web/.next/static/css');
for(const file of fs.readdirSync(cssRoot).filter(f=>f.endsWith('.css'))){
 const content=fs.readFileSync(path.join(cssRoot,file),'utf8');
 for(const match of content.matchAll(/@font-face\{[^}]*\}/g)){
  if(!/Manrope/.test(match[0])||!match[0].includes('url('))continue;
  const face=match[0].replace(/font-family:[^;]+/,'font-family:Manrope');
  const url=face.match(/url\(([^)]+)\)/)?.[1]?.replace(/["']/g,'');
  const name=path.basename(url);if(!name.endsWith('.woff2'))continue;
  const font=path.join(root,'apps/buyer-web/.next/static/media',name),target=path.join(out,'assets',name);
  if(!fs.existsSync(target))fs.copyFileSync(font,target,fs.constants.COPYFILE_EXCL);
  if(!fonts.some(f=>f.name===name)){fonts.push({name,source:path.relative(root,font),sha256:hash(font)});css+=face.replace(/url\([^)]+\)/,`url("./${name}")`)+'\n';}
 }
}
fs.writeFileSync(path.join(out,'assets/fonts.css'),css);
const icons=req('@fluentui/react-icons'), React=req('react'),{renderToStaticMarkup}=req('react-dom/server');
const names=['Search24Regular','Location24Regular','ChevronDown24Regular','Cart24Regular','Person24Regular','Navigation24Regular','Dismiss24Regular','Document24Regular','ArrowDownload24Regular','Add24Regular','MoreHorizontal24Regular','Info24Regular','CheckmarkCircle24Regular','Warning24Regular','ErrorCircle24Regular','ArrowRight24Regular','ArrowUpload24Regular','Filter24Regular','Calendar24Regular','Delete24Regular','BuildingShop24Regular','ShieldLock24Regular','ArrowSync24Regular','QuestionCircle24Regular','Box24Regular','ClipboardTaskListLtr24Regular','Alert24Regular'];
const map={};for(const name of names){if(!icons[name])throw Error('Missing existing icon '+name);map[name]=renderToStaticMarkup(React.createElement(icons[name],{'aria-hidden':true}));}
fs.writeFileSync(path.join(out,'assets/icons.js'),'window.DM_ICONS='+JSON.stringify(map)+';');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(out,'pages.js'),'utf8'),ctx);const pages=ctx.window.DM_PAGES;
const sourceFiles=[...new Set(pages.map(p=>p.source).concat(['AGENTS.md','actual_docs/governance/DEVELOPMENT_WORKFLOW.md','actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md','actual_docs/ui-ux/DENTMARKET_UI_UX_CONSOLIDATION_STANDARD.md','packages/ui/src/styles.css']))];
const inputs=sourceFiles.map(file=>({file,sha256:hash(path.join(root,file))}));
const routes=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','apps'],{encoding:'utf8'}).split('\n').filter(f=>/\/page\.tsx$/.test(f));
const body=['# Реестр страниц и поверхностей','',`Всего ${pages.length} design surfaces. Снимок исходников ${new Date().toISOString()}; HEAD ${execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}.`,'','PARTIAL = код/поверхность есть, полнота не сертифицирована. SCOPED_ACCEPTED = принят конкретный AUD slice, не вся страница. TARGET = согласованное направление, реализации не заявляем. CONDITIONAL = flag/adapter/external dependency. DESIGN = атлас, не новый маршрут. Все новые макеты PROPOSED.','', '| ID | Роль / задача | Маршрут или поверхность | Реализация | Действие | Source |','| --- | --- | --- | --- | --- | --- |',...pages.map(p=>`| ${p.id} | ${p.role}: ${p.title} | ${p.route.replaceAll('|',' / ')} | ${p.implementation} | ${p.action||'Сравнить состояния'} | ${p.source} |`),'','## Полнота маршрутов','',...routes.map(r=>`- ${r}`),'','Файлы `page 2.tsx` не являются Next route и не добавляют страницы. API route.ts не UI. Вкладки существующих root pages учтены отдельными surface IDs. Document detail/upload показаны как контекстный слой, не новый обязательный URL.','', '## Состояния и данные','', 'Каждой поверхности назначены default/loading/empty/error/permission там, где применимо; переходы/drafts/conflicts описаны в DESIGN_SYSTEM и атласе. Не все комбинации равнозначны: public/legal не нуждаются в сохраняющем API. В галерее состояния прототипа явно synthetic.','', '## Не утверждённые поверхности','', 'Manual payment CORE-02, account/team и billing full UI — PROPOSED/TARGET, не подтверждение реальных API. Auth compact shell ожидает ответа владельца; до решения отличается только представление в предложении. Связанный order fixture использует одного supplier, корзина с3suppliers — отдельный контекст.'];
fs.writeFileSync(path.join(out,'PAGE_INVENTORY.md'),body.join('\n')+'\n');
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify({time:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),originals,fonts,inputs,routes,pages:pages.length,notes:'Read-only source snapshot. Existing font assets reused locally; separate distribution licensing check before publication.'},null,2));
console.log(JSON.stringify({originals:originals.map(({source,...x})=>x),fonts:fonts.length,icons:names.length,pages:pages.length,routes:routes.length}));
