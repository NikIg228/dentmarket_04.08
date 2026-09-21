const q=new URLSearchParams(location.search),id=window.DM_PAGES.some(p=>p.id===q.get('page'))?q.get('page'):'buyer-documents';
const sizes=[360,390,768,1024,1440,1536,1920];let w=sizes.includes(Number(q.get('width')))?Number(q.get('width')):1536;
const frame=document.getElementById('viewer-frame');frame.src='preview.html?page='+id;
document.getElementById('viewer-title').textContent=window.DM_PAGES.find(p=>p.id===id).title+' · PROPOSED';
function size(){frame.style.width=w+'px';frame.style.height=(w<=390?844:w===768?1024:w===1024?768:1024)+'px';document.getElementById('viewer-sizes').innerHTML=sizes.map(x=>`<button type="button" class="btn small ${x===w?'primary':''}" data-width="${x}">${x}</button>`).join('')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-width]');if(b){w=Number(b.dataset.width);size()}});size();
