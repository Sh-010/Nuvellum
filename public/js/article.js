
const body=document.body, article=document.getElementById('articleBody'), toast=document.getElementById('toast');
let size=20;
function setSize(n){size=Math.max(16,Math.min(25,n));article.style.fontSize=size+'px';localStorage.setItem('nuvellum-font',size)}
if(localStorage.getItem('nuvellum-font')){size=+localStorage.getItem('nuvellum-font');setSize(size)}
document.getElementById('larger').onclick=()=>setSize(size+1);document.getElementById('smaller').onclick=()=>setSize(size-1);
document.getElementById('fontBtn').onclick=()=>setSize(size>=23?18:size+1);
document.getElementById('themeBtn').onclick=()=>{body.classList.toggle('night');document.getElementById('themeBtn').textContent=body.classList.contains('night')?'Day':'Night'};
function showToast(t){toast.textContent=t;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1500)}
async function copyLink(){try{await navigator.clipboard.writeText(location.href);showToast('Link copied.')}catch(e){showToast('Copy unavailable in this preview.')}}
document.getElementById('copyBtn').onclick=copyLink;document.getElementById('shareBtn').onclick=async()=>{if(navigator.share){try{await navigator.share({title:document.title,url:location.href})}catch(e){}}else copyLink()};
// Save the article that is actually on screen (previously hard-coded to one demo story).
const articleHead=document.querySelector('.article-head');
const savedKey='nuvellum-saved-v2';
const title=(articleHead?.dataset.title||articleHead?.querySelector('h1')?.textContent||document.title).trim();
const savedCat=(articleHead?.dataset.kicker||'').trim()||'Nuvellum';
const savedUrl=location.pathname;
let saved=[];try{saved=JSON.parse(localStorage.getItem(savedKey)||'[]');if(!Array.isArray(saved))saved=[]}catch(e){saved=[]}
function syncSave(){let on=saved.some(x=>x&&x.title===title);document.getElementById('saveBtn').classList.toggle('saved',on);document.getElementById('saveBtn').textContent=on?'Saved':'Save'} syncSave();
document.getElementById('saveBtn').onclick=()=>{let i=saved.findIndex(x=>x&&x.title===title);if(i>=0)saved.splice(i,1);else saved.push({title,cat:savedCat,url:savedUrl});try{localStorage.setItem(savedKey,JSON.stringify(saved))}catch(e){}syncSave()};
window.addEventListener('scroll',()=>{let d=document.documentElement;let max=d.scrollHeight-innerHeight;document.getElementById('progress').style.width=(max?scrollY/max*100:0)+'%'});
const links=[...document.querySelectorAll('.toc a')], secs=links.map(a=>document.querySelector(a.getAttribute('href')));let ob=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}),{rootMargin:'-25% 0px -65% 0px'});secs.forEach(s=>s&&ob.observe(s));

const articleLogo=document.getElementById('articleLogo');
if(articleLogo){
  articleLogo.addEventListener('click',e=>{
    e.preventDefault();
    articleLogo.classList.remove('pulse'); void articleLogo.offsetWidth; articleLogo.classList.add('pulse');
    setTimeout(()=>location.href='/',360);
  });
}


const pop=document.getElementById('articlePop'),pLabel=document.getElementById('progressLabel');
function articlePop(msg){pop.textContent=msg;pop.classList.add('show');clearTimeout(articlePop.t);articlePop.t=setTimeout(()=>pop.classList.remove('show'),1400)}
window.addEventListener('scroll',()=>{
  const d=document.documentElement,max=d.scrollHeight-innerHeight,p=max?Math.round(scrollY/max*100):0;
  pLabel.textContent=p+'% read';pLabel.classList.toggle('show',p>3&&p<98);
},{passive:true});
document.querySelectorAll('[data-related]').forEach(card=>{
  const go=()=>{articlePop('Opening related story preview in the production build.');card.animate([{opacity:1},{opacity:.62},{opacity:1}],{duration:360})};
  card.addEventListener('click',go);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});
});
document.querySelectorAll('.toc a').forEach(a=>a.addEventListener('click',()=>articlePop('Jumped to '+a.textContent+'.')));
document.getElementById('larger').addEventListener('click',()=>articlePop('Text size increased.'));
document.getElementById('smaller').addEventListener('click',()=>articlePop('Text size decreased.'));
document.getElementById('themeBtn').addEventListener('click',()=>articlePop(document.body.classList.contains('night')?'Night reading enabled.':'Day reading enabled.'));


const ac=document.getElementById('articleCurtain');
const back=document.querySelector('a.back');
if(back){
  back.addEventListener('click',e=>{
    e.preventDefault();ac.classList.add('go');setTimeout(()=>location.href='/',390);
  });
}
window.addEventListener('scroll',()=>document.querySelector('.site-header')?.classList.toggle('scrolled',scrollY>24),{passive:true});

