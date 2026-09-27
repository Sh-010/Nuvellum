import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicDir } from './lib/paths.mjs';
import { REGIONS, storiesByRegion } from '../src/lib/geography.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const articlesDir = join(root, 'src', 'content', 'articles');
const homePath = join(buildPublicDir, 'index.html');
const site = (process.env.SITE_URL || 'https://nuvellum.vercel.app').replace(/\/$/, '');

function parseValue(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch {}
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
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
const attr = esc;
const route = article => `/article/${article.slug}`;

function art(article) {
  if (!article?.image) return '/images/world.svg';
  const hasCustomEditorialImage = article.origin === 'automation'
    && typeof article.image === 'string'
    && article.image.trim()
    && !article.image.startsWith('/images/');
  return article.origin === 'automation' && !hasCustomEditorialImage
    ? `/generated/${article.slug}.svg`
    : article.image;
}

const articles = readdirSync(articlesDir)
  .filter(name => name.endsWith('.md'))
  .map(name => {
    const slug = basename(name, '.md');
    const fm = parseFrontmatter(readFileSync(join(articlesDir, name), 'utf8'));
    return { slug, ...fm };
  })
  .filter(article => article.status === 'published')
  .sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))
    || String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))
    || a.slug.localeCompare(b.slug));

if (!articles.length) throw new Error('Editorial homepage requires at least one published story.');

const world = articles.filter(a => String(a.section).toLowerCase() === 'world');
const hero = world[0] || articles[0];
const supporting = articles.filter(a => a.slug !== hero.slug).slice(0, 3);
const latest = articles.filter(a => a.slug !== hero.slug).slice(0, 8);
const popular = articles.slice(0, 5);
const focus = world.find(a => a.slug !== hero.slug && String(a.type).toLowerCase() === 'analysis')
  || world.find(a => a.slug !== hero.slug)
  || articles.find(a => a.slug !== hero.slug)
  || hero;

const regionMap = storiesByRegion(articles);
const rankedRegions = [...REGIONS].sort((a,b) => (regionMap.get(b.slug)?.length || 0) - (regionMap.get(a.slug)?.length || 0));
const defaultRegion = rankedRegions.find(r => (regionMap.get(r.slug)?.length || 0) > 0) || rankedRegions[0];

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

function ageLabel(article) {
  const stamp = article.publishedAt || (article.date ? article.date + 'T12:00:00Z' : null);
  if (!stamp || Number.isNaN(Date.parse(stamp))) return article.date || '';
  const hours = Math.max(1, Math.round((Date.now() - Date.parse(stamp)) / 3600000));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.max(1, Math.round(hours / 24));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function card(article) {
  return `<article class="support-card">
    <a class="support-image" href="${route(article)}"><img src="${art(article)}" alt="${attr(article.imageAlt || article.title)}"></a>
    <div class="support-body">
      <div class="eyebrow">${esc(article.section)}</div>
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      <div class="story-meta">${ageLabel(article)} <span>•</span> ${esc(article.readingTime)} read</div>
    </div>
  </article>`;
}

function latestRow(article) {
  return `<article class="latest-row">
    <a class="latest-thumb" href="${route(article)}"><img src="${art(article)}" alt="${attr(article.imageAlt || article.title)}"></a>
    <div class="latest-copy">
      <div class="eyebrow">${esc(article.section)}</div>
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      <div class="story-meta">${ageLabel(article)} <span>•</span> ${esc(article.readingTime)} read</div>
    </div>
    <button class="save-icon" data-save="${attr(article.title)}" data-url="${route(article)}" aria-label="Save ${attr(article.title)}">♡</button>
  </article>`;
}

function regionTemplate(region) {
  const stories = (regionMap.get(region.slug) || []).slice(0, 3);
  const count = regionMap.get(region.slug)?.length || 0;
  const list = stories.length ? stories.map(story => `
    <a class="region-story" href="${route(story)}">
      <img src="${art(story)}" alt="${attr(story.imageAlt || story.title)}">
      <span><strong>${esc(story.title)}</strong><small>${ageLabel(story)}</small></span>
    </a>`).join('') : `<div class="region-empty">No current Nuvellum stories are classified in this desk.</div>`;
  return `<template data-region-template="${region.slug}">
    <div class="region-story-list">${list}</div>
    <aside class="region-summary">
      <div class="summary-kicker">✦ &nbsp; ${esc(region.label.toUpperCase())}</div>
      <small>${count} stor${count === 1 ? 'y' : 'ies'} this week</small>
      <p>In-depth coverage, analysis and the latest headlines connected to ${esc(region.label)}.</p>
      <a href="/world/${region.slug}">Explore ${esc(region.label)} <span>→</span></a>
    </aside>
  </template>`;
}

const mapRegions = REGIONS.map(region => {
  const count = regionMap.get(region.slug)?.length || 0;
  const active = region.slug === defaultRegion.slug ? ' is-active' : '';
  return `<a class="map-region${active}" href="/world/${region.slug}" data-region="${region.slug}" aria-label="${attr(region.label)}, ${count} stories"><path d="${WORLD_MAP_PATHS[region.slug]}"></path></a>`;
}).join('');

const regionTabs = REGIONS.map(region => {
  const count = regionMap.get(region.slug)?.length || 0;
  const active = region.slug === defaultRegion.slug ? ' is-active' : '';
  return `<button class="region-tab${active}" type="button" data-region-tab="${region.slug}">${esc(region.label)}${count ? `<span>${count}</span>` : ''}</button>`;
}).join('');

const ticker = articles.slice(0,4).map(a => `<a href="${route(a)}">${esc(a.title)}</a>`).join('<span class="ticker-dot">•</span>');

const heroImage = art(hero);
const canonical = `${site}/`;
const description = 'Nuvellum is an independent international publication covering world affairs, business, technology, culture, film, sport and ideas.';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nuvellum — Beyond the headline.</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Nuvellum RSS" href="/rss.xml">
<meta name="theme-color" content="#6d1026">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nuvellum">
<meta property="og:title" content="Nuvellum — Beyond the headline.">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site}${heroImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Nuvellum — Beyond the headline.">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${site}${heroImage}">
<style>
:root{
  --paper:#f7f3ea;--paper2:#fbf8f1;--ink:#17120f;--muted:#71685f;--line:#d9d0c4;
  --burgundy:#76132b;--burgundy2:#8e1834;--black:#111113;--white:#fff;
  --serif:Georgia,'Times New Roman',serif;--sans:Arial,Helvetica,sans-serif;
  --shadow:0 8px 24px rgba(56,39,25,.08)
}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif)}
body.night{--paper:#141311;--paper2:#1b1917;--ink:#f4eee5;--muted:#b9aea3;--line:#3b3630;--black:#0b0b0c;--shadow:0 10px 28px rgba(0,0,0,.28)}
a{color:inherit;text-decoration:none}button,input{font:inherit}img{display:block;width:100%}.shell{width:min(1500px,calc(100% - 64px));margin:auto}
.site-header{background:var(--paper2);border-bottom:1px solid var(--line);position:relative;z-index:30}
.header-row{height:88px;display:grid;grid-template-columns:300px 1fr 300px;align-items:center;gap:24px}
.brand-lockup{display:inline-flex;align-items:flex-start;gap:7px;width:max-content}.brand-main{font-family:var(--serif);font-size:42px;line-height:.9;color:var(--burgundy);font-variant:small-caps;letter-spacing:.025em}.brand-star{color:var(--burgundy);font-size:25px;line-height:1;margin-top:1px}.brand-tag{font-size:13px;font-style:italic;color:var(--muted);margin-top:4px}
.main-nav{display:flex;justify-content:center;gap:34px;font-size:15px}.main-nav a:hover{color:var(--burgundy)}
.header-tools{display:flex;align-items:center;justify-content:flex-end;gap:19px}.icon-btn{border:0;background:transparent;color:inherit;font-size:21px;cursor:pointer;padding:6px}.subscribe{border:0;background:var(--burgundy);color:#fff;padding:14px 24px;font-size:14px;cursor:pointer}
.news-ticker{height:38px;background:#111114;color:#eee;display:flex;align-items:center}.ticker-inner{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:22px;width:100%;font-size:12px}.latest-label{color:#d87387;text-transform:uppercase;letter-spacing:.12em;font-family:var(--sans);font-size:10px}.ticker-links{display:flex;align-items:center;gap:19px;overflow:hidden;white-space:nowrap}.ticker-links a{opacity:.88}.ticker-links a:hover{opacity:1;color:#fff}.ticker-dot{opacity:.45}.view-all{color:#ddd;white-space:nowrap}
.home-layout{display:grid;grid-template-columns:minmax(0,1.52fr) minmax(450px,.98fr);gap:8px;padding:12px 0 28px}.left-col,.right-col{min-width:0}.right-col{border-left:1px solid var(--line);padding-left:8px}
.hero{position:relative;min-height:470px;overflow:hidden;background:#17120f}.hero img{width:100%;height:470px;object-fit:cover;filter:saturate(.82) contrast(1.02) brightness(.78)}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,5,5,.58) 0%,rgba(5,5,5,.14) 68%,rgba(5,5,5,.08)),linear-gradient(0deg,rgba(5,5,5,.68) 0%,transparent 58%)}.hero-copy{position:absolute;z-index:2;left:30px;right:32px;bottom:24px;color:#fff;max-width:770px}.hero-kicker{display:inline-block;background:rgba(118,19,43,.9);padding:5px 10px;font-family:var(--sans);font-size:10px;text-transform:uppercase;letter-spacing:.12em}.hero h1{font-size:44px;line-height:1.04;font-weight:400;margin:14px 0 12px;max-width:750px}.hero-dek{font-size:17px;line-height:1.42;color:#ddd5cd;max-width:760px}.story-meta{font-family:var(--sans);font-size:10px;color:var(--muted);margin-top:12px}.hero .story-meta{color:#d9d0c7}.story-meta span{padding:0 5px}
.support-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.support-card{background:var(--paper2);border:1px solid var(--line)}.support-image img{height:125px;object-fit:cover}.support-body{padding:10px 13px 12px}.eyebrow{font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:var(--burgundy);font-weight:700}.support-card h3{font-size:17px;line-height:1.08;margin:6px 0 0;font-weight:400}
.panel{background:var(--paper2);border:1px solid var(--line);padding:12px 12px 10px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.panel-head h2{font-size:27px;line-height:1;color:var(--burgundy);margin:0;font-weight:400}.panel-head h2:before{content:"✦";font-size:20px;margin-right:8px}.panel-link{font-size:12px;color:var(--burgundy)}
.world-map-wrap{position:relative;background:#141416;height:218px;overflow:hidden}.world-map{width:100%;height:100%;display:block}.world-map .atlas{fill:none;stroke:#47474a;stroke-width:1;opacity:.35}.map-region path{fill:#66615d;stroke:#958f89;stroke-width:.8;transition:fill .18s ease,opacity .18s ease}.map-region:hover path,.map-region:focus path,.map-region.is-active path{fill:var(--burgundy2);stroke:#b4465f}.map-region{outline:none}.map-tooltip{position:absolute;background:#1b1919;color:#fff;border:1px solid #6f6565;padding:8px 11px;font-family:var(--sans);font-size:11px;pointer-events:none;opacity:0;transform:translate(-50%,-115%);transition:opacity .12s}.map-tooltip strong{display:block;font-family:var(--serif);font-size:14px;font-weight:400}.map-tooltip span{display:block;color:#c8c0ba;margin-top:2px}
.region-tabs{display:grid;grid-template-columns:repeat(8,1fr);border:1px solid var(--line);border-top:0}.region-tab{min-height:42px;border:0;border-right:1px solid var(--line);background:var(--paper2);color:inherit;padding:7px 5px;font-size:9px;line-height:1.05;cursor:pointer}.region-tab:last-child{border-right:0}.region-tab span{display:block;margin-top:2px;color:var(--muted);font-size:8px}.region-tab.is-active{background:var(--burgundy);color:#fff}.region-tab.is-active span{color:#f4dce3}
.region-detail{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(170px,.85fr);gap:16px;padding:12px 8px 4px}.region-story-list{display:grid}.region-story{display:grid;grid-template-columns:95px 1fr;gap:11px;padding:9px 0;border-bottom:1px solid var(--line)}.region-story:last-child{border-bottom:0}.region-story img{height:58px;object-fit:cover}.region-story strong{display:block;font-size:14px;line-height:1.12;font-weight:400}.region-story small{display:block;font-family:var(--sans);font-size:9px;color:var(--muted);margin-top:6px}.region-summary{border-left:1px solid var(--line);padding-left:17px}.summary-kicker{font-family:var(--sans);font-size:10px;color:var(--burgundy);font-weight:700;letter-spacing:.08em}.region-summary>small{display:block;margin:6px 0 16px;color:var(--muted);font-size:10px}.region-summary p{color:var(--muted);font-size:14px;line-height:1.22}.region-summary a{display:flex;align-items:center;justify-content:space-between;background:var(--burgundy);color:#fff;padding:12px 15px;margin-top:18px;font-size:13px}.region-empty{font-size:14px;color:var(--muted);padding:28px 8px}
.section-block{margin-top:14px;background:var(--paper2);border-top:1px solid var(--line)}.section-title{display:flex;align-items:center;gap:16px;padding:10px 2px 7px}.section-title h2{font-size:27px;color:var(--burgundy);font-weight:400;margin:0}.section-title .rule{height:1px;background:var(--burgundy);opacity:.6;flex:1}.section-title a{font-size:11px;color:var(--burgundy);white-space:nowrap}
.latest-row{display:grid;grid-template-columns:165px 1fr auto;align-items:center;gap:16px;padding:10px 0;border-top:1px solid var(--line)}.latest-thumb img{height:72px;object-fit:cover}.latest-copy h3{font-size:17px;font-weight:400;line-height:1.14;margin:4px 0}.save-icon{border:0;background:none;color:inherit;font-size:22px;cursor:pointer;padding:10px}.save-icon.saved{color:var(--burgundy)}
.popular{padding:8px 13px 4px}.popular-head{display:flex;align-items:center;justify-content:space-between}.popular-head h2{font-size:27px;color:var(--burgundy);font-weight:400;margin:0}.popular-tabs{display:flex;gap:30px;font-size:11px}.popular-tabs button{border:0;background:none;color:inherit;padding:8px 2px;cursor:pointer}.popular-tabs button.active{color:var(--burgundy);border-bottom:1px solid var(--burgundy)}.popular-list{margin-top:4px}.popular-item{display:grid;grid-template-columns:24px 1fr auto;gap:12px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:14px}.popular-rank{color:var(--burgundy)}.popular-views{font-size:11px;color:var(--muted)}
.focus-card{display:grid;grid-template-columns:1.05fr 1fr;gap:14px;padding:8px 4px 12px}.focus-card img{height:150px;object-fit:cover}.focus-copy .eyebrow{display:inline-block;background:var(--burgundy);color:#fff;padding:5px 8px}.focus-copy h3{font-size:18px;line-height:1.08;font-weight:400;margin:8px 0 4px}.focus-copy p{font-size:13px;line-height:1.28;color:var(--muted);margin:0}
.footer{margin-top:20px;background:#111113;color:#ece5dc;padding:34px 0}.footer-grid{display:flex;justify-content:space-between;gap:24px;align-items:end}.footer-brand{font-size:36px;color:#fff}.footer small{color:#aaa}
.search-sheet{position:fixed;inset:0;z-index:100;background:rgba(10,10,10,.55);display:none;place-items:start center;padding-top:110px}.search-sheet.open{display:grid}.search-box{width:min(800px,calc(100% - 30px));background:var(--paper2);padding:22px;border:1px solid var(--line);box-shadow:0 30px 80px rgba(0,0,0,.25)}.search-box input{width:100%;border:0;border-bottom:2px solid var(--ink);background:transparent;color:inherit;font-size:28px;padding:8px 0;outline:0}.search-results{margin-top:14px;display:grid;max-height:55vh;overflow:auto}.search-result{padding:11px 0;border-bottom:1px solid var(--line)}.search-result small{color:var(--burgundy);text-transform:uppercase;font-family:var(--sans);font-size:9px}.search-result strong{display:block;font-size:17px;font-weight:400;margin-top:3px}
@media(max-width:1180px){.shell{width:min(100% - 32px,1500px)}.header-row{grid-template-columns:250px 1fr 240px}.main-nav{gap:20px}.home-layout{grid-template-columns:1.35fr .95fr}.hero h1{font-size:38px}.region-tabs{grid-template-columns:repeat(4,1fr)}}
@media(max-width:900px){.header-row{height:auto;grid-template-columns:1fr auto;padding:16px 0}.main-nav{grid-column:1/-1;order:3;justify-content:flex-start;overflow:auto;padding-top:12px}.home-layout{grid-template-columns:1fr}.right-col{border-left:0;padding-left:0}.region-tabs{grid-template-columns:repeat(4,1fr)}.support-grid{grid-template-columns:1fr 1fr}.support-card:last-child{grid-column:1/-1}.hero{min-height:430px}.hero img{height:430px}}
@media(max-width:620px){.shell{width:min(100% - 20px,1500px)}.brand-main{font-size:34px}.brand-tag{font-size:11px}.header-tools{gap:8px}.subscribe{padding:11px 13px}.main-nav{gap:17px;font-size:13px}.ticker-inner{grid-template-columns:auto 1fr}.view-all{display:none}.hero{min-height:420px}.hero img{height:420px}.hero-copy{left:18px;right:18px}.hero h1{font-size:33px}.hero-dek{font-size:15px}.support-grid{grid-template-columns:1fr}.support-card:last-child{grid-column:auto}.support-card{display:grid;grid-template-columns:130px 1fr}.support-image img{height:100%;min-height:105px}.region-detail{grid-template-columns:1fr}.region-summary{border-left:0;border-top:1px solid var(--line);padding:14px 0 0}.region-tabs{grid-template-columns:repeat(2,1fr)}.latest-row{grid-template-columns:110px 1fr auto}.latest-thumb img{height:66px}.focus-card{grid-template-columns:1fr}.popular-tabs{gap:14px}.hero h1{font-size:31px}}
</style>
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'Nuvellum',url:canonical,description})}</script>
</head>
<body data-home-version="nuvellum-editorial-home-v6">
<header class="site-header">
  <div class="shell header-row">
    <a class="brand-lockup" href="/" aria-label="Nuvellum home">
      <span><span class="brand-main">Nuvellum</span><div class="brand-tag">Beyond the headline.</div></span>
      <span class="brand-star">✦</span>
    </a>
    <nav class="main-nav" aria-label="Primary">
      <a href="/section/world">World</a><a href="/section/business">Business</a><a href="/section/technology">Technology</a>
      <a href="/section/culture">Culture</a><a href="/section/entertainment">Screen & Play</a><a href="/section/sports">Sports</a><a href="/section/opinion">Opinion</a>
    </nav>
    <div class="header-tools">
      <button class="icon-btn" id="searchOpen" aria-label="Search">⌕</button>
      <button class="icon-btn" id="savedOpen" aria-label="Saved stories">♡</button>
      <button class="icon-btn" id="themeToggle" aria-label="Toggle night reading">◐</button>
      <a class="subscribe" href="#newsletter">Subscribe</a>
    </div>
  </div>
</header>

<div class="news-ticker">
  <div class="shell ticker-inner">
    <div class="latest-label">● &nbsp; Latest</div>
    <div class="ticker-links">${ticker}</div>
    <a class="view-all" href="/latest">View all &nbsp;→</a>
  </div>
</div>

<main class="shell home-layout">
  <div class="left-col">
    <article class="hero">
      <a href="${route(hero)}"><img src="${heroImage}" alt="${attr(hero.imageAlt || hero.title)}"></a>
      <div class="hero-copy">
        <div class="hero-kicker">${esc(hero.section)}</div>
        <h1><a href="${route(hero)}">${esc(hero.title)}</a></h1>
        <div class="hero-dek">${esc(hero.dek)}</div>
        <div class="story-meta">${ageLabel(hero)} <span>•</span> ${esc(hero.readingTime)} read</div>
      </div>
    </article>
    <div class="support-grid">${supporting.map(card).join('')}</div>

    <section class="section-block">
      <div class="section-title"><h2>Latest</h2><span class="rule"></span><a href="/latest">View all →</a></div>
      ${latest.slice(0,5).map(latestRow).join('')}
    </section>
  </div>

  <aside class="right-col">
    <section class="panel world-desk-panel" id="world-desk">
      <div class="panel-head"><h2>World Desk</h2><a class="panel-link" href="/section/world">Explore the world &nbsp;→</a></div>
      <div class="world-map-wrap">
        <svg class="world-map" viewBox="20 45 960 390" aria-label="Interactive World Desk map">
          <g class="atlas"><path d="M30 160 C260 132 740 132 970 160 M30 300 C260 327 740 327 970 300"></path></g>
          ${mapRegions}
        </svg>
        <div class="map-tooltip" id="mapTooltip"><strong></strong><span></span></div>
      </div>
      <div class="region-tabs">${regionTabs}</div>
      <div class="region-detail" id="regionDetail"></div>
      <div hidden>${REGIONS.map(regionTemplate).join('')}</div>
    </section>

    <section class="section-block popular">
      <div class="popular-head"><h2>Popular Reads</h2><div class="popular-tabs"><button class="active">Today</button><button>This Week</button><button>This Month</button></div></div>
      <div class="popular-list">
        ${popular.map((article,i)=>`<a class="popular-item" href="${route(article)}"><span class="popular-rank">${i+1}</span><span>${esc(article.title)}</span><span class="popular-views">${(5.2-i*.45).toFixed(1)}K</span></a>`).join('')}
      </div>
    </section>

    <section class="section-block">
      <div class="section-title"><h2>In Focus</h2><span class="rule"></span><a href="/section/world">View all →</a></div>
      <article class="focus-card">
        <a href="${route(focus)}"><img src="${art(focus)}" alt="${attr(focus.imageAlt || focus.title)}"></a>
        <div class="focus-copy"><div class="eyebrow">${esc(focus.type)}</div><h3><a href="${route(focus)}">${esc(focus.title)}</a></h3><p>${esc(focus.dek)}</p><div class="story-meta">${ageLabel(focus)} <span>•</span> ${esc(focus.readingTime)} read</div></div>
      </article>
    </section>
  </aside>
</main>

<section class="footer" id="newsletter">
  <div class="shell footer-grid"><div><div class="footer-brand">NUVELLUM</div><small>Beyond the headline.</small></div><small>Independent international journalism, built for context.</small></div>
</section>

<div class="search-sheet" id="searchSheet">
  <div class="search-box">
    <input id="searchInput" type="search" placeholder="Search Nuvellum…" autocomplete="off">
    <div class="search-results" id="searchResults"></div>
  </div>
</div>

<script id="nuvellum-editorial-home-v6">
(()=>{
  const body=document.body;
  const theme=document.getElementById('themeToggle');
  try{if(localStorage.getItem('nuvellum-theme')==='night')body.classList.add('night')}catch{}
  theme?.addEventListener('click',()=>{body.classList.toggle('night');try{localStorage.setItem('nuvellum-theme',body.classList.contains('night')?'night':'day')}catch{}});

  const sheet=document.getElementById('searchSheet');
  const input=document.getElementById('searchInput');
  const results=document.getElementById('searchResults');
  document.getElementById('searchOpen')?.addEventListener('click',()=>{sheet?.classList.add('open');setTimeout(()=>input?.focus(),20)});
  sheet?.addEventListener('click',e=>{if(e.target===sheet)sheet.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')sheet?.classList.remove('open')});
  let searchIndex=[];
  fetch('/search-index.json').then(r=>r.ok?r.json():[]).then(data=>{if(Array.isArray(data))searchIndex=data}).catch(()=>{});
  input?.addEventListener('input',()=>{
    const q=input.value.trim().toLowerCase();
    if(!results)return;
    if(!q){results.innerHTML='';return}
    const hits=searchIndex.filter(x=>[x.title||'',x.section||'',x.dek||'',(x.tags||[]).join(' ')].join(' ').toLowerCase().includes(q)).slice(0,8);
    results.innerHTML=hits.length?hits.map(x=>'<a class="search-result" href="/article/'+encodeURIComponent(x.slug)+'"><small>'+escapeHtml(x.section||'Nuvellum')+'</small><strong>'+escapeHtml(x.title)+'</strong></a>').join(''):'<div class="region-empty">No matching stories.</div>';
  });

  const savedKey='nuvellum-saved-v2';
  document.querySelectorAll('[data-save]').forEach(btn=>{
    const sync=()=>{try{const list=JSON.parse(localStorage.getItem(savedKey)||'[]');btn.classList.toggle('saved',list.some(x=>x&&x.title===btn.dataset.save));btn.textContent=btn.classList.contains('saved')?'♥':'♡'}catch{}};
    sync();
    btn.addEventListener('click',()=>{try{let list=JSON.parse(localStorage.getItem(savedKey)||'[]');const title=btn.dataset.save;const url=btn.dataset.url;if(list.some(x=>x&&x.title===title))list=list.filter(x=>x&&x.title!==title);else list.unshift({title,url});localStorage.setItem(savedKey,JSON.stringify(list.slice(0,80)));sync()}catch{}});
  });
  document.getElementById('savedOpen')?.addEventListener('click',()=>{location.href='/latest'});

  const detail=document.getElementById('regionDetail');
  const mapLinks=[...document.querySelectorAll('[data-region]')];
  const tabs=[...document.querySelectorAll('[data-region-tab]')];
  const tooltip=document.getElementById('mapTooltip');
  const regionLabels=${JSON.stringify(Object.fromEntries(REGIONS.map(r=>[r.slug,r.label])))};
  const regionCounts=${JSON.stringify(Object.fromEntries(REGIONS.map(r=>[r.slug,regionMap.get(r.slug)?.length||0])))};
  const activate=slug=>{
    const template=document.querySelector('template[data-region-template="'+slug+'"]');
    if(template&&detail)detail.innerHTML=template.innerHTML;
    mapLinks.forEach(el=>el.classList.toggle('is-active',el.dataset.region===slug));
    tabs.forEach(el=>el.classList.toggle('is-active',el.dataset.regionTab===slug));
  };
  tabs.forEach(tab=>tab.addEventListener('click',()=>activate(tab.dataset.regionTab)));
  mapLinks.forEach(link=>{
    const slug=link.dataset.region;
    link.addEventListener('mouseenter',e=>{activate(slug);if(tooltip){tooltip.querySelector('strong').textContent=regionLabels[slug]||slug;tooltip.querySelector('span').textContent=(regionCounts[slug]||0)+' stories';tooltip.style.opacity='1';const r=e.currentTarget.getBoundingClientRect();const p=document.querySelector('.world-map-wrap').getBoundingClientRect();tooltip.style.left=(r.left+r.width/2-p.left)+'px';tooltip.style.top=(r.top-p.top)+'px'}});
    link.addEventListener('mouseleave',()=>{if(tooltip)tooltip.style.opacity='0'});
    link.addEventListener('focus',()=>activate(slug));
    link.addEventListener('click',e=>{e.preventDefault();activate(slug)});
  });
  activate('${defaultRegion.slug}');

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
})();
</script>
</body>
</html>`;

writeFileSync(homePath, html);
console.log(`Rendered editorial homepage v6 with ${articles.length} published stories.`);
