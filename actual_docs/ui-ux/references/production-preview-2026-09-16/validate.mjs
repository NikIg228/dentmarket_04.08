// Local design-artifact validation only. Does not import applications or contact API/DB.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const inputs=Object.fromEntries(await Promise.all(['assets/icons.js','pages.js','app.js','templates.js','style.css','gallery.js','viewer.js'].map(async p=>[p,await fs.readFile(path.join(root,p),'utf8')])));
const inventory={window:{}};vm.runInNewContext(inputs['pages.js'],inventory);const pages=inventory.window.DM_PAGES;
await fs.mkdir(path.join(root,'rendered'),{recursive:true});
const results=[];
for(const item of pages){const app={innerHTML:''};const context={window:{},URLSearchParams,Intl,location:{search:'?page='+item.id},setTimeout:()=>0,clearTimeout:()=>{},document:{title:'',getElementById:id=>id==='app'?app:{addEventListener:()=>{}},addEventListener:()=>{},createElement:()=>({}),head:{append:()=>{}}}};vm.createContext(context);
  for(const input of ['assets/icons.js','pages.js','app.js','templates.js'])vm.runInContext(inputs[input],context,{timeout:1500,filename:input});vm.runInContext('render()',context,{timeout:1500});
  const h=app.innerHTML;const errors=[];if(h.includes('Шаблон ещё не создан'))errors.push('Missing template');if((h.match(/<h1[ >]/g)||[]).length!==1)errors.push('Expected one h1');if((h.match(/<header /g)||[]).length!==1)errors.push('Expected one common header');if(!h.includes('PROPOSED'))errors.push('Missing design status');if(h.includes('undefined'))errors.push('Undefined output');
  const links=[...h.matchAll(/href="preview\.html\?page=([^"&]+)/g)].map(x=>x[1]);for(const id of links)if(!pages.some(p=>p.id===id))errors.push('Unknown page '+id);
  const html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+item.title+' · статичный референс</title><link rel="stylesheet" href="../assets/fonts.css"><link rel="stylesheet" href="../style.css"></head><body>'+h.replaceAll('href="preview.html','href="../preview.html').replaceAll('href="index.html','href="../index.html')+'<p class="meta" style="padding:16px">Статичный HTML-снимок. Для взаимодействий откройте <a href="../preview.html?page='+item.id+'">прототип</a>.</p></body></html>';
  await fs.writeFile(path.join(root,'rendered',item.id+'.html'),html);
  results.push({id:item.id,template:item.template,created:true,structure:errors.length?'FAIL':'PASS',errors,visualReview:'NOT_RUN',ownerApproval:'PENDING',implementationNotCertified:true,htmlSha256:crypto.createHash('sha256').update(html).digest('hex')});
}
const lum=hex=>{const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
const pairs=[['Основной текст','#111820','#fafaf8'],['Вторичный текст','#536170','#ffffff'],['Primary button','#ffffff','#006451'],['Ошибка','#a8253c','#fff0f2'],['Предупреждение','#805015','#fff5e4']].map(([name,fg,bg])=>{const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return{name,fg,bg,ratio:Number(ratio.toFixed(2)),normalText45:ratio>=4.5}});
const arithmetic={after:2*18900+2*7450+3250,before:2*18900+3*7450+3250,cartOld:2*17900+3*7450+3250,cartNew:2*18900+3*7450+3250};
const report={kind:'design-static-validation',sourceHashes:Object.fromEntries(Object.entries(inputs).map(([n,t])=>[n,crypto.createHash('sha256').update(t).digest('hex')])),surfaces:pages.length,templates:new Set(pages.map(p=>p.template)).size,results,contrast:pairs,arithmetic,arithmeticPass:arithmetic.after===55950&&arithmetic.before===63400&&arithmetic.cartOld===61400&&arithmetic.cartNew===63400,notCovered:['Backend','Working frontend','Real accessibility acceptance','Exact screenshot export','All browser interactions','All breakpoints']};
await fs.writeFile(path.join(root,'evidence','static-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({surfaces:report.surfaces,templates:report.templates,structurePass:results.filter(r=>r.structure==='PASS').length,errors:results.filter(r=>r.errors.length),contrast:pairs,arithmetic,arithmeticPass:report.arithmeticPass},null,2));
if(results.some(r=>r.errors.length)||pairs.some(p=>!p.normalText45)||!report.arithmeticPass)process.exitCode=1;
