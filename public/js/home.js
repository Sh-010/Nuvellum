
const q=(s,p=document)=>p.querySelector(s),qa=(s,p=document)=>[...p.querySelectorAll(s)];
const data=JSON.parse(document.getElementById('story-data')?.textContent||'[]');
const key='nuvellum-saved';let saved=JSON.parse(localStorage.getItem(key)||'[]');
const toast=q('#toast');function say(x){toast.textContent=x;toast.classList.add('show');clearTimeout(say.t);say.t=setTimeout(()=>toast.classList.remove('show'),1400)}
function sync(){q('#savedCount').textContent=saved.length;q('#savedResults').innerHTML=saved.length?saved.map(x=>`<a class="result" href="/article/${x.slug}"><small>${x.section}</small><h4>${x.title}</h4></a>`).join(''):'<p class="dek">Nothing saved yet.</p>'}
function toggle(story){let i=saved.findIndex(x=>x.slug===story.slug);if(i>=0)saved.splice(i,1);else saved.push(story);localStorage.setItem(key,JSON.stringify(saved));sync();say(i>=0?'Removed from reading list.':'Saved to reading list.')}
const search=q('#searchPanel'),savedPanel=q('#savedPanel'),drawer=q('#drawer'),scrim=q('#scrim');
function closeAll(){[search,savedPanel,drawer].forEach(x=>x?.classList.remove('open'));scrim.classList.remove('show')}
function open(x){closeAll();x.classList.add('open');scrim.classList.add('show')}
q('#searchBtn').onclick=()=>{open(search);setTimeout(()=>q('#searchInput').focus(),180)};q('#savedBtn').onclick=()=>open(savedPanel);qa('[data-close]').forEach(b=>b.onclick=closeAll);scrim.onclick=closeAll;
q('#searchInput').oninput=e=>{let s=e.target.value.toLowerCase().trim(),r=s?data.filter(x=>(x.title+' '+x.dek+' '+x.section+' '+x.tags.join(' ')).toLowerCase().includes(s)).slice(0,10):[];q('#searchResults').innerHTML=!s?'<p class="dek">Start typing to search Nuvellum.</p>':r.length?r.map(x=>`<a class="result" href="/article/${x.slug}"><small>${x.section} · ${x.type}</small><h4>${x.title}</h4></a>`).join(''):'<p class="dek">No stories matched.</p>'};
q('#themeBtn').onclick=()=>{document.body.classList.toggle('night');localStorage.setItem('nuvellum-theme',document.body.classList.contains('night')?'night':'day');q('#themeBtn').textContent=document.body.classList.contains('night')?'Day':'Night'};
if(localStorage.getItem('nuvellum-theme')==='night'){document.body.classList.add('night');q('#themeBtn').textContent='Day'}
let tick=0;const ticks=data.slice(0,5);setInterval(()=>{if(!ticks.length)return;tick=(tick+1)%ticks.length;q('#ticker').textContent=ticks[tick].title},5200);
qa('[data-filter]').forEach(b=>b.onclick=()=>{qa('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');let f=b.dataset.filter;qa('.latest-card').forEach(c=>c.classList.toggle('hide',f!=='all'&&c.dataset.category!==f))});
qa('[data-collapse]').forEach(b=>b.onclick=()=>{let s=b.closest('.section');s.classList.toggle('collapsed');b.textContent=s.classList.contains('collapsed')?'Show':'Hide'});
function showStory(slug){let s=data.find(x=>x.slug===slug);if(!s)return;q('#drawerKicker').textContent=s.section+' · '+s.type;q('#drawerTitle').textContent=s.title;q('#drawerDek').textContent=s.dek;q('#drawerRead').href='/article/'+s.slug;q('#drawerSave').onclick=()=>toggle(s);open(drawer)}
qa('[data-story]').forEach(el=>{el.addEventListener('click',e=>{if(e.target.closest('a,button'))return;showStory(el.dataset.story)});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showStory(el.dataset.story)}})});
q('#signup').onsubmit=e=>{e.preventDefault();let input=q('#email');q('#signupMsg').textContent='You’re on the Nuvellum Brief list — '+input.value.trim()+'.';input.value=''};
const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{threshold:.08});qa('.reveal').forEach(x=>io.observe(x));
window.addEventListener('scroll',()=>{let d=document.documentElement,max=d.scrollHeight-innerHeight;q('#progress').style.width=(max?scrollY/max*100:0)+'%';q('#backtop').classList.toggle('show',scrollY>700)},{passive:true});q('#backtop').onclick=()=>scrollTo({top:0,behavior:'smooth'});
qa('.brand span').forEach((s,i)=>s.style.transitionDelay=(i*18)+'ms');q('.brand').onclick=e=>{if(location.pathname==='/'){e.preventDefault();qa('.brand span').forEach((s,i)=>{s.animate([{transform:'translateY(0)'},{transform:`translateY(${i%2?-7:-11}px)`,color:'var(--ox)'},{transform:'translateY(0)'}],{duration:650,delay:i*25,easing:'cubic-bezier(.16,1,.3,1)'})});scrollTo({top:0,behavior:'smooth'})}};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName||'')){e.preventDefault();open(search);setTimeout(()=>q('#searchInput').focus(),150)}});sync();
