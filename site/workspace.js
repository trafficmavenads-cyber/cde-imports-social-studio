(() => {
 'use strict';
 const main=document.querySelector('main');
 const views=['instagram-studio','insights','conexoes','studio'];
 const topSections=[...main.children].filter(n=>n.tagName==='SECTION');
 function route(){
  const requested=location.hash.slice(1)||'instagram-studio';
  const view=views.includes(requested)?requested:requested==='inteligencia'?'studio':'instagram-studio';
  for(const section of topSections)section.hidden=section.id!==view;
  document.querySelectorAll('.sidebar nav a').forEach(a=>{
   const active=a.hash==='#'+view;a.classList.toggle('active',active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(view==='insights')document.querySelector('.kpis').hidden=false;
  window.scrollTo(0,0);
 }
 // Technical configuration remains available on demand.
 document.querySelectorAll('.tiktok-config-guide').forEach(guide=>{
  if(guide.querySelector('#tiktok-config-status')){guide.hidden=true;return;}
  const details=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent=guide.textContent.includes('YouTube')?'Configuração do YouTube':'Configuração do Instagram';
  guide.before(details);details.append(summary,guide);
 });
 const bulk=document.querySelector('.ig-bulk-form');
 const advanced=document.createElement('details'),summary=document.createElement('summary');
 summary.textContent='Opções de agendamento e Stories';advanced.className='publish-options';advanced.append(summary);
 const ids=['ig-bulk-urls','ig-bulk-time','ig-bulk-interval','ig-bulk-auto'];
 ids.forEach(id=>{const input=document.getElementById(id);if(input)advanced.append(input.closest('label'));});
 advanced.append(document.getElementById('ig-story-options'));
 bulk.insertBefore(advanced,document.getElementById('ig-bulk-rights').closest('label'));
 const note=document.createElement('p');note.className='hint';note.textContent='Agendamento depende desta aba aberta e das contas conectadas.';advanced.append(note);
 // Limit the connected account view to the two active networks.
 const grid=document.getElementById('account-grid');
 const filter=()=>{for(const card of grid.children)card.hidden=!/Instagram|YouTube/.test(card.textContent);};
 new MutationObserver(filter).observe(grid,{childList:true});filter();
 window.addEventListener('hashchange',route);route();
})();
