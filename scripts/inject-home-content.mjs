import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicDir } from './lib/paths.mjs';
import { REGIONS, storiesByRegion } from '../src/lib/geography.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const articlesDir = join(root, 'src', 'content', 'articles');
const homePath = join(buildPublicDir, 'index.html');

function parseValue(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch {}
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseFrontmatter(src) {
  if (!src.startsWith('---')) return {};
  const end = src.indexOf('\n---', 3);
  if (end < 0) return {};
  const data = {};
  for (const line of src.slice(3, end).trim().split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2]);
  }
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function attr(value) { return esc(value); }
function route(a) { return `/article/${a.slug}`; }
function art(a) {
  const hasCustomEditorialImage = a.origin === 'automation'
    && typeof a.image === 'string'
    && a.image.trim()
    && !a.image.startsWith('/images/');
  return a.origin === 'automation' && !hasCustomEditorialImage ? `/generated/${a.slug}.svg` : a.image;
}
function kicker(a) { return `${a.section} · ${a.type}`; }
function upperKicker(a) { return `${a.section} · ${a.type}`.toUpperCase(); }

const published = readdirSync(articlesDir)
  .filter(x => x.endsWith('.md'))
  .map(name => {
    const slug = basename(name, '.md');
    const fm = parseFrontmatter(readFileSync(join(articlesDir, name), 'utf8'));
    return { slug, ...fm };
  })
  .filter(a => a.status === 'published');

const real = published
  .filter(a => a.origin === 'automation')
  .sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))
    || String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))
    || a.slug.localeCompare(b.slug));

if (!real.length) {
  console.log('No published automated stories yet; preserving v5.1 homepage demo slots.');
  process.exit(0);
}

let html = readFileSync(homePath, 'utf8');

function segmentReplace(startMarker, endMarker, transform) {
  const s = html.indexOf(startMarker);
  const e = html.indexOf(endMarker, s + startMarker.length);
  if (s < 0 || e < 0) return;
  html = html.slice(0, s) + transform(html.slice(s, e)) + html.slice(e);
}

function leadMarkup(a) {
  return `<article class="lead reveal" data-tilt data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}">
      <a class="media" href="${route(a)}"><span class="quick-chip">Open story</span><img src="${art(a)}" alt="${attr(a.imageAlt || `Editorial illustration for ${a.title}`)}"><span class="photo-credit">NUVELLUM / EDITORIAL ART</span></a>
      <div class="kicker">${esc(upperKicker(a))}</div>
      <h1><a href="${route(a)}">${esc(a.title)}</a></h1>
      <div class="dek">${esc(a.dek)}</div>
      <div class="meta">By ${esc(a.author)} · ${esc(a.readingTime)} read</div>
      <div class="hero-actions"><a class="btn-outline" href="${route(a)}">Read story</a><button class="btn-outline save-btn" data-save="${attr(a.title)}" data-cat="${attr(kicker(a))}">Save</button></div>
    </article>`;
}

function sideMarkup(a, withImage = true) {
  const media = withImage ? `<a class="media" href="${route(a)}"><span class="quick-chip">Open story</span><img src="${art(a)}" alt="${attr(a.imageAlt || `Editorial illustration for ${a.title}`)}"></a>` : '';
  return `<article class="side reveal interactive-story motion-story" tabindex="0" data-tilt data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}">${media}<div class="kicker">${esc(a.section.toUpperCase())}</div><h2><a href="${route(a)}">${esc(a.title)}</a></h2><p>${esc(a.dek)}</p><div class="card-tools"><span class="meta">${esc(a.readingTime)} read</span><button class="bookmark" data-save="${attr(a.title)}" data-cat="${attr(a.section)}">♡</button></div></article>`;
}

function latestMarkup(a) {
  const map = {technology:'tech',sports:'sport','film & tv':'screen',anime:'screen',gaming:'screen',culture:'culture',world:'world',science:'world',business:'world'};
  const fc = map[String(a.section||'').toLowerCase()] || 'world';
  return `<article class="latest-card interactive-story motion-story" tabindex="0" data-filter-cat="${fc}" data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}"><div class="kicker">${esc(a.section.toUpperCase())}</div><h3>${esc(a.title)}</h3><p>${esc(a.dek)}</p></article>`;
}

function storyCardMarkup(a) {
  return `<article class="story-card reveal interactive-story motion-story" tabindex="0" data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}"><a class="media" href="${route(a)}"><span class="quick-chip">Open story</span><img src="${art(a)}" alt="${attr(a.imageAlt || `Editorial illustration for ${a.title}`)}"></a><div class="kicker">${esc(a.type.toUpperCase())}</div><h3><a href="${route(a)}">${esc(a.title)}</a></h3><p>${esc(a.dek)}</p><div class="card-tools"><span class="meta">${esc(a.readingTime)} read</span><button class="bookmark" data-save="${attr(a.title)}" data-cat="${attr(a.section)}">♡</button></div></article>`;
}

function screenMarkup(a, kind) {
  const cls = kind === 'feature' ? 'feature reveal interactive-story motion-story' : 'mini reveal interactive-story motion-story';
  const p = kind === 'feature' ? `<p>${esc(a.dek)}</p>` : '';
  const saveText = kind === 'feature' ? '♡ Save' : '♡';
  return `<article class="${cls}" tabindex="0" data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}"><div class="media"><span class="quick-chip">Open story</span><img src="${art(a)}" alt="${attr(a.imageAlt || `Editorial illustration for ${a.title}`)}"></div><div class="kicker">${esc(a.section.toUpperCase())}</div><h3>${esc(a.title)}</h3>${p}<button class="bookmark" data-save="${attr(a.title)}" data-cat="${attr(a.section)}">${saveText}</button></article>`;
}

function opinionMarkup(a) {
  const initials = String(a.author||'N').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return `<article class="opinion reveal interactive-story motion-story" tabindex="0" data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}"><div class="avatar">${esc(initials)}</div><div><div class="kicker">${esc(a.type.toUpperCase())}</div><h3>${esc(a.title)}</h3><small>By ${esc(a.author)}</small></div></article>`;
}

const WORLD_MAP_PATHS = {
  'north-america': 'M62 126 L83 107 L98 87 L126 72 L163 64 L203 68 L236 78 L265 95 L294 111 L318 133 L305 156 L281 168 L270 190 L246 204 L213 211 L183 204 L161 190 L132 188 L110 174 L91 165 L78 146 Z M283 71 L301 56 L320 61 L327 79 L313 92 L292 88 Z',
  'latin-america-caribbean': 'M233 205 L254 210 L267 221 L282 226 L295 239 L299 256 L291 269 L282 267 L276 282 L280 300 L275 319 L267 339 L258 361 L246 388 L233 414 L222 391 L218 364 L218 336 L212 313 L214 288 L208 265 L214 242 L224 224 Z M304 229 L314 224 L324 226 L330 232 L320 237 L310 235 Z',
  'europe-central-asia': 'M397 122 L415 105 L443 96 L468 82 L491 88 L507 102 L525 96 L554 91 L586 94 L614 88 L648 94 L674 102 L702 108 L726 120 L716 138 L694 145 L674 155 L652 160 L626 157 L604 166 L575 165 L551 172 L523 166 L498 158 L474 162 L448 153 L429 144 L410 142 Z',
  'middle-east-north-africa': 'M396 177 L425 163 L456 158 L488 161 L514 170 L543 174 L571 181 L603 188 L629 198 L641 214 L627 230 L603 234 L586 247 L556 249 L529 242 L498 238 L468 229 L438 224 L415 211 L399 198 Z M620 212 L647 216 L668 229 L674 244 L660 252 L643 245 L629 232 Z',
  'sub-saharan-africa': 'M423 231 L454 225 L486 233 L515 240 L543 249 L560 264 L556 286 L548 307 L538 329 L526 353 L513 379 L495 399 L474 408 L455 391 L446 370 L435 347 L427 322 L420 298 L414 274 L415 252 Z',
  'south-asia': 'M636 202 L658 198 L680 204 L704 211 L721 225 L724 246 L715 266 L704 286 L691 306 L679 320 L665 307 L657 288 L649 269 L644 249 L638 229 Z',
  'east-asia': 'M694 132 L716 121 L742 114 L771 116 L798 123 L825 130 L849 144 L870 160 L876 179 L864 197 L847 210 L826 219 L802 222 L780 214 L760 206 L745 191 L729 180 L716 163 L705 150 Z M879 164 L891 158 L899 165 L896 177 L887 183 L881 176 Z',
  'southeast-asia-oceania': 'M743 221 L759 219 L776 226 L791 238 L804 252 L800 268 L787 279 L774 274 L764 262 L752 253 Z M799 281 L816 286 L831 297 L843 310 L835 321 L818 319 L807 308 Z M856 331 L879 326 L902 334 L927 348 L947 367 L960 390 L951 414 L925 426 L897 418 L875 404 L861 387 L851 367 Z'
};

function worldDeskMarkup(articles) {
  const grouped = storiesByRegion(articles);
  const ranked = [...REGIONS].sort((a,b) => (grouped.get(b.slug)?.length || 0) - (grouped.get(a.slug)?.length || 0));
  const initial = ranked[0] || REGIONS[0];

  const templateFor = region => {
    const stories = (grouped.get(region.slug) || []).slice(0, 2);
    const count = grouped.get(region.slug)?.length || 0;
    const storyMarkup = stories.length
      ? stories.map(story => `<a class="world-desk-headline" href="${route(story)}">${esc(story.title)}</a>`).join('')
      : '<span class="world-desk-empty">No current stories in this desk.</span>';
    return `<template data-world-desk-template="${region.slug}"><div class="world-desk-detail-top"><strong>${esc(region.label)}</strong><span>${count} ${count === 1 ? 'story' : 'stories'}</span></div>${storyMarkup}<a class="world-desk-explore" href="/world/${region.slug}">Explore desk →</a></template>`;
  };

  const map = REGIONS.map(region => {
    const count = grouped.get(region.slug)?.length || 0;
    const path = WORLD_MAP_PATHS[region.slug];
    return `<a href="/world/${region.slug}" data-world-region="${region.slug}" class="${region.slug === initial.slug ? 'is-active' : ''}" aria-label="${esc(region.label)}, ${count} ${count === 1 ? 'story' : 'stories'}"><path d="${path}"></path></a>`;
  }).join('');

  const initialTemplateStories = (grouped.get(initial.slug) || []).slice(0, 2);
  const initialCount = grouped.get(initial.slug)?.length || 0;
  const initialStories = initialTemplateStories.length
    ? initialTemplateStories.map(story => `<a class="world-desk-headline" href="${route(story)}">${esc(story.title)}</a>`).join('')
    : '<span class="world-desk-empty">No current stories in this desk.</span>';

  return `<section class="world-desk-card reveal" id="world-desk" aria-labelledby="worldDeskTitle">
    <div class="world-desk-heading"><div><div class="kicker">GLOBAL DISCOVERY</div><h2 id="worldDeskTitle">World Desk</h2></div><a href="/section/world">World →</a></div>
    <p class="world-desk-intro">Explore Nuvellum reporting by region.</p>
    <svg class="world-desk-map" viewBox="0 50 1000 410" aria-labelledby="worldDeskMapTitle">
      <title id="worldDeskMapTitle">Interactive world map. Choose a region to explore its Nuvellum coverage.</title>
      <g class="world-desk-atlas-lines" aria-hidden="true"><path d="M22 160 C240 138 760 138 978 160 M22 290 C240 312 760 312 978 290"></path></g>
      <g class="world-desk-regions">${map}</g>
    </svg>
    <div class="world-desk-detail" id="worldDeskDetail" aria-live="polite">
      <div class="world-desk-detail-top"><strong>${esc(initial.label)}</strong><span>${initialCount} ${initialCount === 1 ? 'story' : 'stories'}</span></div>
      ${initialStories}
      <a class="world-desk-explore" href="/world/${initial.slug}">Explore desk →</a>
    </div>
    <div class="world-desk-templates" hidden>${REGIONS.map(templateFor).join('')}</div>
  </section>`;
}

const WORLD_DESK_STYLE = `<style id="nuvellum-world-desk-style">
.world-desk-card{padding:17px 0 20px;border-bottom:1px solid var(--line)}
.world-desk-heading{display:flex;align-items:end;justify-content:space-between;gap:12px}
.world-desk-heading .kicker{margin:0 0 4px}
.world-desk-heading h2{font-family:var(--serif);font-size:30px;line-height:1;margin:0;font-weight:400}
.world-desk-heading>a,.world-desk-explore{font-size:9px;text-transform:uppercase;letter-spacing:.09em;font-weight:700;color:var(--ox)}
.world-desk-intro{font-family:var(--serif);font-size:13px;color:var(--muted);margin:8px 0 10px}
.world-desk-map{display:block;width:100%;height:auto;max-height:210px;background:transparent;border-block:1px solid var(--line);padding:7px 0}
.world-desk-atlas-lines path{fill:none;stroke:var(--line);stroke-width:1;stroke-dasharray:3 8;opacity:.35}
.world-desk-regions path{fill:var(--soft);stroke:var(--muted);stroke-width:1;vector-effect:non-scaling-stroke;transition:fill .2s ease,stroke .2s ease,opacity .2s ease;cursor:pointer}
.world-desk-regions a:hover path,.world-desk-regions a:focus path,.world-desk-regions a.is-active path{fill:var(--ox);stroke:var(--ox);opacity:.96}
.world-desk-regions a:focus{outline:none}
.world-desk-detail{display:grid;gap:6px;padding-top:11px}
.world-desk-detail-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.world-desk-detail-top strong{font-family:var(--serif);font-size:17px;font-weight:400}
.world-desk-detail-top span{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.world-desk-headline{font-family:var(--serif);font-size:13px;line-height:1.25;padding-top:5px;border-top:1px solid var(--line)}
.world-desk-headline:hover{color:var(--ox)}
.world-desk-empty{font-family:var(--serif);font-size:12px;color:var(--muted);padding-top:4px}
.world-desk-explore{justify-self:start;margin-top:2px}
body.night .world-desk-map{background:transparent}
@media(max-width:950px){.world-desk-card{align-self:start}.world-desk-map{max-height:245px}}
@media(max-width:650px){.world-desk-map{max-height:none}.world-desk-heading h2{font-size:32px}}
@media(prefers-reduced-motion:reduce){.world-desk-regions path{transition:none}}
</style>`;

const WORLD_DESK_SCRIPT = `<script id="nuvellum-world-desk-script">
(()=>{
  const desk=document.getElementById('world-desk');
  if(!desk)return;
  const detail=desk.querySelector('#worldDeskDetail');
  const links=[...desk.querySelectorAll('[data-world-region]')];
  const activate=slug=>{
    const template=desk.querySelector('template[data-world-desk-template="'+slug+'"]');
    if(template&&detail)detail.innerHTML=template.innerHTML;
    links.forEach(link=>link.classList.toggle('is-active',link.dataset.worldRegion===slug));
  };
  links.forEach(link=>{
    link.addEventListener('mouseenter',()=>activate(link.dataset.worldRegion));
    link.addEventListener('focus',()=>activate(link.dataset.worldRegion));
  });
  const first=links.find(link=>link.classList.contains('is-active'))||links[0];
  if(first)activate(first.dataset.worldRegion);
})();
</script>`;

const worldReal = real.filter(a => String(a.section).toLowerCase() === 'world');
const screenReal = real.filter(a => ['film & tv','anime','gaming'].includes(String(a.section).toLowerCase()));
const opinionReal = real.filter(a => ['opinion','essay','ideas'].includes(String(a.type).toLowerCase()) || String(a.section).toLowerCase() === 'opinion');

const hero = worldReal[0] || real[0];
const sides = real.filter(a => a.slug !== hero.slug).slice(0,3);

segmentReplace('<section class="hero wrap">', '<section class="latest-band"', seg => {
  seg = seg.replace(/<article class="lead reveal"[\s\S]*?<\/article>/, leadMarkup(hero));
  let slot = 0;
  let storyIndex = 0;
  seg = seg.replace(/<article class="side reveal interactive-story motion-story"[\s\S]*?<\/article>/g, original => {
    const currentSlot = slot++;
    if (currentSlot === 1) return worldDeskMarkup(real);
    const a = sides[storyIndex++];
    return a ? sideMarkup(a, currentSlot === 0) : original;
  });
  return seg;
});

segmentReplace('<section class="latest-band"', '<section class="section wrap" id="world">', seg => {
  const chosen = real.slice(0,4);
  let i = 0;
  return seg.replace(/<article class="latest-card interactive-story motion-story"[\s\S]*?<\/article>/g, original => {
    const a = chosen[i++];
    return a ? latestMarkup(a) : original;
  });
});

if (worldReal.length) {
  segmentReplace('<section class="section wrap" id="world">', '<section class="dark-section" id="screen">', seg => {
    let i = 0;
    return seg.replace(/<article class="story-card reveal interactive-story motion-story"[\s\S]*?<\/article>/g, original => {
      const a = worldReal[i++];
      return a ? storyCardMarkup(a) : original;
    });
  });
}

if (screenReal.length) {
  segmentReplace('<section class="dark-section" id="screen">', '<section class="section wrap" id="opinion">', seg => {
    let i = 0;
    seg = seg.replace(/<article class="feature reveal interactive-story motion-story"[\s\S]*?<\/article>/, original => {
      const a = screenReal[i++];
      return a ? screenMarkup(a, 'feature') : original;
    });
    seg = seg.replace(/<article class="mini reveal interactive-story motion-story"[\s\S]*?<\/article>/g, original => {
      const a = screenReal[i++];
      return a ? screenMarkup(a, 'mini') : original;
    });
    return seg;
  });
}

if (opinionReal.length) {
  segmentReplace('<section class="section wrap" id="opinion">', '<section class="newsletter"', seg => {
    let i = 0;
    return seg.replace(/<article class="opinion reveal interactive-story motion-story"[\s\S]*?<\/article>/g, original => {
      const a = opinionReal[i++];
      return a ? opinionMarkup(a) : original;
    });
  });
}

html = html.replace(/(<a class="ticker-text" id="tickerText" href=")[^"]+("[^>]*>)[\s\S]*?(<\/a>)/, `$1${route(hero)}$2${esc(hero.title)}$3`);
const site = (process.env.SITE_URL || 'https://nuvellum.vercel.app').replace(/\/$/,'');
html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${site}${art(hero)}">`);
html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${site}${art(hero)}">`);

if (html.includes('id="world-desk"')) {
  html = html.replace('</head>', `${WORLD_DESK_STYLE}\n</head>`);
  html = html.replace('</body>', `${WORLD_DESK_SCRIPT}\n</body>`);
}

writeFileSync(homePath, html);
console.log(`Injected ${real.length} published automated stories into v5.1 homepage slots without changing layout CSS.`);
