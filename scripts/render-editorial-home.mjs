import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicDir } from './lib/paths.mjs';
import { REGIONS, storiesByRegion } from '../src/lib/geography.js';
import { WORLD_MAP_GROUPS } from '../src/lib/world-map-data.js';

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
// Supporting stories: the newest story from each of three different sections (not the hero's),
// topped up with the newest remaining stories if fewer sections are available.
const supporting = [];
for (const a of articles) {
  if (supporting.length === 3) break;
  if (a.slug === hero.slug) continue;
  if ([hero, ...supporting].some(s => s.section === a.section)) continue;
  supporting.push(a);
}
for (const a of articles) {
  if (supporting.length === 3) break;
  if (a.slug !== hero.slug && !supporting.includes(a)) supporting.push(a);
}
const onTop = new Set([hero.slug, ...supporting.map(a => a.slug)]);
const latest = articles.filter(a => !onTop.has(a.slug)).slice(0, 8);
const focus = world.find(a => a.slug !== hero.slug && String(a.type).toLowerCase() === 'analysis')
  || world.find(a => a.slug !== hero.slug)
  || articles.find(a => a.slug !== hero.slug)
  || hero;

const regionMap = storiesByRegion(articles);
const rankedRegions = [...REGIONS].sort((a,b) => (regionMap.get(b.slug)?.length || 0) - (regionMap.get(a.slug)?.length || 0));
const defaultRegion = rankedRegions.find(r => (regionMap.get(r.slug)?.length || 0) > 0) || rankedRegions[0];


function ageLabel(article) {
  const stamp = article.publishedAt || (article.date ? article.date + 'T12:00:00Z' : null);
  if (!stamp || Number.isNaN(Date.parse(stamp))) return article.date || '';
  const hours = Math.max(1, Math.round((Date.now() - Date.parse(stamp)) / 3600000));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.max(1, Math.round(hours / 24));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Only stories with a real publication timestamp get a relative age ("3 hours ago"); the page
// refreshes it in the browser so a cached build never shows a stale age. Date-only stories
// show their date instead of an invented time of day.
function stampOf(article) {
  return article.publishedAt && !Number.isNaN(Date.parse(article.publishedAt)) ? article.publishedAt : null;
}
function timeTag(article) {
  const stamp = stampOf(article);
  if (stamp) return `<time datetime="${attr(stamp)}" data-relative>${ageLabel(article)}</time>`;
  const d = article.date && !Number.isNaN(Date.parse(article.date)) ? new Date(article.date + 'T00:00:00Z') : null;
  return d ? `<time datetime="${attr(article.date)}">${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time>` : '';
}
function meta(article) {
  const parts = [timeTag(article), article.readingTime ? `${esc(article.readingTime)} read` : ''].filter(Boolean);
  return `<div class="story-meta">${parts.join(' <span>•</span> ')}</div>`;
}
const img = (article, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${art(article)}" alt="${attr(article.imageAlt || article.title)}" loading="lazy" decoding="async">`;
const BOOKMARK = '<svg viewBox="0 0 17 20" aria-hidden="true"><path d="M2 1.5h13v17l-6.5-5-6.5 5z"/></svg>';

function card(article) {
  return `<article class="support-card">
    <a class="support-image" href="${route(article)}" tabindex="-1" aria-hidden="true">${img(article)}<span class="chip">${esc(article.section)}</span></a>
    <div class="support-body">
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      ${meta(article)}
    </div>
  </article>`;
}

function latestRow(article) {
  return `<article class="latest-row">
    <a class="latest-thumb" href="${route(article)}" tabindex="-1" aria-hidden="true">${img(article)}</a>
    <div class="latest-copy">
      <div class="eyebrow">${esc(article.section)}</div>
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      ${meta(article)}
    </div>
    <button class="save-icon" type="button" data-save="${attr(article.title)}" data-url="${route(article)}" aria-pressed="false" aria-label="Save ${attr(article.title)}">${BOOKMARK}</button>
  </article>`;
}

// Truthful "Popular Reads" until real analytics exist: the most recent stories published in
// each window (no invented view counts). Each row shows its reading time.
const DAY = 86400000;
const buildNow = Date.now();
const ageMs = a => buildNow - Date.parse(stampOf(a) || (a.date ? a.date + 'T23:59:59Z' : 0));
const popularWindows = [['today', 'Today', DAY], ['week', 'This Week', 7 * DAY], ['month', 'This Month', 30 * DAY]]
  .map(([key, label, span]) => ({ key, label, items: articles.filter(a => ageMs(a) <= span).slice(0, 5) }));
const popularList = ({ key, items }, active) => `<div class="popular-list" role="tabpanel" id="popular-${key}" aria-labelledby="popular-tab-${key}"${active ? '' : ' hidden'}>${
  items.length ? items.map((a, i) => `<a class="popular-item" href="${route(a)}"><span class="popular-rank">${i + 1}</span><span class="popular-title">${esc(a.title)}</span><span class="popular-views">${esc(a.readingTime)} read</span></a>`).join('')
    : '<div class="popular-empty">No stories published in this period yet.</div>'}</div>`;
const firstPopular = popularWindows.find(w => w.items.length) || popularWindows[0];

// Screen & Play and Opinion & Ideas, from real published stories.
const SCREEN_SECTIONS = new Set(['film & tv', 'anime', 'gaming']);
const screen = articles.filter(a => SCREEN_SECTIONS.has(String(a.section).toLowerCase()) && !onTop.has(a.slug));
const screenLead = screen[0];
const screenSide = screen.slice(1, 5);
const opinions = articles.filter(a => String(a.section).toLowerCase() === 'opinion').slice(0, 3);
const initials = name => String(name || '').replace(/^By\s+/i, '').split(/[\s.]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');

const REGION_DESCRIPTIONS = {
  'north-america': 'In-depth coverage, analysis and the latest headlines from the United States, Canada and the wider region.',
  'latin-america-caribbean': 'In-depth coverage, analysis and the latest headlines from Latin America, the Caribbean and their global connections.',
  'europe-central-asia': 'In-depth coverage, analysis and the latest headlines from Europe, Central Asia and the institutions shaping the region.',
  'middle-east-north-africa': 'In-depth coverage, analysis and the latest headlines from the Middle East and North Africa.',
  'sub-saharan-africa': 'In-depth coverage, analysis and the latest headlines from across Sub-Saharan Africa.',
  'south-asia': 'In-depth coverage, analysis and the latest headlines from India, Pakistan, Bangladesh, Nepal and the wider region.',
  'east-asia': 'In-depth coverage, analysis and the latest headlines from across East Asia, including China, Japan, South Korea, Taiwan and the wider region.',
  'southeast-asia-oceania': 'In-depth coverage, analysis and the latest headlines from Southeast Asia, Australia, New Zealand and the Pacific.'
};

// Short names keep the summary kicker and button on one line, as in the reference.
const SHORT_REGION = {
  'north-america': 'North America',
  'latin-america-caribbean': 'Latin America',
  'europe-central-asia': 'Europe',
  'middle-east-north-africa': 'Middle East',
  'sub-saharan-africa': 'Africa',
  'south-asia': 'South Asia',
  'east-asia': 'East Asia',
  'southeast-asia-oceania': 'Southeast Asia'
};
const regionRow = (story, fromWorld = false) => `
    <a class="region-story${fromWorld ? ' is-fill' : ''}" href="${route(story)}">
      ${img(story)}
      <span><strong>${esc(story.title)}</strong><small>${fromWorld ? 'World desk · ' : ''}${timeTag(story)}</small></span>
    </a>`;

function regionTemplate(region) {
  const stories = (regionMap.get(region.slug) || []).slice(0, 3);
  const count = regionMap.get(region.slug)?.length || 0;
  const short = SHORT_REGION[region.slug] || region.label;
  // A desk with fewer than three stories is topped up with the latest World stories under an
  // explicit label, so the panel never opens on an empty area and never mislabels a story.
  const fill = world.filter(a => !stories.includes(a)).slice(0, 3 - stories.length);
  const list = stories.map(s => regionRow(s)).join('') + fill.map(s => regionRow(s, true)).join('');
  return `<template data-region-template="${region.slug}">
    <div class="region-story-list">${list}</div>
    <aside class="region-summary">
      <div class="summary-kicker"><span aria-hidden="true">✦</span><span>${esc(short.toUpperCase())}</span></div>
      <small>${count ? `${count} stor${count === 1 ? 'y' : 'ies'} on this desk` : 'No stories on this desk yet'}</small>
      <p>${esc(REGION_DESCRIPTIONS[region.slug] || `In-depth coverage, analysis and the latest headlines from ${region.label}.`)}</p>
      <a href="/world/${region.slug}">Explore ${esc(short)} <span>→</span></a>
    </aside>
  </template>`;
}

const mapRegions = REGIONS.map(region => {
  const count = regionMap.get(region.slug)?.length || 0;
  const active = region.slug === defaultRegion.slug ? ' is-active' : '';
  const countries = (WORLD_MAP_GROUPS[region.slug] || []).map(country =>
    `<path d="${country.d}" data-country="${attr(country.name)}"></path>`
  ).join('');
  return `<a class="map-region${active}" href="/world/${region.slug}" data-region="${region.slug}" aria-label="${attr(region.label)}, ${count} stories">${countries}</a>`;
}).join('');

const TAB_LABELS = {
  'north-america': 'North America',
  'latin-america-caribbean': 'Latin America<br>&amp; Caribbean',
  'europe-central-asia': 'Europe',
  'middle-east-north-africa': 'Middle East &amp;<br>North Africa',
  'sub-saharan-africa': 'Sub-Saharan<br>Africa',
  'south-asia': 'South Asia',
  'east-asia': 'East Asia',
  'southeast-asia-oceania': 'Southeast Asia<br>&amp; Oceania'
};
const regionTabs = rankedRegions.map(region => {
  const active = region.slug === defaultRegion.slug ? ' is-active' : '';
  return `<button class="region-tab${active}" type="button" data-region-tab="${region.slug}" aria-label="${attr(region.label)}">${TAB_LABELS[region.slug] || esc(region.label)}</button>`;
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
  --paper:#f6f1e8;--paper2:#fbf8f1;--ink:#17120f;--muted:#71685f;--line:#d9d0c4;
  --burgundy:#76132b;--burgundy2:#8e1834;--black:#111113;--white:#fff;
  --serif:Georgia,'Times New Roman',serif;--sans:Arial,Helvetica,sans-serif;
  --shadow:0 8px 24px rgba(56,39,25,.08)
}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif)}
body.night{--paper:#141311;--paper2:#1b1917;--ink:#f4eee5;--muted:#b9aea3;--line:#3b3630;--black:#0b0b0c;--shadow:0 10px 28px rgba(0,0,0,.28)}
a{color:inherit;text-decoration:none}button,input{font:inherit}img{display:block;width:100%}.shell{width:min(1452px,calc(100% - 64px));margin:auto}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.site-header{background:var(--paper2);border-bottom:1px solid var(--line);position:relative;z-index:30}
.header-row{height:67px;display:grid;grid-template-columns:300px 1fr 300px;align-items:center;gap:24px}
.brand-zone{position:relative;width:286px;height:58px;display:flex;align-items:center;isolation:isolate}
.brand-monogram-home{position:absolute;left:0;top:50%;transform:translateY(-50%);display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;width:max-content;color:var(--burgundy);transition:opacity .22s ease,transform .32s cubic-bezier(.16,.8,.2,1);z-index:2}
.brand-monogram-mark{grid-row:1/3;position:relative;width:54px;height:54px;display:grid;place-items:center}
.brand-monogram-n{font:700 52px/.9 var(--serif);letter-spacing:-.08em}
.brand-monogram-star{position:absolute;right:-8px;top:0;font-size:17px;line-height:1;color:var(--burgundy);transform-origin:center}
.brand-tagline{font:italic 12px/1.05 var(--serif);color:var(--muted);align-self:start;margin-top:2px;white-space:nowrap}

.brand-expanded{position:absolute;left:0;top:50%;transform:translateY(-50%) translateX(-6px) scale(.985);width:276px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,transform .36s cubic-bezier(.16,.8,.2,1),visibility .22s;z-index:3}
.brand-wordmark{display:flex;align-items:flex-end;gap:1px;width:max-content;color:var(--burgundy)}
.brand-letter,.brand-home-star{display:inline-grid;place-items:center;position:relative;font:700 33px/.9 var(--serif);min-width:23px;height:37px;color:var(--burgundy);transform-origin:50% 80%;transition:color .18s ease,text-shadow .18s ease}
.brand-home-star{font-size:18px;min-width:20px;align-self:start;margin-top:-3px}
.brand-expanded-note{font:italic 10px/1 var(--serif);color:var(--muted);margin-top:5px;white-space:nowrap;letter-spacing:.01em}
.brand-zone:hover .brand-expanded,.brand-zone:focus-within .brand-expanded,.brand-zone.is-open .brand-expanded{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(-50%) translateX(0) scale(1)}
.brand-zone:hover .brand-monogram-home,.brand-zone:focus-within .brand-monogram-home,.brand-zone.is-open .brand-monogram-home{opacity:0;transform:translateY(-50%) translateX(-5px);pointer-events:none}
.brand-zone:hover .brand-letter,.brand-zone:focus-within .brand-letter,.brand-zone.is-open .brand-letter{animation:brandLetterReveal .45s cubic-bezier(.16,.8,.2,1) both;animation-delay:calc(var(--i) * 28ms)}
@keyframes brandLetterReveal{0%{opacity:0;transform:translateY(8px) rotateX(-34deg)}100%{opacity:1;transform:none}}
.brand-letter:focus-visible,.brand-home-star:focus-visible,.brand-monogram-home:focus-visible{outline:1px solid var(--burgundy);outline-offset:3px}
.brand-glyph{display:inline-block;transform-origin:50% 80%;will-change:transform}
.brand-letter-n:hover .brand-glyph,.brand-letter-n:focus-visible .brand-glyph{animation:brandN .34s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-u1:hover .brand-glyph,.brand-letter-u1:focus-visible .brand-glyph{animation:brandU1 .36s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-v:hover .brand-glyph,.brand-letter-v:focus-visible .brand-glyph{animation:brandV .36s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-e:hover .brand-glyph,.brand-letter-e:focus-visible .brand-glyph{animation:brandE .36s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-l1:hover .brand-glyph,.brand-letter-l1:focus-visible .brand-glyph{animation:brandL1 .36s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-l2:hover .brand-glyph,.brand-letter-l2:focus-visible .brand-glyph{animation:brandL2 .36s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-u2:hover .brand-glyph,.brand-letter-u2:focus-visible .brand-glyph{animation:brandU2 .38s cubic-bezier(.16,.8,.2,1) both}
.brand-letter-m:hover .brand-glyph,.brand-letter-m:focus-visible .brand-glyph{animation:brandM .38s cubic-bezier(.16,.8,.2,1) both}
.brand-home-star:hover .brand-glyph,.brand-home-star:focus-visible .brand-glyph{animation:brandStar .40s cubic-bezier(.16,.8,.2,1) both}
@keyframes brandN{0%{transform:none}55%{transform:translateY(-5px) skewX(-5deg) scale(1.06);text-shadow:5px 0 0 rgba(111,16,40,.12)}100%{transform:translateY(-2px) skewX(-1deg) scale(1.02)}}
@keyframes brandU1{0%{transform:none}55%{transform:translateY(-7px) scaleY(1.09)}100%{transform:translateY(-3px) scale(1.03)}}
@keyframes brandV{0%{transform:none}55%{transform:perspective(120px) rotateY(-13deg) translateY(-6px) scale(1.06)}100%{transform:perspective(120px) rotateY(-3deg) translateY(-2px) scale(1.02)}}
@keyframes brandE{0%{transform:none}50%{transform:translate(3px,-5px) scaleX(1.07);text-shadow:-4px 0 0 rgba(111,16,40,.10)}100%{transform:translate(1px,-2px) scaleX(1.02)}}
@keyframes brandL1{0%{transform:none}55%{transform:translateY(-7px) rotate(-4deg) scale(1.05)}100%{transform:translateY(-3px) rotate(-1deg)}}
@keyframes brandL2{0%{transform:none}55%{transform:translateY(-7px) rotate(4deg) scale(1.05)}100%{transform:translateY(-3px) rotate(1deg)}}
@keyframes brandU2{0%{transform:none}45%{transform:translate(2px,-7px) rotateX(11deg) scale(1.05)}72%{transform:translate(-1px,-4px) rotateX(-4deg)}100%{transform:translateY(-2px)}}
@keyframes brandM{0%{transform:none}50%{transform:scaleX(.93) scaleY(1.09) translateY(-6px)}72%{transform:scaleX(1.05) translateY(-4px)}100%{transform:translateY(-2px) scale(1.02)}}
@keyframes brandStar{0%{transform:none}55%{transform:translateY(-5px) rotate(40deg) scale(1.16)}100%{transform:translateY(-2px) rotate(14deg) scale(1.05)}}

.main-nav{display:flex;justify-content:flex-start;gap:29px;font-size:16px;white-space:nowrap;padding-left:78px}.main-nav a{padding:6px 0;border-bottom:1px solid transparent;transition:color .18s,border-color .18s}.main-nav a:hover{color:var(--burgundy);border-bottom-color:var(--burgundy)}
.header-tools{display:flex;align-items:center;justify-content:flex-end;gap:14px}.icon-btn{border:0;background:transparent;color:inherit;cursor:pointer;padding:9px;display:grid;place-items:center;line-height:0;transition:color .18s}.icon-btn svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.icon-btn:hover{color:var(--burgundy)}.subscribe{border:0;background:var(--burgundy);color:#fff;padding:0 22px;height:39px;display:inline-grid;place-items:center;font-size:15px;cursor:pointer;margin-left:10px;transition:background .18s}.subscribe:hover{background:var(--burgundy2)}
.news-ticker{height:35px;background:#121214;color:#e9e3da;display:flex;align-items:center}.ticker-inner{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:40px;font-size:12.5px}.latest-label{color:#cf5f78;text-transform:uppercase;letter-spacing:.12em;font-family:var(--sans);font-size:10px;display:flex;align-items:center;gap:12px}.latest-label:before{content:"";width:6px;height:6px;border-radius:50%;background:#b8284a}.ticker-links{display:flex;align-items:center;gap:18px;overflow:hidden;white-space:nowrap;min-width:0;-webkit-mask-image:linear-gradient(90deg,#000 93%,transparent);mask-image:linear-gradient(90deg,#000 93%,transparent)}.ticker-links a{opacity:.8;font-size:12px;flex:0 0 auto;max-width:44ch;overflow:hidden;text-overflow:ellipsis}.ticker-links a:hover{opacity:1;color:#fff}.ticker-dot{opacity:.45;flex:none;font-size:9px}.view-all{color:#e9e3da;white-space:nowrap;font-size:12.5px}.view-all:hover{color:#fff}
.home-layout{display:grid;grid-template-columns:minmax(0,854fr) minmax(0,591fr);gap:7px;padding:11px 0 8px}.left-col,.right-col{min-width:0}.right-col{display:grid;gap:9px;align-content:start}
.hero{position:relative;height:465px;overflow:hidden;background:#17120f}.hero>a{display:block;height:100%}.hero img{width:100%;height:100%;object-fit:cover;filter:saturate(.82) contrast(1.02) brightness(.78);transition:transform .9s cubic-bezier(.16,.8,.2,1)}.hero:hover img{transform:scale(1.012)}.hero:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(5,5,5,.62) 0%,rgba(5,5,5,.18) 64%,rgba(5,5,5,.06)),linear-gradient(0deg,rgba(5,5,5,.72) 0%,transparent 60%)}.hero-copy{position:absolute;z-index:2;left:28px;right:28px;bottom:34px;color:#fff;max-width:585px}.hero-kicker{display:inline-block;background:#6f1028;padding:5px 8px 4px;font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.1em}.hero h1{font-size:40px;line-height:1.02;font-weight:400;margin:22px 0 14px;letter-spacing:-.005em;max-width:525px}.hero-dek{font-size:17.5px;line-height:1.34;color:#e3dbd2;max-width:548px}.story-meta{font-family:var(--serif);font-size:13px;color:var(--muted);margin-top:12px}.hero .story-meta{color:#d9d0c7;margin-top:18px}.story-meta span{padding:0 7px;font-size:9px;position:relative;top:-1px}
.support-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}.support-card{background:var(--paper2);border:1px solid var(--line);display:flex;flex-direction:column}.support-image{position:relative;display:block;overflow:hidden}.support-image img{height:124px;object-fit:cover;transition:transform .7s cubic-bezier(.16,.8,.2,1)}.support-card:hover .support-image img{transform:scale(1.03)}.support-image .chip{position:absolute;left:10px;bottom:6px}.chip{display:inline-block;background:#5b0e22;color:#fff;font-family:var(--sans);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:4px 7px 3px;line-height:1.3}.support-body{padding:10px 13px 11px;display:flex;flex-direction:column;flex:1}.eyebrow{font-family:var(--sans);font-size:9.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--burgundy)}.support-card h3{font-size:18px;line-height:1.16;margin:0 0 auto;font-weight:400;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.support-card h3 a:hover,.latest-copy h3 a:hover,.focus-copy h3 a:hover,.popular-item:hover .popular-title{color:var(--burgundy)}.support-card .story-meta{margin-top:12px;line-height:16px}
.panel{background:var(--paper2);border:1px solid var(--line);padding:8px 11px 8px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 2px 7px}.panel-head h2{font-size:26px;line-height:1;color:var(--burgundy);margin:0;font-weight:400}.panel-head h2:before{content:"✦";font-size:19px;margin-right:11px;position:relative;top:-3px}.panel-link{font-size:12px;color:var(--burgundy)}.panel-link:hover{text-decoration:underline}
.world-map-wrap{position:relative;background:#18171a;height:212px;overflow:hidden}.world-map{width:100%;height:100%;display:block}.world-map .atlas{fill:none;stroke:#4a4647;stroke-width:1;opacity:.2}.map-region path{fill:#67625e;stroke:#948e89;stroke-width:.5;vector-effect:non-scaling-stroke;transition:fill .18s ease,stroke .18s ease}.map-region:hover path,.map-region:focus path{fill:#6c1a2e;stroke:#b44a63}.map-region.is-active path{fill:#7e1631;stroke:#c05a72}.map-region{outline:none;cursor:pointer}.map-tooltip{position:absolute;background:#1c1a1b;color:#fff;border:1px solid #6a6164;padding:7px 11px;font-family:var(--serif);font-size:11px;pointer-events:none;opacity:0;transform:translate(-50%,-120%);transition:opacity .12s;box-shadow:0 4px 12px rgba(0,0,0,.32)}.map-tooltip strong{display:block;font-size:13px;font-weight:400}.map-tooltip span{display:block;color:#c8c0ba;margin-top:2px}
.region-tabs{display:grid;grid-template-columns:repeat(8,1fr);border-bottom:1px solid var(--line);margin-top:3px}.region-tab{min-height:33px;border:0;border-right:1px solid var(--line);background:transparent;color:inherit;padding:3px 2px;font-size:9.5px;line-height:1.2;cursor:pointer;display:grid;place-items:center;text-align:center;transition:background .18s,color .18s}.region-tab:last-child{border-right:0}.region-tab:hover{color:var(--burgundy)}.region-tab.is-active{background:var(--burgundy);color:#fff}.region-tab:focus-visible{outline:2px solid var(--burgundy);outline-offset:-2px}
.region-detail{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(170px,1fr);gap:22px;padding:14px 6px 0;min-height:233px}.region-story-list{display:grid;align-content:start}.region-story{display:grid;grid-template-columns:95px 1fr;gap:12px;padding:6px 0 6px;border-bottom:1px solid var(--line)}.region-story:last-child{border-bottom:0}.region-story img{width:95px;height:60px;object-fit:cover}.region-story strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14.5px;line-height:1.17;font-weight:400}.region-story:hover strong{color:var(--burgundy)}.region-story small{display:block;font-size:11px;color:var(--muted);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.region-story>span{min-width:0}.region-summary{border-left:1px solid var(--line);padding:4px 0 4px 24px;display:flex;flex-direction:column}.region-summary a{margin-top:auto!important}.region-summary p{margin-bottom:14px!important}.summary-kicker{display:grid;grid-template-columns:22px 1fr;font-family:var(--sans);font-size:12px;line-height:1.3;color:var(--burgundy);letter-spacing:.1em}.region-summary>small{display:block;margin:4px 0 14px 22px;color:var(--muted);font-size:11px}.region-summary p{color:var(--muted);font-size:14px;line-height:1.22;margin:0}.region-summary a{display:flex;align-items:center;justify-content:center;gap:14px;background:var(--burgundy);color:#fff;padding:10px 14px;margin-top:17px;white-space:nowrap;font-size:13px;transition:background .18s}.region-summary a:hover{background:var(--burgundy2)}.region-empty{font-size:13px;color:var(--muted);padding:20px 6px}
.section-block{margin-top:16px}.right-col .section-block{margin-top:0;background:var(--paper2);border:1px solid var(--line);padding:4px 18px 8px}.right-col .section-title{padding:4px 0 6px}.section-title{display:flex;align-items:center;gap:18px;padding:6px 0 7px}.section-title h2{font-size:27px;line-height:1;color:var(--burgundy);font-weight:400;margin:0}.section-title .rule{height:1px;background:var(--burgundy);opacity:.55;flex:1}.section-title a{font-size:12px;color:var(--burgundy);white-space:nowrap}.section-title a:hover{text-decoration:underline}
.latest-row{display:grid;grid-template-columns:162px 1fr auto;align-items:center;gap:17px;padding:6px 0;border-bottom:1px solid var(--line)}.latest-thumb{overflow:hidden}.latest-thumb img{height:70px;object-fit:cover}.latest-copy h3{font-size:17px;font-weight:400;line-height:1.2;margin:5px 0 6px}.latest-copy .story-meta{margin-top:0;font-size:12.5px}.save-icon{border:0;background:none;color:inherit;cursor:pointer;padding:10px;line-height:0}.save-icon svg{width:17px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round}.save-icon:hover,.save-icon.saved{color:var(--burgundy)}.save-icon.saved svg{fill:currentColor}
.popular-head{display:flex;align-items:center;gap:18px}.popular-head h2{font-size:28px;line-height:1;color:var(--burgundy);font-weight:400;margin:0;white-space:nowrap}.popular-head .rule{height:1px;background:var(--burgundy);opacity:.55;flex:0 1 120px;min-width:20px;margin-right:auto}.popular-tabs{display:flex;gap:18px;font-size:12.5px;white-space:nowrap;flex:none}.popular-tabs button{border:0;border-bottom:2px solid transparent;background:none;color:inherit;padding:8px 6px 6px;cursor:pointer}.popular-tabs button[aria-selected="true"]{color:var(--burgundy);border-bottom-color:var(--burgundy)}.popular-list{margin-top:4px}.popular-item{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:14px;align-items:baseline;padding:4px 0 5px;border-top:1px solid var(--line);font-size:15px;line-height:1.3}.popular-item:first-child{border-top:0}.popular-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.popular-rank{text-align:center}.popular-views{font-size:12px;color:var(--muted);white-space:nowrap}.popular-empty{font-size:13px;color:var(--muted);padding:10px 0}
.focus-card{display:grid;grid-template-columns:255fr 284fr;gap:15px;padding:2px 0 8px}.focus-card img{height:115px;object-fit:cover}.focus-copy .chip{margin-right:6px;vertical-align:3px}.focus-copy h3{display:inline;font-size:16.5px;line-height:1.2;font-weight:400}.focus-copy p{font-size:12.5px;line-height:1.35;color:var(--muted);margin:8px 0 0}.focus-copy .story-meta{font-size:12px;margin-top:10px}
.screen{background:#121214;color:#efe9e0;margin-top:30px;padding:26px 0 40px}.screen .section-title h2{color:#f3ede4}.screen .section-title .rule{background:#8a1b36;opacity:1}.screen .section-title a{color:#d8a3b0}.screen-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:30px;margin-top:6px}.screen-lead-media{display:block;overflow:hidden}.screen-lead img{height:372px;object-fit:cover;filter:saturate(.9) brightness(.92);transition:transform .9s cubic-bezier(.16,.8,.2,1)}.screen-lead:hover img{transform:scale(1.012)}.screen .chip{background:#8a1b36;margin-top:18px}.screen-lead h3{font-size:34px;line-height:1.08;font-weight:400;margin:12px 0 10px;max-width:780px}.screen-lead p{color:#bdb4aa;font-size:16px;line-height:1.45;max-width:700px;margin:0}.screen .story-meta{color:#9d948a}.screen .eyebrow{color:#d8a3b0}.screen-side{display:grid;align-content:start;border-left:1px solid #2f2b2d;padding-left:30px}.screen-item{display:grid;grid-template-columns:150px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid #2f2b2d}.screen-item:first-child{padding-top:0}.screen-item:last-child{border-bottom:0}.screen-item img{height:92px;object-fit:cover}.screen-item h4{font-size:18px;line-height:1.2;font-weight:400;margin:6px 0 0}.screen-item .story-meta{margin-top:8px;font-size:12px}.screen-lead h3 a:hover,.screen-item:hover h4{color:#fff;text-decoration:underline;text-decoration-color:#8a1b36;text-underline-offset:4px}
.opinion-sec{padding:26px 0 40px}.opinion-grid{display:grid;grid-template-columns:repeat(3,1fr)}.opinion-col{padding:10px 26px 4px;border-left:1px solid var(--line);display:grid;grid-template-columns:46px 1fr;gap:16px;align-content:start}.opinion-col:first-child{border-left:0;padding-left:0}.opinion-avatar{width:46px;height:46px;border-radius:50%;border:1px solid var(--burgundy);color:var(--burgundy);display:grid;place-items:center;font-size:14px;letter-spacing:.05em}.opinion-col h3{font-size:21px;line-height:1.18;font-weight:400;margin:6px 0 8px}.opinion-col h3 a:hover{color:var(--burgundy)}.opinion-col p{font-size:14px;line-height:1.42;color:var(--muted);margin:0 0 10px}.opinion-by{font-size:13px;font-style:italic}
.newsletter{background:#5b0e22;color:#fff;padding:40px 0}.newsletter-in{display:grid;grid-template-columns:1.15fr 1fr;gap:48px;align-items:center}.newsletter .kicker{font-family:var(--sans);font-size:10px;letter-spacing:.16em;color:#e8c3cc;text-transform:uppercase}.newsletter h2{font-size:38px;line-height:1.08;font-weight:400;margin:10px 0 0}.signup{display:grid;grid-template-columns:1fr auto;max-width:520px;width:100%;justify-self:end}.signup input{height:46px;border:1px solid rgba(255,255,255,.5);border-right:0;background:rgba(255,255,255,.06);color:#fff;padding:0 14px;font-size:15px;min-width:0}.signup input::placeholder{color:#e2c5cc}.signup input:focus{outline:2px solid #fff;outline-offset:-2px}.signup button{height:46px;border:0;background:#fbf8f1;color:#5b0e22;padding:0 22px;font-size:15px;cursor:pointer}.signup button:hover{background:#fff}.signup-msg{grid-column:1/-1;font-size:13px;color:#ecd0d6;margin-top:10px;min-height:1.3em}
.footer{background:#111113;color:#e9e2d8;padding:44px 0 22px}.footer-top{display:grid;grid-template-columns:1.1fr 3fr;gap:44px}.footer-brand{font-size:30px;letter-spacing:.05em;color:#fbf8f1}.footer-brand span{color:#b8284a;font-size:.55em;vertical-align:top;margin-left:6px}.footer-tag{font-style:italic;color:#a79d93;margin-top:6px;font-size:14px}.footer-about{color:#8f867d;font-size:13px;line-height:1.55;margin-top:16px;max-width:300px}.footer-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}.footer-cols h3{font-family:var(--sans);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#cf5f78;font-weight:400;margin:4px 0 10px;padding-bottom:9px;border-bottom:1px solid #2c292a}.footer-cols a{display:block;font-size:14px;padding:4px 0}.footer-cols a:hover{color:#fff;text-decoration:underline;text-decoration-color:#8a1b36;text-underline-offset:3px}.footer-bottom{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:36px;padding-top:16px;border-top:1px solid #2c292a;font-size:12px;color:#8f867d}
.search-sheet{position:fixed;inset:0;z-index:100;background:rgba(10,10,10,.55);display:none;place-items:start center;padding-top:110px}.search-sheet.open{display:grid}.search-box{width:min(800px,calc(100% - 30px));background:var(--paper2);padding:22px;border:1px solid var(--line);box-shadow:0 30px 80px rgba(0,0,0,.25)}.search-box input{width:100%;border:0;border-bottom:2px solid var(--ink);background:transparent;color:inherit;font-size:28px;padding:8px 0;outline:0}.search-results{margin-top:14px;display:grid;max-height:55vh;overflow:auto}.search-result{padding:11px 0;border-bottom:1px solid var(--line)}.search-result small{color:var(--burgundy);text-transform:uppercase;font-family:var(--sans);font-size:9px}.search-result strong{display:block;font-size:17px;font-weight:400;margin-top:3px}
@media(max-width:1180px){.shell{width:min(100% - 32px,1500px)}.header-row{grid-template-columns:250px 1fr 240px}.main-nav{gap:18px;font-size:15px;justify-content:center;padding-left:0}.home-layout{grid-template-columns:1.3fr 1fr}.hero h1{font-size:36px}.region-tabs{grid-template-columns:repeat(4,1fr)}.region-tab:nth-child(4n){border-right:0}.region-tab:nth-child(-n+4){border-bottom:1px solid var(--line)}.screen-lead img{height:340px}}
@media(max-width:900px){.header-row{height:auto;grid-template-columns:minmax(190px,1fr) auto;padding:14px 0 0}.main-nav{grid-column:1/-1;order:3;justify-content:flex-start;padding-left:0;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none}.home-layout{grid-template-columns:1fr}.support-grid{grid-template-columns:1fr 1fr}.support-card:last-child{grid-column:1/-1}.hero{height:430px}.screen-grid{grid-template-columns:1fr}.screen-side{border-left:0;padding-left:0}.screen-item:first-child{padding-top:16px;border-top:1px solid #2f2b2d}.opinion-grid{grid-template-columns:1fr}.opinion-col,.opinion-col:first-child{border-left:0;padding:16px 0;border-top:1px solid var(--line)}.newsletter-in{grid-template-columns:1fr;gap:22px}.signup{justify-self:start}.footer-top{grid-template-columns:1fr;gap:28px}.footer-cols{grid-template-columns:repeat(2,1fr)}}
@media(max-width:620px){.header-row{grid-template-columns:auto minmax(0,1fr);gap:6px}.header-tools{gap:0}.icon-btn{padding:6px}.icon-btn svg{width:20px;height:20px}.subscribe{padding:0 10px;height:34px;font-size:13px;margin-left:2px}.main-nav{gap:17px;font-size:14px;min-width:0}.ticker-inner{grid-template-columns:auto minmax(0,1fr);gap:16px}.view-all{display:none}.hero{height:440px}.hero-copy{left:18px;right:18px;bottom:22px}.hero h1{font-size:30px;margin:14px 0 10px}.hero-dek{font-size:15px}.support-grid{grid-template-columns:1fr}.support-card:last-child{grid-column:auto}.support-card{display:grid;grid-template-columns:130px 1fr}.support-image img{height:100%;min-height:110px}.region-detail{grid-template-columns:1fr}.region-summary{border-left:0;border-top:1px solid var(--line);padding:14px 0 4px}.region-tabs{grid-template-columns:repeat(2,1fr)}.region-tab{min-height:44px;border-bottom:1px solid var(--line)}.region-tab:nth-child(2n){border-right:0}.world-map-wrap{height:190px}.latest-row{grid-template-columns:110px 1fr auto;gap:12px}.latest-thumb img{height:66px}.focus-card{grid-template-columns:1fr}.focus-card img{height:180px}.popular-head{flex-wrap:wrap;gap:4px 18px}.popular-head .rule{display:none}.popular-tabs{gap:8px}.popular-tabs button{min-height:40px}.screen-lead img{height:230px}.screen-lead h3{font-size:26px}.screen-item{grid-template-columns:110px 1fr}.screen-item img{height:72px}.screen-item h4{font-size:16px}.newsletter h2{font-size:28px}.footer-cols{gap:18px}.footer-cols a{padding:7px 0}}
@media(max-width:620px){.shell{width:min(100% - 20px,1500px)}.brand-zone{width:180px;height:52px}.brand-monogram-mark{width:45px;height:45px}.brand-monogram-n{font-size:44px}.brand-tagline{font-size:10px}.brand-expanded{left:0;width:246px;background:var(--paper2);padding:8px 10px;border:1px solid var(--line);box-shadow:var(--shadow)}.brand-letter{font-size:29px;min-width:20px}.brand-home-star{font-size:16px;min-width:20px}.brand-monogram-star{font-size:16px;right:-8px}.brand-expanded-note{font-size:9px}}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
}
</style>
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'Nuvellum',url:canonical,description})}</script>
</head>
<body data-home-version="nuvellum-editorial-home-v6">
<header class="site-header">
  <div class="shell header-row">
    <div class="brand-zone" id="brandZone">
      <a class="brand-monogram-home" id="brandMonogram" href="/" aria-label="Nuvellum home">
        <span class="brand-monogram-mark" aria-hidden="true"><span class="brand-monogram-n">N</span><span class="brand-monogram-star">✦</span></span>
        <span class="brand-tagline">Beyond the headline.</span>
      </a>
      <div class="brand-expanded" id="brandExpanded" aria-label="Nuvellum headline discovery">
        <div class="brand-wordmark"><a class="brand-letter brand-letter-n" style="--i:0" href="/headlines/n" aria-label="Browse headlines beginning with N"><span class="brand-glyph">N</span></a><a class="brand-letter brand-letter-u1" style="--i:1" href="/headlines/u" aria-label="Browse headlines beginning with U"><span class="brand-glyph">U</span></a><a class="brand-letter brand-letter-v" style="--i:2" href="/headlines/v" aria-label="Browse headlines beginning with V"><span class="brand-glyph">V</span></a><a class="brand-letter brand-letter-e" style="--i:3" href="/headlines/e" aria-label="Browse headlines beginning with E"><span class="brand-glyph">E</span></a><a class="brand-letter brand-letter-l1" style="--i:4" href="/headlines/l" aria-label="Browse headlines beginning with L"><span class="brand-glyph">L</span></a><a class="brand-letter brand-letter-l2" style="--i:5" href="/headlines/l" aria-label="Browse headlines beginning with L"><span class="brand-glyph">L</span></a><a class="brand-letter brand-letter-u2" style="--i:6" href="/headlines/u" aria-label="Browse headlines beginning with U"><span class="brand-glyph">U</span></a><a class="brand-letter brand-letter-m" style="--i:7" href="/headlines/m" aria-label="Browse headlines beginning with M"><span class="brand-glyph">M</span></a><a class="brand-home-star" href="/" aria-label="Nuvellum home"><span class="brand-glyph">✦</span></a></div>
        <div class="brand-expanded-note">Beyond the headline. · Browse reporting by initial</div>
      </div>
    </div>
    <nav class="main-nav" aria-label="Primary">
      <a href="/section/world">World</a><a href="/section/business">Business</a><a href="/section/technology">Technology</a>
      <a href="/section/culture">Culture</a><a href="/section/entertainment">Screen & Play</a><a href="/section/sports">Sports</a><a href="/section/opinion">Opinion</a>
    </nav>
    <div class="header-tools">
      <button class="icon-btn" id="searchOpen" type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></button>
      <button class="icon-btn" id="savedOpen" type="button" aria-label="Saved stories"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17L12 16l-5.5 4.5z"/></svg></button>
      <button class="icon-btn" id="themeToggle" type="button" aria-label="Toggle night reading" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg></button>
      <a class="subscribe" href="#newsletter">Subscribe</a>
    </div>
  </div>
</header>

<div class="news-ticker">
  <div class="shell ticker-inner">
    <div class="latest-label">Latest</div>
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
        ${meta(hero)}
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
        <svg class="world-map" viewBox="12 24 976 372" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Interactive World Desk map">
          <g class="atlas"><path d="M20 165 C260 140 740 140 980 165 M20 335 C260 360 740 360 980 335"></path></g>
          ${mapRegions}
        </svg>
        <div class="map-tooltip" id="mapTooltip"><strong></strong><span></span></div>
      </div>
      <div class="region-tabs">${regionTabs}</div>
      <div class="region-detail" id="regionDetail"></div>
      <div hidden>${REGIONS.map(regionTemplate).join('')}</div>
    </section>

    <section class="section-block popular" aria-labelledby="popular-heading">
      <div class="popular-head"><h2 id="popular-heading">Popular Reads</h2><span class="rule"></span><div class="popular-tabs" role="tablist" aria-label="Popular Reads period">${
        popularWindows.map(w => `<button type="button" role="tab" id="popular-tab-${w.key}" aria-controls="popular-${w.key}" aria-selected="${w === firstPopular}" tabindex="${w === firstPopular ? 0 : -1}" data-popular-tab="${w.key}">${w.label}</button>`).join('')
      }</div></div>
      ${popularWindows.map(w => popularList(w, w === firstPopular)).join('')}
    </section>

    <section class="section-block">
      <div class="section-title"><h2>In Focus</h2><span class="rule"></span><a href="/section/world">View all →</a></div>
      <article class="focus-card">
        <a href="${route(focus)}" tabindex="-1" aria-hidden="true">${img(focus)}</a>
        <div class="focus-copy"><span class="chip">${esc(focus.type)}</span><h3><a href="${route(focus)}">${esc(focus.title)}</a></h3><p>${esc(focus.dek)}</p>${meta(focus)}</div>
      </article>
    </section>
  </aside>
</main>

${screenLead ? `<section class="screen" id="screen-play" aria-labelledby="screen-heading">
  <div class="shell">
    <div class="section-title"><h2 id="screen-heading">Screen &amp; Play</h2><span class="rule"></span><a href="/section/entertainment">Film · Anime · Gaming &nbsp;→</a></div>
    <div class="screen-grid">
      <article class="screen-lead">
        <a class="screen-lead-media" href="${route(screenLead)}" tabindex="-1" aria-hidden="true">${img(screenLead)}</a>
        <span class="chip">${esc(screenLead.section)}</span>
        <h3><a href="${route(screenLead)}">${esc(screenLead.title)}</a></h3>
        <p>${esc(screenLead.dek)}</p>
        ${meta(screenLead)}
      </article>
      <div class="screen-side">${screenSide.map(a => `
        <a class="screen-item" href="${route(a)}">${img(a)}<span><span class="eyebrow">${esc(a.section)}</span><h4>${esc(a.title)}</h4>${meta(a)}</span></a>`).join('')}
      </div>
    </div>
  </div>
</section>` : ''}

${opinions.length ? `<section class="opinion-sec" id="opinion" aria-labelledby="opinion-heading">
  <div class="shell">
    <div class="section-title"><h2 id="opinion-heading">Opinion &amp; Ideas</h2><span class="rule"></span><a href="/section/opinion">All columns →</a></div>
    <div class="opinion-grid">${opinions.map(a => `
      <article class="opinion-col">
        <div class="opinion-avatar" aria-hidden="true">${esc(initials(a.author))}</div>
        <div>
          <div class="eyebrow">${esc(a.type)}</div>
          <h3><a href="${route(a)}">${esc(a.title)}</a></h3>
          <p>${esc(a.dek)}</p>
          ${a.author ? `<div class="opinion-by">By ${esc(String(a.author).replace(/^By\s+/i, ''))}</div>` : ''}
        </div>
      </article>`).join('')}
    </div>
  </div>
</section>` : ''}

<section class="newsletter" id="newsletter" aria-labelledby="newsletter-heading">
  <div class="shell newsletter-in">
    <div><div class="kicker">The Nuvellum Brief</div><h2 id="newsletter-heading">One intelligent read of the world.<br>Once a day.</h2></div>
    <form class="signup" id="signup" novalidate>
      <label class="sr-only" for="signupEmail">Email address</label>
      <input type="email" id="signupEmail" name="email" required autocomplete="email" placeholder="you@example.com">
      <button type="submit">Subscribe</button>
      <div class="signup-msg" id="signupMsg" role="status" aria-live="polite">No noise. Unsubscribe anytime.</div>
    </form>
  </div>
</section>

<footer class="footer">
  <div class="shell">
    <div class="footer-top">
      <div>
        <div class="footer-brand">NUVELLUM<span aria-hidden="true">✦</span></div>
        <div class="footer-tag">Beyond the headline.</div>
        <p class="footer-about">Independent international journalism, built for context.</p>
      </div>
      <nav class="footer-cols" aria-label="Footer">
        <div><h3>Sections</h3><a href="/section/world">World</a><a href="/section/business">Business</a><a href="/section/technology">Technology</a><a href="/section/science">Science</a><a href="/section/sports">Sports</a></div>
        <div><h3>Culture</h3><a href="/section/culture">Culture</a><a href="/section/entertainment">Screen &amp; Play</a><a href="/section/film-tv">Film &amp; TV</a><a href="/section/gaming">Gaming</a><a href="/section/opinion">Opinion</a></div>
        <div><h3>Nuvellum</h3><a href="/about">About</a><a href="/standards">Editorial Standards</a><a href="/corrections">Corrections</a><a href="/contact">Contact</a><a href="/latest">Latest</a></div>
        <div><h3>More</h3><a href="/advertise">Advertise &amp; Sponsorships</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/rss.xml">RSS</a></div>
      </nav>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} Nuvellum. Independent international media.</span><span>Browse by initial: <a href="/headlines/n">N</a> · <a href="/headlines/u">U</a> · <a href="/headlines/v">V</a> · <a href="/headlines/e">E</a> · <a href="/headlines/l">L</a> · <a href="/headlines/m">M</a></span></div>
  </div>
</footer>

<div class="search-sheet" id="searchSheet">
  <div class="search-box">
    <input id="searchInput" type="search" placeholder="Search Nuvellum…" autocomplete="off">
    <div class="search-results" id="searchResults"></div>
  </div>
</div>

<script id="nuvellum-editorial-home-v6">
(()=>{
  const body=document.body;
  const brandZone=document.getElementById('brandZone');
  const brandMonogram=document.getElementById('brandMonogram');
  const coarsePointer=window.matchMedia?.('(hover: none), (pointer: coarse)');
  const closeBrand=()=>brandZone?.classList.remove('is-open');
  brandMonogram?.addEventListener('click',e=>{
    if(coarsePointer?.matches && !brandZone?.classList.contains('is-open')){
      e.preventDefault();
      brandZone?.classList.add('is-open');
    }
  });
  document.addEventListener('pointerdown',e=>{
    if(coarsePointer?.matches && brandZone?.classList.contains('is-open') && !brandZone.contains(e.target)) closeBrand();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeBrand()});

  const theme=document.getElementById('themeToggle');
  try{if(localStorage.getItem('nuvellum-theme')==='night')body.classList.add('night')}catch{}
  const syncTheme=()=>theme?.setAttribute('aria-pressed',String(body.classList.contains('night')));syncTheme();
  theme?.addEventListener('click',()=>{body.classList.toggle('night');syncTheme();try{localStorage.setItem('nuvellum-theme',body.classList.contains('night')?'night':'day')}catch{}});

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
    const sync=()=>{try{const list=JSON.parse(localStorage.getItem(savedKey)||'[]');const on=list.some(x=>x&&x.title===btn.dataset.save);btn.classList.toggle('saved',on);btn.setAttribute('aria-pressed',String(on))}catch{}};
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
    link.addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();activate(slug)});
  });
  activate('${defaultRegion.slug}');

  const popTabs=[...document.querySelectorAll('[data-popular-tab]')];
  const selectPopular=tab=>{popTabs.forEach(t=>{const on=t===tab;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;const panel=document.getElementById(t.getAttribute('aria-controls'));if(panel)panel.hidden=!on})};
  popTabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>selectPopular(tab));
    tab.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const next=popTabs[(i+(e.key==='ArrowRight'?1:popTabs.length-1))%popTabs.length];selectPopular(next);next.focus()});
  });

  const relative=()=>document.querySelectorAll('time[data-relative]').forEach(el=>{
    const t=Date.parse(el.getAttribute('datetime'));if(Number.isNaN(t))return;
    const h=Math.max(1,Math.round((Date.now()-t)/3600000));
    el.textContent=h<24?h+' hour'+(h===1?'':'s')+' ago':(d=>d+' day'+(d===1?'':'s')+' ago')(Math.max(1,Math.round(h/24)));
  });
  relative();setInterval(relative,60000);

  // No newsletter backend is connected yet: say so plainly and store nothing.
  const signup=document.getElementById('signup');
  signup?.addEventListener('submit',e=>{
    e.preventDefault();
    const email=document.getElementById('signupEmail');const msg=document.getElementById('signupMsg');
    if(!email||!msg)return;
    if(!email.checkValidity()||!email.value.trim()){msg.textContent='Please enter a valid email address.';email.focus();return}
    msg.textContent='The Nuvellum Brief is not open for sign-ups yet. Your address was not stored.';
  });

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
})();
</script>
</body>
</html>`;

writeFileSync(homePath, html);
console.log(`Rendered editorial homepage v6 with ${articles.length} published stories.`);
