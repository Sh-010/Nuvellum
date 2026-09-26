import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildPublicDir } from './lib/paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const archivePath = join(root, 'assets', 'nuvellum-v5.zip');
const archive = readFileSync(archivePath);
const expectedSha256 = 'b41a222588a53e91a78354c859c9d9ee01b7ac07b333e9a98f3dfa4f8b8d93e8';
const actualSha256 = createHash('sha256').update(archive).digest('hex');
if (actualSha256 !== expectedSha256) throw new Error(`Nuvellum v5.1 baseline archive checksum mismatch: ${actualSha256}`);
if (existsSync(join(root, 'src', 'pages', 'index.astro'))) throw new Error('src/pages/index.astro would override the approved v5.1 homepage. Remove it before building.');
const zip = new AdmZip(archive);
zip.extractAllTo(buildPublicDir, true);
const baselineHtml = readFileSync(join(buildPublicDir, 'index.html'), 'utf8');
if (!baselineHtml.includes('v4 FULLY INTERACTIVE EDITORIAL LAYER') || !baselineHtml.includes('quick-chip')) throw new Error('Extracted homepage does not match the approved v5.1 interaction baseline.');

const canonical = (process.env.SITE_URL || 'https://nuvellum.vercel.app').replace(/\/$/, '');
const homeDescription = 'Nuvellum is an independent international publication covering world affairs, business, technology, culture, film, anime, gaming, sport and ideas.';

const storyRoutes = {
  'A world in motion: the forces quietly redrawing the global order': '/article/world-in-motion',
  'AI is becoming infrastructure, not merely a product': '/article/ai-infrastructure',
  'Why patient capital is quietly returning': '/article/patient-capital',
  'Prestige media is rediscovering restraint': '/article/prestige-media',
  'The business of sport is becoming a media war': '/article/sports-media-war',
  'The return of the 150-minute epic': '/article/film-spectacle',
  'The spectacle is back — but audiences want more than scale': '/article/film-spectacle',
  'Studios rethink what players will pay for': '/article/smaller-studios',
  'Smaller studios keep stealing the conversation': '/article/smaller-studios',
  'Why smaller studios keep stealing the conversation': '/article/smaller-studios',
  'A new generation of observatories goes online': '/article/observatories',
  'Power is becoming more distributed — and more difficult to read': '/article/power-distributed',
  'The megacity is becoming a defining unit of global power': '/article/megacity-power',
  'A new industrial race gathers pace': '/article/industrial-race',
  'Supply chains are becoming foreign policy': '/article/supply-chains-foreign-policy',
  'Young cities, old systems and a new investment map': '/article/young-cities-investment',
  'Regional power is increasingly measured in logistics': '/article/regional-power-logistics',
  'Anime’s global audience no longer needs an introduction': '/article/global-anime',
  'The medium’s global audience no longer needs an introduction': '/article/global-anime',
  'We have too much information and too little interpretation': '/article/too-much-information',
  'The internet flattened taste. Culture is becoming strange again.': '/article/internet-flattened-taste',
  'Why seriousness is becoming fashionable again': '/article/seriousness-fashionable'
};

function injectBeforeHeadClose(html, block) {
  return html.includes(block) ? html : html.replace('</head>', `${block}\n</head>`);
}

function addHomeMetadata(html) {
  const url = `${canonical}/`;
  const image = `${canonical}/images/world.svg`;
  html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '').replace(/<meta property="og:site_name"[^>]*>\s*/g, '').replace(/<meta property="og:url"[^>]*>\s*/g, '');
  const meta = `
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">\n<link rel="alternate" type="application/rss+xml" title="Nuvellum RSS" href="/rss.xml">
<meta name="theme-color" content="#6d1720">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nuvellum">
<meta property="og:title" content="Nuvellum — Beyond the headline.">
<meta property="og:description" content="${homeDescription}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Nuvellum — Beyond the headline.">
<meta name="twitter:description" content="${homeDescription}">
<meta name="twitter:image" content="${image}">
<script type="application/ld+json">${JSON.stringify({
  '@context':'https://schema.org',
  '@type':'WebSite',
  name:'Nuvellum',
  url,
  description:homeDescription,
  publisher:{'@type':'Organization',name:'Nuvellum',url}
})}</script>`;
  return injectBeforeHeadClose(html, meta);
}

function patchStaticStoryLinks(html) {
  const scriptStart = html.indexOf('<script>');
  const cutoff = scriptStart >= 0 ? scriptStart : html.length;
  let content = html.slice(0, cutoff);
  const tail = html.slice(cutoff);
  for (const [title, route] of Object.entries(storyRoutes)) {
    let from = 0;
    while (true) {
      const pos = content.indexOf(title, from);
      if (pos < 0) break;
      const start = content.lastIndexOf('<article', pos);
      const endTag = content.indexOf('</article>', pos);
      if (start >= 0 && endTag > pos) {
        const end = endTag + '</article>'.length;
        const card = content.slice(start, end);
        const next = card.split('href="article.html"').join(`href="${route}"`);
        if (next !== card) content = content.slice(0, start) + next + content.slice(end);
        from = start + next.length;
      } else {
        from = pos + title.length;
      }
    }
  }
  content = content
    .replace('id="tickerText" href="article.html"', 'id="tickerText" href="/article/world-in-motion"')
    .replace('id="drawerRead" href="article.html"', 'id="drawerRead" href="/article/world-in-motion"');
  return content + tail;
}

function productionizeHome(html) {
  // Preserve v5.1 markup/CSS/motion exactly; only destinations and metadata change.
  const replacements = [
    ['href="index.html"', 'href="/"'],
    ['href="#business"', 'href="/section/business"'],
    ['href="#science"', 'href="/section/science"'],
    ['href="#crime"', 'href="/section/crime"'],
    ['href="#sports"', 'href="/section/sports"'],
    ['href="#culture"', 'href="/section/culture"'],
    ['<a href="#" data-info="world">View all</a>', '<a href="/section/world">View all</a>'],
    ['<a href="#" data-info="screen">Film · Anime · Gaming</a>', '<a href="/section/entertainment">Film · Anime · Gaming</a>'],
    ['<a href="#" data-info="opinion">All columns</a>', '<a href="/section/opinion">All columns</a>'],
    ['<a href="#" data-info="about">About</a>', '<a href="/about">About</a>'],
    ['<a href="#" data-info="standards">Editorial Standards</a>', '<a href="/standards">Editorial Standards</a>'],
    ['<a href="#" data-info="corrections">Corrections</a>', '<a href="/corrections">Corrections</a>'],
    ['<a href="#" data-info="contact">Contact</a>', '<a href="/contact">Contact</a>'],
    ['<a href="#" data-info="advertise">Advertise</a>', '<a href="/advertise">Advertise</a>'],
    ['<a href="#" data-info="sponsorships">Sponsorships</a>', '<a href="/advertise#sponsorships">Sponsorships</a>'],
    ['<a href="#" data-info="privacy">Privacy</a>', '<a href="/privacy">Privacy</a>'],
    ['<a href="#" data-info="terms">Terms</a>', '<a href="/terms">Terms</a>'],
    ['<a href="#">Business</a>', '<a href="/section/business">Business</a>'],
    ['<a href="#">Sports</a>', '<a href="/section/sports">Sports</a>']
  ];
  for (const [from, to] of replacements) html = html.split(from).join(to);
  html = patchStaticStoryLinks(html);

  // The v5.1 mockup contains two local demo handlers that claim an address
  // was subscribed. Until a real subscriber backend exists, neither may
  // claim success or imply storage.
  html = html
    .split("qs('#signupMsg').textContent=`Welcome to The Nuvellum Brief — \${v} is on the list.`;")
    .join("qs('#signupMsg').textContent='Newsletter signup is not live yet — no address was stored.';")
    .split("msg.textContent=`Welcome to The Nuvellum Brief — \${email} is on the list.`;")
    .join("msg.textContent='Newsletter signup is not live yet — no address was stored.';");

  // Any real anchor is navigation and must not also trigger the preview drawer.
  html = html.replace("return !target.closest('a[href=\"article.html\"],button,input,form,.bookmark,.save-btn');", "return !target.closest('a[href],button,input,form,.bookmark,.save-btn');");

  const bridge = `<script id="nuvellum-production-bridge">
(()=>{
  const routes=${JSON.stringify(storyRoutes)};
  document.querySelectorAll('article[data-route]').forEach(card=>{
    const title=(card.dataset.title||card.querySelector('h1,h2,h3')?.textContent||'').trim();
    if(title&&card.dataset.route) routes[title]=card.dataset.route;
  });
  const routeFor=t=>routes[(t||'').trim()]||'/article/world-in-motion';
  const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  document.querySelectorAll('article').forEach(card=>{
    const title=(card.dataset.title||card.querySelector('h1,h2,h3')?.textContent||'').trim();
    const route=routes[title];
    if(route) card.querySelectorAll('a[href="article.html"]').forEach(a=>a.setAttribute('href',route));
  });
  const ticker=document.getElementById('tickerText');
  if(ticker) ticker.setAttribute('href','/article/world-in-motion');
  const drawerRead=document.getElementById('drawerRead');
  if(drawerRead){
    drawerRead.setAttribute('href','/article/world-in-motion');
    drawerRead.addEventListener('click',()=>{
      const title=document.getElementById('drawerTitle')?.textContent||'';
      drawerRead.setAttribute('href',routeFor(title));
    });
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('#searchResults a.result,#savedResults a.result');
    if(!a)return;
    const title=a.querySelector('h4')?.textContent||'';
    let route=routes[title];
    if(!route){try{const hit=(JSON.parse(localStorage.getItem('nuvellum-saved-v2')||'[]')||[]).find(x=>x&&x.title===title&&typeof x.url==='string'&&x.url.startsWith('/article/'));if(hit)route=hit.url}catch(err){}}
    if(route){e.preventDefault();location.href=route;}
  });
  const input=document.getElementById('searchInput');
  const results=document.getElementById('searchResults');
  if(input&&results){
    let fullIndex=[];
    fetch('/search-index.json').then(r=>r.ok?r.json():[]).then(data=>{if(Array.isArray(data)){fullIndex=data;data.forEach(x=>{if(x&&x.title&&x.slug&&!routes[x.title])routes[x.title]='/article/'+encodeURIComponent(x.slug)})}}).catch(()=>{});
    input.addEventListener('input',()=>{
      const q=input.value.trim().toLowerCase();
      if(!q||!fullIndex.length)return;
      const matches=fullIndex.filter(x=>[x.title||'',x.section||'',x.dek||'',(x.tags||[]).join(' ')].join(' ').toLowerCase().includes(q)).slice(0,8);
      results.innerHTML=matches.length?matches.map(x=>'<a class="result" href="/article/'+encodeURIComponent(x.slug)+'"><div class="cat">'+esc(x.section||'Nuvellum')+'</div><h4>'+esc(x.title)+'</h4></a>').join(''):'<div class="empty">No stories matched that search.</div>';
    });
  }
})();
</script>`;
  html = html.replace('</body>', `${bridge}\n</body>`);
  return addHomeMetadata(html);
}

function productionizeLegacyArticle(html) {
  // Keep the v5.1 article sample for visual reference, but prevent duplicate indexing.
  const url = `${canonical}/article/world-in-motion`;
  html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '').replace(/<meta property="og:site_name"[^>]*>\s*/g, '').replace(/<meta property="og:url"[^>]*>\s*/g, '');
  const meta = `
<link rel="canonical" href="${url}">
<meta name="robots" content="noindex,follow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="Nuvellum">
<meta property="og:url" content="${url}">`;
  return injectBeforeHeadClose(html, meta).split('href="index.html"').join('href="/"');
}

for (const file of ['index.html','article.html']) {
  const path = join(buildPublicDir, file);
  let html = readFileSync(path, 'utf8');
  html = file === 'index.html' ? productionizeHome(html) : productionizeLegacyArticle(html);
  if (file === 'index.html' && html.includes('is on the list.')) {
    throw new Error('Production homepage still contains the mock newsletter success message.');
  }
  writeFileSync(path, html);
}

console.log('Restored exact Nuvellum v5.1 design and applied production-only routing/SEO bridges.');
