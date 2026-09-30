import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicDir } from './lib/paths.mjs';
import { REGIONS, storiesByRegion } from '../src/lib/geography.js';
import { WORLD_MAP_GROUPS, WORLD_MAP_VIEWBOX } from '../src/lib/world-map-data.js';
import { THEME_HEAD, THEME_BODY } from '../src/lib/theme-boot.js';
import { storyImage } from '../src/lib/story-image.js';
import { selectHome, loadPublished, LATEST_ROWS } from './lib/home-selection.mjs';

// Crop focus for backfilled article images (scripts/backfill-article-images.mjs).
const creditsFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'image-credits.json');
let IMAGE_CREDITS = {};
try { IMAGE_CREDITS = JSON.parse(readFileSync(creditsFile, 'utf8')); } catch {}
const focusAttr = (article) => { const c = IMAGE_CREDITS[article?.slug]; return c?.focus && c.path === article.image ? ` style="object-position:${c.focus}"` : ''; };

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const articlesDir = join(root, 'src', 'content', 'articles');
const homePath = join(buildPublicDir, 'index.html');
const site = (process.env.SITE_URL || 'https://nuvellum.vercel.app').replace(/\/$/, '');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
const attr = esc;
const route = article => `/article/${article.slug}`;

// The story's own image, or '' when it has none worth showing; such stories are set text-led
// (see TEXT-LED below) rather than dressed in section art that does not depict them.
const art = article => storyImage(article);

// Placement rules live in scripts/lib/home-selection.mjs (tested there). Every published story takes part,
// manual (Editorial Desk) and automated (newsroom) alike.
const { articles, world, hero, supporting, onTop, latestFilters, focusStories } = selectHome(loadPublished(articlesDir));
const [focusLead, ...focusSide] = focusStories;

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
const img = (article, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${art(article)}" alt="${attr(article.imageAlt || article.title)}"${focusAttr(article)} loading="lazy" decoding="async">`;
const BOOKMARK = '<svg viewBox="0 0 17 20" aria-hidden="true"><path d="M2 1.5h13v17l-6.5-5-6.5 5z"/></svg>';

// TEXT-LED: a story without an acceptable image keeps its slot but is set in type (section label,
// wine rule, standfirst) instead of a picture. Nothing stands in for the missing image.
const MARK = '<span class="tl-mark" aria-hidden="true">✦</span>';

function card(article) {
  if (!art(article)) return `<article class="support-card is-text">
    <a class="support-text" href="${route(article)}" tabindex="-1" aria-hidden="true"><span class="chip">${esc(article.section)}</span><span class="tl-dek">${esc(article.dek)}</span></a>
    <div class="support-body">
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      ${meta(article)}
    </div>
  </article>`;
  return `<article class="support-card">
    <a class="support-image" href="${route(article)}" tabindex="-1" aria-hidden="true">${img(article)}<span class="chip">${esc(article.section)}</span></a>
    <div class="support-body">
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      ${meta(article)}
    </div>
  </article>`;
}

function latestRow(article) {
  if (!art(article)) return `<article class="latest-row is-text">
    <div class="latest-copy">
      <div class="eyebrow">${esc(article.section)}<span class="tl-time"> · ${timeTag(article)}</span></div>
      <h3><a href="${route(article)}">${esc(article.title)}</a></h3>
      <p class="tl-dek">${esc(article.dek)}</p>
    </div>
    <button class="save-icon" type="button" data-save="${attr(article.title)}" data-url="${route(article)}" aria-pressed="false" aria-label="Save ${attr(article.title)}">${BOOKMARK}</button>
  </article>`;
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

// One filter's rows. The list reserves five row slots whatever it holds; a shorter set ends
// with a quiet pointer to the section instead of collapsing the column.
function latestSet(filter) {
  const rows = filter.items.map(latestRow).join('');
  if (filter.items.length >= LATEST_ROWS) return rows;
  const label = esc(filter.label);
  const note = filter.items.length
    ? `That is all the recent ${label} reporting.`
    : `No recent ${label} stories yet.`;
  return `${rows}<p class="latest-empty">${note} <a href="${filter.href}">Browse ${label} →</a></p>`;
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
    <a class="region-story${fromWorld ? ' is-fill' : ''}${art(story) ? '' : ' is-text'}" href="${route(story)}">
      ${art(story) ? img(story) : ''}
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

const maxRegionCount = Math.max(1, ...REGIONS.map(r => regionMap.get(r.slug)?.length || 0));
const mapRegions = REGIONS.map(region => {
  const count = regionMap.get(region.slug)?.length || 0;
  const active = region.slug === defaultRegion.slug ? ' is-active' : '';
  const heat = count === 0 ? 0 : count >= maxRegionCount * 0.6 ? 3 : count >= maxRegionCount * 0.3 ? 2 : 1;
  const countries = (WORLD_MAP_GROUPS[region.slug] || []).map(country =>
    `<path d="${country.d}" data-country="${attr(country.name)}"></path>`
  ).join('');
  return `<a class="map-region heat-${heat}${active}" href="/world/${region.slug}" data-region="${region.slug}" aria-label="${attr(region.label)}, ${count} stories">${countries}</a>`;
}).join('');

const TAB_LABELS = {
  'north-america': 'North<br>America',
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
  return `<button class="region-tab${active}" type="button" data-region-tab="${region.slug}" aria-label="${attr(region.label)}" aria-pressed="${active ? 'true' : 'false'}">${TAB_LABELS[region.slug] || esc(region.label)}</button>`;
}).join('');

const tickerItems = articles.slice(0,4);
const ticker = tickerItems.map(a => `<a href="${route(a)}">${esc(a.title)}</a>`).join('<span class="ticker-dot" aria-hidden="true">◆</span>');
const tickerClone = tickerItems.map(a => `<a href="${route(a)}" tabindex="-1" aria-hidden="true">${esc(a.title)}</a>`).join('<span class="ticker-dot" aria-hidden="true">◆</span>');

// Section reveal: one selector list shared by the stylesheet and the page script. The <head>
// enables it before first paint; if the page script never starts, a CSS failsafe shows
// everything after 2.5s, so no content can stay invisible.
// Homepage motion. Every story, image block and heading is its own reveal unit: it animates when
// it reaches ~15% above the bottom of the viewport, and units arriving together are staggered
// by their position on screen. Panels and section wrappers only fade briefly, so no section
// appears as one block. Nothing starts until the browser is painting smoothly after load
// (capped at 1.4s), because the first paint of this page blocks frames and would otherwise
// swallow the entrances.
// The World Desk panel is deliberately not faded: it holds the map's SVG texture filter, and
// fading it re-rasterises that filter every frame (a >1s freeze on load). Its stories animate instead.
const REVEAL_CONTAINERS = ['.latest-section', '.popular', '.in-focus-section', '.newsletter-in'].join(',');
const REVEAL_ITEMS = ['.support-card', '.latest-list .latest-row', '.popular-list .popular-item', '.focus-card', '.focus-mini',
  '.screen .section-title', '.screen-lead-media', '.screen-lead-panel', '.screen-lead>.chip', '.screen-lead>h3', '.screen-lead>p', '.screen-lead>.story-meta', '.screen-item',
  '.opinion-sec .section-title', '.opinion-col', '.footer-top>div:first-child', '.footer-cols>div', '.footer-bottom'].join(',');
// The newsletter band is observed but not faded: its parts run their own sequence.
const REVEAL_FADES = ['.latest-section', '.popular', '.in-focus-section', REVEAL_ITEMS].join(',');
const REVEAL_PARTS = '.newsletter-in :is(.kicker,h2,.signup,.signup-msg),.hero-copy>*,.hero img';
const REVEAL_IMAGES = '.screen-lead-media img';
const REVEAL_CSS = `html.motion-ready :is(${REVEAL_FADES}){opacity:0;translate:var(--from,0 12px);transition:opacity var(--dur,1s) var(--ease-enter) var(--stagger,0ms),translate var(--dur,1s) var(--ease-enter) var(--stagger,0ms),transform var(--t-hover) var(--ease),background-color var(--t-hover) ease,color var(--t-quick) ease}html.motion-ready :is(${REVEAL_FADES}).is-visible{opacity:1;translate:none}
html.motion-ready :is(.latest-section,.popular,.in-focus-section){--from:0 6px;--dur:.7s}html.motion-ready :is(.opinion-col,.opinion-sec .section-title){--from:0 10px;--dur:.85s}html.motion-ready .screen-lead-media{--from:0 12px;--dur:.82s}html.motion-ready .screen-item{--from:14px 0;--dur:.86s}@media(max-width:900px){html.motion-ready .screen-item{--from:0 12px}}html.motion-ready :is(.footer-top>div:first-child,.footer-cols>div,.footer-bottom){--from:0 10px;--dur:.9s}
html.motion-ready .screen-lead-media:not(.is-visible) img{scale:1.022}
html.motion-ready :is(.focus-card,.focus-mini):not(.is-visible) img{opacity:.5;transform:scale(1.022) translateY(5px)}
html.motion-ready :is(.focus-card,.focus-mini).is-visible img{opacity:1;transform:none}
html.motion-ready .newsletter-in .kicker{opacity:0;translate:0 8px;transition:opacity .8s var(--ease-enter),translate .9s var(--ease-enter),letter-spacing .36s var(--ease)}html.motion-ready .newsletter-in h2{opacity:0;translate:0 14px;transition:opacity .9s var(--ease-enter) .16s,translate 1.05s var(--ease-enter) .16s,transform .42s var(--ease)}html.motion-ready .newsletter-in .signup{opacity:0;translate:0 10px;clip-path:inset(-6px 100% -6px -6px);transition:opacity .8s var(--ease-enter) .38s,translate .95s var(--ease-enter) .38s,clip-path 1.2s var(--ease-enter) .38s,transform .42s var(--ease)}html.motion-ready .newsletter-in .signup-msg{opacity:0;translate:0 6px;transition:opacity .8s var(--ease-enter) .72s,translate .9s var(--ease-enter) .72s}html.motion-ready .newsletter-in.is-visible :is(.kicker,h2,.signup,.signup-msg){opacity:1;translate:none}html.motion-ready .newsletter-in.is-visible .signup{clip-path:inset(-6px)}
html.motion-ready .hero:not(.hero-enter) .hero-copy>*{opacity:0;transform:translateY(18px)}html.motion-ready .hero:not(.hero-enter) img{opacity:.42;transform:scale(1.045)}html.motion-ready .hero.hero-enter img{animation:heroSettle 1.05s var(--ease-enter) backwards}@keyframes heroSettle{from{opacity:.42;transform:scale(1.045)}to{opacity:1;transform:scale(1)}}html.motion-ready .hero.hero-enter .hero-copy>*{animation:heroIn .96s var(--ease-enter) backwards}html.motion-ready .hero.hero-enter .hero-copy>:nth-child(1){animation-delay:.12s}html.motion-ready .hero.hero-enter .hero-copy>:nth-child(2){animation-delay:.23s}html.motion-ready .hero.hero-enter .hero-copy>:nth-child(3){animation-delay:.34s}html.motion-ready .hero.hero-enter .hero-copy>:nth-child(4){animation-delay:.45s}@keyframes heroIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
html.motion-ready .rule{transform-origin:left center;scale:.35 1;opacity:0;transition:scale 1.1s var(--ease-enter) .15s,opacity var(--t-slow) ease .15s}html.motion-ready .is-visible .rule{scale:1 1;opacity:1}
html.motion-ready .reveal-quick{--dur:.5s}html.motion-ready .reveal-instant,html.motion-ready .reveal-instant *{transition-duration:0s!important;transition-delay:0s!important}
html.motion-ready:not(.motion-live) :is(${REVEAL_FADES},${REVEAL_PARTS},.rule,${REVEAL_IMAGES}){animation:revealFailsafe 0s 2.5s forwards}@keyframes revealFailsafe{to{opacity:1;translate:none;scale:1 1;clip-path:none}}
@media print{html.motion-ready :is(${REVEAL_FADES},${REVEAL_PARTS},.rule,${REVEAL_IMAGES}){opacity:1!important;translate:none!important;scale:1 1!important;clip-path:none!important;animation:none!important}}`;

const heroImage = art(hero);
// Share card: the lead's photo, else the newest story that has one (never section art).
const shareImage = heroImage || art(articles.find(a => art(a))) || '';
const shareMeta = shareImage
  ? `<meta property="og:image" content="${site}${shareImage}">\n<meta name="twitter:card" content="summary_large_image">`
  : '<meta name="twitter:card" content="summary">';
const canonical = `${site}/`;
const description = 'Nuvellum is an independent international publication covering world affairs, business, technology, culture, film, sport and ideas.';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>${THEME_HEAD}</script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nuvellum — Beyond the headline.</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.svg?v=5" type="image/svg+xml" sizes="any">
<link rel="shortcut icon" href="/favicon.svg?v=5">
<link rel="apple-touch-icon" href="/icons/nuvellum-apple-180.png" sizes="180x180">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="Nuvellum">
<link rel="alternate" type="application/rss+xml" title="Nuvellum RSS" href="/rss.xml">
<meta name="theme-color" content="#6d1720">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nuvellum">
<meta property="og:title" content="Nuvellum — Beyond the headline.">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
${shareMeta}
<meta name="twitter:title" content="Nuvellum — Beyond the headline.">
<meta name="twitter:description" content="${description}">${shareImage ? `\n<meta name="twitter:image" content="${site}${shareImage}">` : ''}
<style>
:root{
  --paper:#f8f4ec;--paper2:#fbf8f2;--ink:#1f1a16;--muted:#6b6259;--line:#ddd3c3;--hair:rgba(96,74,52,.2);
  --wine:#661227;--wine2:#54101f;--wine-ink:#661227;--wine-soft:rgba(102,18,39,.42);--charcoal:#1d1a17;--plate:rgba(255,253,248,.62);--nav-ink:#2b241e;--icon-ink:#141210;--tab-ink:#3a322b;
  --text:'Newsreader',Georgia,'Times New Roman',serif;
  --burgundy:#76132b;--burgundy2:#8e1834;--black:#111113;--white:#fff;
  --serif:Georgia,'Times New Roman',serif;--sans:Arial,Helvetica,sans-serif;
  --shadow:0 8px 24px rgba(56,39,25,.08);
  --ease:cubic-bezier(.16,.8,.2,1);--ease-enter:cubic-bezier(.22,.61,.36,1);--ease-drift:cubic-bezier(.45,.05,.55,.95);--t-quick:.24s;--t-hover:.38s;--t-base:.42s;--t-media:.6s;--t-slow:.8s;--t-enter:.85s;--rise:10px
}
@font-face{font-family:'Newsreader';font-style:normal;font-weight:300 700;font-display:swap;src:url(/fonts/newsreader-normal-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Newsreader';font-style:normal;font-weight:300 700;font-display:swap;src:url(/fonts/newsreader-normal-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Newsreader';font-style:italic;font-weight:300 700;font-display:swap;src:url(/fonts/newsreader-italic-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background-color:var(--paper);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .36 0 0 0 0 .27 0 0 0 0 .17 0 0 0 .04 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");color:var(--ink);font-family:var(--serif)}
/* Newsreader everywhere except the locked brand, which keeps its own inherited context. */
body>*:not(.site-header),.main-nav,.header-tools{font-family:var(--text);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body.night{--paper:#161412;--paper2:#1c1a17;--ink:#efe7da;--muted:#b3a797;--line:#3b352e;--hair:rgba(230,210,180,.14);--wine-soft:rgba(200,120,140,.4);--wine-ink:#d496a3;--plate:rgba(255,248,236,.035);--nav-ink:#e6dccd;--icon-ink:#efe7da;--tab-ink:#d9cfc1;--black:#0b0b0c;--shadow:0 10px 28px rgba(0,0,0,.28)}
a{color:inherit;text-decoration:none}button,input{font:inherit}img{display:block;width:100%}.shell{width:min(1452px,calc(100% - 64px));margin:auto}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.site-header{background:transparent;position:relative;z-index:30;--ink:#17120f;--muted:#71685f;--line:#d9d0c4;--paper2:#fbf8f1;color:var(--ink)}
body.night .site-header{--bm-edge:#d6cbbb;--ink:#f4eee5;--muted:#b9aea3;--line:#3b3630;--paper2:#1b1917}
.header-row{height:68px;display:grid;grid-template-columns:300px 1fr 300px;align-items:center;gap:24px}
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

.main-nav{display:flex;justify-content:flex-start;gap:29px;font-size:16px;letter-spacing:.012em;color:var(--nav-ink);white-space:nowrap;padding-left:78px}.main-nav a{padding:6px 0 5px;border-bottom:1px solid transparent;transition:color .18s,border-color .18s}.main-nav a:hover{color:var(--wine-ink);border-bottom-color:var(--wine-ink)}
.header-tools{display:flex;align-items:center;justify-content:flex-end;gap:14px}.icon-btn{border:0;background:transparent;color:var(--icon-ink);cursor:pointer;padding:9px;display:grid;place-items:center;line-height:0;transition:color .18s}.icon-btn svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.55;stroke-linecap:round;stroke-linejoin:round}.icon-btn#savedOpen svg{width:22px;height:22px}.icon-btn svg .solid{fill:currentColor;stroke:none}.icon-btn svg .bookmark-shadow{fill:rgba(26,22,19,.66);stroke:none;filter:blur(.3px)}.icon-btn svg .bookmark-face{fill:var(--paper);stroke:var(--bm-edge,#6f675f);stroke-width:.85;stroke-linejoin:round;stroke-linecap:round}.icon-btn:hover{color:var(--wine-ink)}.subscribe{border:0;border-radius:3px;background:var(--wine);color:#f6efe4;padding:0 23px;height:39px;display:inline-grid;place-items:center;font-size:15.5px;letter-spacing:.02em;cursor:pointer;margin-left:12px;transition:background .18s}.subscribe:hover{background:var(--wine2)}
body.brief-open{overflow:hidden}
.brief-invite[hidden]{display:none}
.brief-invite{position:fixed;inset:0;z-index:150;display:grid;place-items:center;padding:24px}
.brief-invite-backdrop{position:absolute;inset:0;background:rgba(15,11,9,.54);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:briefVeil .28s ease both}
.brief-invite-card{position:relative;width:min(570px,calc(100vw - 32px));background:var(--paper2);color:var(--ink);border:1px solid var(--line);box-shadow:0 34px 90px rgba(18,12,8,.3),inset 0 3px 0 var(--wine);padding:38px 40px 32px;animation:briefArrival .48s cubic-bezier(.16,.8,.2,1) both;overflow:hidden}
.brief-invite-card:after{content:"N";position:absolute;right:-2px;bottom:-46px;font-family:var(--serif);font-size:170px;line-height:1;color:var(--wine-ink);opacity:.035;pointer-events:none}
.brief-invite-close{position:absolute;right:18px;top:16px;width:34px;height:34px;border:0;background:transparent;color:var(--muted);font-size:26px;line-height:1;cursor:pointer;transition:color .18s,transform .25s var(--ease)}
.brief-invite-close:hover{color:var(--wine-ink);transform:rotate(4deg)}
.brief-invite-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:var(--wine-ink);display:flex;align-items:center;gap:10px;margin:0 44px 16px 0}.brief-invite-kicker:before{content:"✦";font-size:11px}
.brief-invite h2{font-size:42px;line-height:1.02;font-weight:400;letter-spacing:-.02em;margin:0 0 13px;max-width:10em}
.brief-invite-dek{font-size:17px;line-height:1.48;color:var(--muted);font-style:italic;margin:0 0 26px;max-width:31em}
.brief-invite-form{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;border-top:1px solid var(--hair);padding-top:22px}
.brief-invite-form>input[type=email]{min-width:0;height:48px;border:1px solid var(--line);background:transparent;color:var(--ink);padding:0 14px;outline:0}
.brief-invite-form>input[type=email]:focus{border-color:var(--wine-ink);box-shadow:inset 0 0 0 1px var(--wine-ink)}
.brief-invite-form>button[type=submit]{height:48px;border:0;background:var(--wine);color:#f7efe4;padding:0 20px;cursor:pointer;white-space:nowrap;transition:background .18s,transform .28s var(--ease)}
.brief-invite-form>button[type=submit]:hover{background:var(--wine2);transform:translateY(-1px)}
.brief-invite-form>button[type=submit]:disabled{opacity:.6;cursor:wait;transform:none}
.brief-invite-consent{grid-column:1/-1;display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.4;color:var(--muted);margin-top:4px}.brief-invite-consent input{margin-top:2px;accent-color:var(--wine)}.brief-invite-consent a{color:var(--wine-ink);text-decoration:underline;text-underline-offset:2px}
.brief-invite-msg{grid-column:1/-1;min-height:17px;font-size:12px;color:var(--muted);font-style:italic;margin-top:1px}.brief-invite-msg.is-error{color:var(--wine-ink);font-style:normal}
.brief-invite-hp{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important}
@keyframes briefVeil{from{opacity:0}to{opacity:1}}@keyframes briefArrival{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}

.news-ticker{height:35px;background:var(--charcoal);color:#e2d9cb;display:flex;align-items:center}.ticker-inner{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:40px;font-size:12.5px}.latest-label{color:#b8677a;text-transform:uppercase;letter-spacing:.18em;font-family:var(--text);font-size:10.5px;display:flex;align-items:center;gap:12px}.latest-label:before{content:"";width:5px;height:5px;border-radius:50%;background:#9b3048}.ticker-links{overflow:hidden;white-space:nowrap;min-width:0;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%)}.ticker-track{display:flex;align-items:center;gap:24px;width:max-content;will-change:transform;animation:tickerScroll 36s linear infinite}.ticker-group{display:flex;align-items:center;gap:24px;flex:none}.ticker-links:hover .ticker-track,.ticker-links:focus-within .ticker-track{animation-play-state:paused}.ticker-links a{opacity:.86;font-size:12.5px;font-weight:350;letter-spacing:.012em;flex:0 0 auto;max-width:44ch;overflow:hidden;text-overflow:ellipsis}.ticker-links a:hover{opacity:1;color:#fff}.ticker-dot{opacity:.38;flex:none;font-size:7px}.view-all{color:#e2d9cb;white-space:nowrap;font-size:12.5px;letter-spacing:.01em}.view-all:hover{color:#fff}@keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(calc(-50% - 12px))}}
.home-layout{display:grid;grid-template-columns:minmax(0,854fr) minmax(0,591fr);gap:7px;padding:11px 0 8px}.left-col,.right-col{min-width:0}.right-col{display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:9px;align-content:stretch}
.hero{position:relative;height:465px;overflow:hidden;background:#17120f}.hero>a{display:block;height:100%}.hero img{width:100%;height:100%;object-fit:cover;filter:sepia(.32) saturate(.7) contrast(1.05) brightness(.72);transition:transform .9s cubic-bezier(.16,.8,.2,1)}.hero:hover img{transform:scale(1.012)}.hero:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(18,11,8,.66) 0%,rgba(18,11,8,.2) 64%,rgba(18,11,8,.08)),linear-gradient(0deg,rgba(14,9,7,.74) 0%,transparent 60%),radial-gradient(ellipse at 50% 40%,transparent 55%,rgba(10,6,4,.35) 100%)}.hero-copy{position:absolute;z-index:2;left:28px;right:28px;bottom:34px;color:#fff;max-width:585px}.hero-kicker{display:inline-block;background:var(--wine);color:#f3e9dc;padding:4px 8px 3px;font-family:var(--text);font-size:11px;text-transform:uppercase;letter-spacing:.16em}.hero h1{font-size:41px;line-height:1.02;font-weight:400;margin:22px 0 14px;letter-spacing:-.012em;max-width:525px;color:#f7f0e4}.hero-dek{font-size:18px;line-height:1.34;color:#ddd2c3;max-width:548px}.story-meta{font-family:var(--text);font-size:13px;color:var(--muted);margin-top:12px;letter-spacing:.01em}.hero .story-meta{color:#d9d0c7;margin-top:18px}.story-meta span{padding:0 7px;font-size:9px;position:relative;top:-1px}
.support-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}.support-card{background:transparent;border:0;border-bottom:1px solid var(--hair);display:flex;flex-direction:column;position:relative}.support-card+.support-card:before{content:"";position:absolute;left:-7px;top:0;bottom:0;border-left:1px solid var(--hair)}.support-image{position:relative;display:block;overflow:hidden}.support-image img{height:124px;object-fit:cover;transition:transform .7s cubic-bezier(.16,.8,.2,1)}.support-card:hover .support-image img{transform:scale(1.03)}.support-image .chip{position:absolute;left:10px;bottom:6px}.chip{display:inline-block;background:var(--wine2);color:#f3e9dc;font-family:var(--text);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;padding:3px 7px 2px;line-height:1.35}.support-body{padding:10px 2px 11px;display:flex;flex-direction:column;flex:1}.eyebrow{font-family:var(--text);font-size:10.5px;text-transform:uppercase;letter-spacing:.13em;color:var(--wine-ink)}.support-card h3{font-size:18.5px;line-height:1.14;letter-spacing:-.005em;margin:0 0 auto;font-weight:400;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.support-card h3 a:hover,.latest-copy h3 a:hover,.focus-copy h3 a:hover,.popular-item:hover .popular-title{color:var(--wine-ink)}.support-card .story-meta{margin-top:12px;line-height:16px}
.panel{background:var(--plate);border:1px solid var(--hair);padding:7px 9px 8px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:3px 6px 8px}.panel-head h2{font-size:27px;line-height:1;color:var(--wine-ink);margin:0;font-weight:500;letter-spacing:-.012em}.panel-head h2:before{content:"✦";font-size:17px;margin-right:11px;position:relative;top:-4px}.panel-link{font-size:12.5px;color:var(--wine-ink);letter-spacing:.01em}.panel-link:hover{text-decoration:underline}
.world-map-wrap{position:relative;isolation:isolate;background:radial-gradient(ellipse at 50% 45%,#191717 0%,#121112 60%,#0c0b0c 100%);height:228px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}.world-map{width:100%;height:100%;display:block;padding:9px 18px 7px}.world-map-wrap:before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.2;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .8 0 0 0 0 .76 0 0 0 0 .7 0 0 0 .42 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")}.world-map-wrap:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(0,0,0,.45) 100%)}.world-map .atlas{fill:none;stroke:#4a4647;stroke-width:1;opacity:.2}.map-region path{fill:var(--land);stroke:rgba(244,236,224,.3);stroke-width:.28;stroke-linejoin:round;}.map-region path:nth-child(3n+1){fill:var(--land-a)}.map-region path:nth-child(3n+2){fill:var(--land-b)}.map-region{--land:#7d7671;--land-a:#857e78;--land-b:#766f6a}.map-region[data-region="europe-central-asia"]{--land:#8a837d;--land-a:#928b85;--land-b:#827b75}.map-region[data-region="sub-saharan-africa"],.map-region[data-region="middle-east-north-africa"]{--land:#6a6460;--land-a:#716b66;--land-b:#645e5a}.map-region[data-region="latin-america-caribbean"]{--land:#6f6964;--land-a:#77716c;--land-b:#69635e}.map-region.heat-2{--land:#827c77;--land-a:#89837e;--land-b:#7b7570}.map-region.heat-3{--land:#87817b;--land-a:#8e8882;--land-b:#807a74}.map-region path{vector-effect:non-scaling-stroke;transition:fill .18s ease,stroke .18s ease}.map-region:hover path,.map-region:focus path{fill:#5c2230!important;stroke:rgba(246,214,220,.34)}.map-region.is-active path{fill:#6c182d!important;stroke:rgba(236,176,188,.38)}.map-region.is-active path:nth-child(3n+1){fill:#771c33!important}.map-region.is-active path:nth-child(3n+2){fill:#611428!important}.map-region{outline:none;cursor:pointer}.map-tooltip{position:absolute;z-index:3;background:rgba(11,10,10,.94);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);color:#f3ece1;border:1px solid rgba(236,226,212,.13);border-radius:3px;padding:5px 10px 5px 9px;font-family:var(--text);font-size:10.5px;line-height:1.25;pointer-events:none;opacity:0;transform:translate(-18px,calc(-100% - 12px));transition:opacity .16s ease;box-shadow:0 6px 16px rgba(0,0,0,.5);white-space:nowrap}.map-tooltip:after{content:"";position:absolute;left:15px;bottom:-4px;width:6px;height:6px;background:#0c0b0b;border-right:1px solid rgba(236,226,212,.13);border-bottom:1px solid rgba(236,226,212,.13);transform:rotate(45deg)}.map-tooltip strong{display:block;font-size:12.5px;font-weight:500;color:#f3ece1;letter-spacing:.01em}.map-tooltip span{display:block;color:#9d9387;margin-top:1px;font-size:10.5px}
.region-tabs{display:flex;border-bottom:1px solid var(--hair);margin-top:4px}.region-tab{flex:1 1 auto;min-height:31px;border:0;border-right:1px solid var(--hair);background:transparent;color:var(--tab-ink);padding:2px 6px;font-size:10.5px;line-height:1.1;white-space:nowrap;letter-spacing:0;cursor:pointer;display:grid;place-items:center;text-align:center;transition:background .18s,color .18s}.region-tab:last-child{border-right:0}.region-tab:hover{color:var(--wine-ink)}.region-tab.is-active{background:var(--wine);color:#f6efe4;border-radius:2px}.region-tab:focus-visible{outline:2px solid var(--wine);outline-offset:-2px}
.region-detail{display:grid;grid-template-columns:minmax(0,1.78fr) minmax(160px,1fr);gap:20px;padding:10px 6px 0;min-height:222px}.region-story-list{display:grid;align-content:start}.region-story{display:grid;grid-template-columns:92px 1fr;gap:12px;padding:5px 0 6px;border-bottom:1px solid var(--hair)}.region-story:last-child{border-bottom:0}.region-story img{width:92px;height:58px;object-fit:cover}.region-story strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:15px;line-height:1.15;font-weight:400}.region-story:hover strong{color:var(--wine-ink)}.region-story small{display:block;font-size:11px;color:var(--muted);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.region-story>span{min-width:0}.region-summary{border-left:1px solid var(--hair);padding:4px 0 6px 20px;display:flex;flex-direction:column}.region-summary a{margin-top:auto!important}.region-summary p{margin-bottom:14px!important}.summary-kicker{display:grid;grid-template-columns:22px 1fr;font-family:var(--text);font-size:12.5px;line-height:1.3;color:var(--wine-ink);letter-spacing:.16em;font-weight:500}.region-summary>small{display:block;margin:3px 0 14px 22px;color:var(--muted);font-size:11.5px;font-style:italic}.region-summary p{color:var(--muted);font-size:14.5px;line-height:1.22;margin:0}.region-summary a{display:flex;align-items:center;justify-content:center;gap:12px;background:var(--wine);color:#f6efe4;border-radius:2px;padding:9px 12px;margin-top:17px;white-space:nowrap;font-size:14px;letter-spacing:.02em;transition:background .18s}.region-summary a:hover{background:var(--wine2)}.region-empty{font-size:13px;color:var(--muted);padding:20px 6px}
/* World Desk polish: active tab points at the desk it opened; description sits close to its button; long desk names fit. */
.region-tab{position:relative}.region-tab.is-active{font-weight:500;box-shadow:inset 0 -2px 0 rgba(0,0,0,.18)}.region-tab.is-active:after{content:"";position:absolute;left:50%;bottom:-6px;width:10px;height:10px;background:var(--wine);transform:translateX(-50%) rotate(45deg);border-radius:1px;z-index:1}
@media(max-width:1180px){.region-tab.is-active:after{display:none}}
.region-summary{padding-top:2px}.region-summary>small{margin:2px 0 10px 22px}.region-summary p{line-height:1.36!important;margin-bottom:0!important}
.region-summary a{margin-top:16px!important;white-space:normal;text-align:center;line-height:1.2;padding:9px 12px;font-size:13.5px;gap:8px}
.section-block{margin-top:16px}.right-col .section-block{margin-top:0;background:var(--plate);border:1px solid var(--line);padding:4px 18px 8px}.right-col .section-title{padding:4px 0 6px}.section-title{display:flex;align-items:center;gap:18px;padding:6px 0 7px}.section-title h2{font-size:28px;line-height:1;color:var(--wine-ink);font-weight:500;letter-spacing:-.012em;margin:0}.section-title .rule{height:1px;background:var(--wine-soft);flex:1}.section-title a{font-size:12px;color:var(--wine-ink);white-space:nowrap}.section-title a:hover{text-decoration:underline}
.latest-filters{display:flex;gap:22px;overflow-x:auto;scrollbar-width:none;white-space:nowrap;border-bottom:1px solid var(--hair);margin:-1px 0 0}.latest-filters::-webkit-scrollbar{display:none}.latest-filters button{flex:none;border:0;border-bottom:1px solid transparent;margin-bottom:-1px;background:none;color:var(--muted);font-family:var(--text);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;padding:4px 0 6px;cursor:pointer;transition:color var(--t-quick) ease,border-color var(--t-base) var(--ease)}.latest-filters button:hover{color:var(--ink)}.latest-filters button[aria-selected="true"]{color:var(--wine-ink);border-bottom-color:var(--wine-ink)}.latest-filters button:focus-visible{outline:1px solid var(--wine-ink);outline-offset:2px}
.latest-list{--latest-slot:83px;display:grid;grid-template-rows:repeat(5,var(--latest-slot));overflow:hidden}.latest-list .latest-copy{min-width:0}.latest-list .latest-copy h3{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.latest-empty{margin:0;align-self:center;font-size:13.5px;font-style:italic;color:var(--muted)}.latest-empty a{font-style:normal;color:var(--wine-ink);margin-left:6px;border-bottom:1px solid transparent;transition:border-color var(--t-quick) ease}.latest-empty a:hover{border-bottom-color:currentColor}.latest-empty:first-child{grid-row:1/-1;text-align:center}
.latest-list.is-leaving>*{opacity:0!important;translate:0 -6px!important;transition:opacity .22s ease,translate .22s ease!important}.latest-list.is-entering>*{animation:latestIn .8s var(--ease-enter) backwards}.latest-list.is-entering>:nth-child(2){animation-delay:70ms}.latest-list.is-entering>:nth-child(3){animation-delay:140ms}.latest-list.is-entering>:nth-child(4){animation-delay:210ms}.latest-list.is-entering>:nth-child(5){animation-delay:280ms}.latest-list.is-entering>:nth-child(6){animation-delay:350ms}@keyframes latestIn{from{opacity:0;translate:0 10px}to{opacity:1;translate:none}}
.latest-row{display:grid;grid-template-columns:162px 1fr auto;align-items:center;gap:17px;padding:6px 0;border-bottom:1px solid var(--hair)}.latest-thumb{overflow:hidden}.latest-thumb img{height:70px;object-fit:cover}.latest-copy h3{font-size:18px;font-weight:400;line-height:1.18;margin:4px 0 5px;letter-spacing:-.004em}.latest-copy .story-meta{margin-top:0;font-size:12.5px}.save-icon{border:0;background:none;color:inherit;cursor:pointer;padding:10px;line-height:0}.save-icon svg{width:16px;height:19px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linejoin:round}.save-icon:hover,.save-icon.saved{color:var(--wine-ink)}.save-icon.saved svg{fill:currentColor}
.popular-head{display:flex;align-items:center;gap:16px;padding:2px 0 1px}.popular-head h2{font-size:31px;line-height:1;color:var(--wine-ink);font-weight:500;letter-spacing:-.016em;margin:0;white-space:nowrap}.popular-head .rule{height:1px;background:var(--wine-soft);flex:1 1 auto;min-width:24px}.popular-tabs{display:flex;gap:20px;font-size:13.5px;white-space:nowrap;flex:none}.popular-tabs button{border:0;border-bottom:1px solid transparent;background:none;color:var(--muted);padding:8px 0 6px;cursor:pointer;transition:color var(--t-quick) ease,border-color var(--t-base) var(--ease)}.popular-tabs button:hover{color:var(--ink)}.popular-tabs button[aria-selected="true"]{color:var(--wine-ink);border-bottom-color:var(--wine-ink)}.popular-tabs button:focus-visible{outline:1px solid var(--wine-ink);outline-offset:2px}.popular-list{margin-top:3px}.popular-item{display:grid;grid-template-columns:26px minmax(0,1fr) 62px;gap:12px;align-items:baseline;padding:5px 0 6px;border-top:1px solid var(--hair);font-size:15.5px;line-height:1.26}.popular-item:first-child{border-top:0}.popular-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.popular-rank{text-align:center;font-size:17px;font-variant-numeric:oldstyle-nums;color:var(--wine-ink)}.popular-views{font-family:var(--text);font-size:12px;color:var(--muted);white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.popular-empty{font-size:13.5px;font-style:italic;color:var(--muted);padding:12px 0}
.in-focus-section{display:flex;flex-direction:column;min-height:0}.focus-card{display:grid;grid-template-columns:255fr 284fr;gap:15px;padding:2px 0 12px;min-height:138px}.focus-media,.focus-mini-media{overflow:hidden}.focus-card img{height:132px;object-fit:cover;transition:transform .7s cubic-bezier(.16,.8,.2,1),filter .35s ease}.focus-copy .chip{margin-right:6px;vertical-align:3px}.focus-copy h3{display:inline;font-size:17px;line-height:1.18;font-weight:400}.focus-copy p{font-size:13.5px;line-height:1.32;color:var(--muted);margin:8px 0 0}.focus-copy .story-meta{font-size:12px;margin-top:10px}.focus-secondary{display:grid;grid-template-columns:1fr;grid-template-rows:repeat(2,minmax(72px,1fr));border-top:1px solid var(--hair);margin-top:2px;flex:1}.focus-mini{display:grid;grid-template-columns:118px 1fr;gap:12px;align-items:center;padding:10px 0;min-width:0}.focus-mini+ .focus-mini{border-left:0;border-top:1px solid var(--hair);padding-left:0;padding-right:0}.focus-mini img{height:72px;object-fit:cover;transition:transform .65s cubic-bezier(.16,.8,.2,1),filter .35s ease}.focus-mini .eyebrow{font-size:9px;letter-spacing:.13em;color:var(--wine-ink)}.focus-mini h4{font-size:14.5px;line-height:1.16;font-weight:400;margin:3px 0 0}.focus-mini .story-meta{font-size:10.5px;margin-top:5px}.focus-card:hover img,.focus-mini:hover img{transform:scale(1.035)}.focus-card:hover h3 a,.focus-mini:hover h4 a{color:var(--wine-ink)}
.screen{background:#000;color:#ece3d5;margin-top:30px;padding:26px 0 40px}.screen .section-title h2{color:#efe6d8}.screen .section-title .rule{background:rgba(190,110,128,.45)}.screen .section-title a{color:#cf9eaa}.screen-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:30px;margin-top:6px}.screen-lead-media{display:block;overflow:hidden}.screen-lead img{height:372px;object-fit:cover;filter:saturate(.9) brightness(.92);transition:transform .9s cubic-bezier(.16,.8,.2,1)}.screen-lead:hover img{transform:scale(1.012)}.screen .chip{background:var(--wine);margin-top:18px}.screen-lead h3{font-size:36px;line-height:1.06;font-weight:400;letter-spacing:-.012em;margin:12px 0 10px;max-width:780px}.screen-lead p{color:#bdb4aa;font-size:16px;line-height:1.45;max-width:700px;margin:0}.screen .story-meta{color:#9d948a}.screen .eyebrow{color:#d8a3b0}.screen-side{display:grid;align-content:start;border-left:1px solid rgba(230,210,180,.12);padding-left:30px}.screen-item{display:grid;grid-template-columns:150px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid rgba(230,210,180,.12)}.screen-item:first-child{padding-top:0}.screen-item:last-child{border-bottom:0}.screen-item img{height:92px;object-fit:cover}.screen-item h4{font-size:19px;line-height:1.2;font-weight:400;margin:6px 0 0}.screen-item .story-meta{margin-top:8px;font-size:12px}.screen-lead h3 a:hover,.screen-item:hover h4{color:#fff;text-decoration:underline;text-decoration-color:#8a1b36;text-underline-offset:4px}
.opinion-sec{padding:26px 0 40px}.opinion-grid{display:grid;grid-template-columns:repeat(3,1fr)}.opinion-col{padding:10px 26px 4px;border-left:1px solid var(--hair);display:grid;grid-template-columns:46px 1fr;gap:16px;align-content:start}.opinion-col:first-child{border-left:0;padding-left:0}.opinion-avatar{width:46px;height:46px;border-radius:50%;border:1px solid var(--wine);color:var(--wine-ink);display:grid;place-items:center;font-size:14px;letter-spacing:.05em}.opinion-col h3{font-size:22px;line-height:1.18;font-weight:400;margin:6px 0 8px}.opinion-col h3 a:hover{color:var(--wine-ink)}.opinion-col p{font-size:14px;line-height:1.42;color:var(--muted);margin:0 0 10px}.opinion-by{font-size:13px;font-style:italic}
.newsletter{background:var(--wine2);color:#f6eee2;padding:40px 0}.newsletter-in{display:grid;grid-template-columns:1.15fr 1fr;gap:48px;align-items:center}.newsletter .kicker{font-family:var(--text);font-size:10px;letter-spacing:.16em;color:#e8c3cc;text-transform:uppercase}.newsletter h2{font-size:40px;line-height:1.06;font-weight:400;letter-spacing:-.012em;margin:10px 0 0}.signup{display:grid;grid-template-columns:1fr auto;max-width:520px;width:100%;justify-self:end}.signup input{height:46px;border:1px solid rgba(255,255,255,.5);border-right:0;background:rgba(255,255,255,.06);color:#fff;padding:0 14px;font-size:15px;min-width:0}.signup input::placeholder{color:#e2c5cc}.signup input:focus{outline:2px solid #fff;outline-offset:-2px}.signup button{height:46px;border:0;background:#f3ede1;color:var(--wine2);padding:0 22px;font-size:15px;cursor:pointer}.signup button:hover{background:#fff}.signup-msg{grid-column:1/-1;font-size:13px;color:#ecd0d6;margin-top:10px;min-height:1.3em}.signup-consent{grid-column:1/-1;display:flex;gap:9px;align-items:flex-start;margin-top:12px;font-size:13px;line-height:1.4;color:#f1dde1;cursor:pointer}.signup .signup-consent input{flex:none;width:16px;height:16px;min-width:0;margin:1px 0 0;padding:0;accent-color:#f3ede1}.signup-consent a{text-decoration:underline;text-underline-offset:2px}.signup-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.signup-msg.is-error{color:#fff}.signup button[disabled]{opacity:.7;cursor:progress}
.footer{background:#000;color:#e6dccd;padding:44px 0 22px}.footer-top{display:grid;grid-template-columns:1.1fr 3fr;gap:44px}.footer-brand{font-size:30px;letter-spacing:.05em;color:#fbf8f1}.footer-brand span{color:#a8455a;font-size:.55em;vertical-align:top;margin-left:6px}.footer-tag{font-style:italic;color:#a79d93;margin-top:6px;font-size:14px}.footer-about{color:#8f867d;font-size:13px;line-height:1.55;margin-top:16px;max-width:300px}.footer-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}.footer-cols h3{font-family:var(--text);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8677a;font-weight:400;margin:4px 0 10px;padding-bottom:9px;border-bottom:1px solid rgba(230,210,180,.12)}.footer-cols a{display:block;font-size:14px;padding:4px 0}.footer-cols a:hover{color:#fff;text-decoration:underline;text-decoration-color:#8a1b36;text-underline-offset:3px}.footer-bottom{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:36px;padding-top:16px;border-top:1px solid rgba(230,210,180,.12);font-size:12px;color:#8f867d}
.support-image img,.latest-thumb img,.region-story img,.focus-card img,.screen-item img{filter:sepia(.24) saturate(.74) contrast(1.03) brightness(.96)}
/* Text-led stories: no acceptable image, so type carries the slot — section label, wine rule, standfirst. Nothing imitates a picture. */
.tl-mark{font-family:var(--serif);color:var(--wine-ink);line-height:1;pointer-events:none}.tl-dek{font-family:var(--text);font-style:italic;color:var(--muted)}
.hero.is-text{background:var(--paper2);border:1px solid var(--line);border-top:3px solid var(--wine);box-shadow:inset 0 4px 0 var(--paper2),inset 0 5px 0 var(--hair);display:flex;flex-direction:column;justify-content:flex-end}.hero.is-text:after{display:none}.hero.is-text>.tl-mark{position:absolute;top:28px;right:32px;font-size:28px;opacity:.5}
.hero.is-text .hero-copy{position:relative;left:auto;right:auto;bottom:auto;max-width:none;padding:0 44px 38px;color:var(--ink)}.hero.is-text h1{font-size:52px;line-height:1;letter-spacing:-.018em;max-width:760px;margin:24px 0 18px;color:var(--ink);text-wrap:balance}.hero.is-text .hero-dek{font-family:var(--text);font-style:italic;font-size:20px;line-height:1.38;color:var(--muted);max-width:640px;border-top:1px solid var(--hair);padding-top:16px}.hero.is-text .story-meta{color:var(--muted)}.hero.is-text h1 a:hover{color:var(--wine-ink)}
.support-text{display:flex;flex-direction:column-reverse;justify-content:space-between;height:124px;padding:12px 12px 6px 10px;background:var(--plate);border-top:2px solid var(--wine);box-shadow:inset 0 0 0 1px var(--hair);transition:background-color var(--t-hover) ease}.support-text .chip{align-self:flex-start}.support-text .tl-dek{font-size:14.5px;line-height:1.34;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.support-card.is-text:hover .support-text{background:rgba(102,18,39,.035)}
.latest-row.is-text{grid-template-columns:minmax(0,1fr) auto;position:relative;padding-left:17px}.latest-row.is-text:before{content:"";position:absolute;left:0;top:11px;bottom:11px;width:2px;background:var(--wine)}.latest-row.is-text .tl-time{text-transform:none;letter-spacing:.01em;color:var(--muted)}.latest-row.is-text .tl-dek{margin:0;font-size:13.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.latest-row.is-text h3{margin-bottom:3px}
.region-story.is-text{grid-template-columns:1fr;position:relative;padding-left:12px;min-height:69px;align-content:center}.region-story.is-text:before{content:"";position:absolute;left:0;top:8px;bottom:9px;width:2px;background:var(--wine)}
.focus-card.is-text{grid-template-columns:1fr;padding:13px 15px 14px;background:var(--plate);border-top:2px solid var(--wine);box-shadow:inset 0 0 0 1px var(--hair);margin-bottom:12px}.focus-card.is-text .focus-copy h3{font-size:21px;line-height:1.14}.focus-card.is-text .focus-copy p{font-family:var(--text);font-style:italic;font-size:14.5px}
.focus-mini.is-text{grid-template-columns:1fr;position:relative;padding-left:12px}.focus-mini.is-text:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;background:var(--wine)}
.screen-lead.is-text{display:flex}.screen-lead-panel{position:relative;flex:1;min-height:372px;display:flex;flex-direction:column;justify-content:flex-end;padding:40px 46px 38px;background:#0e0c0b;border:1px solid rgba(230,210,180,.14);border-top:3px solid var(--wine);box-shadow:inset 0 4px 0 #0e0c0b,inset 0 5px 0 rgba(230,210,180,.14)}.screen-lead-panel>.tl-mark{position:absolute;top:28px;right:32px;font-size:28px;color:#d8a3b0;opacity:.45}.screen-lead-panel .chip{align-self:flex-start;margin-top:0}.screen-lead.is-text h3{font-size:50px;line-height:1.02;letter-spacing:-.018em;margin:20px 0 18px;text-wrap:balance}.screen-lead.is-text p{font-family:var(--text);font-style:italic;font-size:19px;line-height:1.42;border-top:1px solid rgba(230,210,180,.14);padding-top:16px}
.screen-item.is-text{grid-template-columns:1fr;position:relative;padding-left:18px}.screen-item.is-text:before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:2px;background:var(--wine)}.screen-item.is-text:first-child:before{top:0}.screen-item.is-text .tl-dek{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14.5px;line-height:1.36;color:#a89f95;margin-top:7px}
@media(max-width:1180px){.hero.is-text h1{font-size:42px}.screen-lead.is-text h3{font-size:42px}}
@media(max-width:620px){.support-grid .support-card.is-text{display:flex;flex-direction:column;position:relative;padding:12px 0 12px 16px}.support-grid .support-card.is-text:before{display:block;content:"";position:absolute;left:0;top:14px;bottom:14px;border:0;width:2px;background:var(--wine)}.support-card.is-text .support-text,.support-card.is-text .support-body{display:contents}.support-card.is-text .chip{order:1;align-self:flex-start;background:none;color:var(--wine-ink);padding:0}.support-card.is-text h3{order:2;margin:6px 0 0;-webkit-line-clamp:3}.support-card.is-text .tl-dek{order:3;margin-top:6px;font-size:14px;-webkit-line-clamp:2}.support-card.is-text .story-meta{order:4;margin-top:8px}.hero.is-text .hero-copy{padding:0 20px 24px}.hero.is-text h1{font-size:32px;margin:18px 0 12px}.hero.is-text .hero-dek{font-size:17px;padding-top:12px}.hero.is-text>.tl-mark{top:18px;right:20px;font-size:22px}.screen-lead-panel{min-height:0;padding:26px 20px 24px}.screen-lead-panel>.tl-mark{top:20px;right:20px;font-size:22px}.screen-lead.is-text h3{font-size:30px;margin:16px 0 12px}.screen-lead.is-text p{font-size:16.5px}}.screen-lead img{filter:sepia(.26) saturate(.72) contrast(1.03) brightness(.9)!important}
/* Reading mode: the palette flips in one frame (see the toggle script); nothing transitions colour. Filtered artwork never changes with the theme, so it sits on its own compositor layers and is not re-rasterised when the theme flips. Support-card images are excluded (their chip text would lose subpixel anti-aliasing), and so is the World Desk map (measured: no gain). */.theme-switching,.theme-switching *,.theme-switching *::before,.theme-switching *::after{transition:none!important}.hero img,.latest-thumb img,.region-story img,.focus-card img,.focus-mini img,.screen-lead img,.screen-item img{will-change:transform}::view-transition-old(root),::view-transition-new(root){animation-duration:.18s;animation-timing-function:cubic-bezier(.4,0,.2,1)}#themeToggle.is-tapping svg{animation:themeTap .2s var(--ease)}@keyframes themeTap{0%{transform:scale(.9) rotate(-8deg)}65%{transform:scale(1.08) rotate(5deg)}100%{transform:scale(1) rotate(0)}}
.support-card{transition:transform .38s cubic-bezier(.16,.8,.2,1),box-shadow .38s ease}.support-image{overflow:hidden}.support-image img,.latest-thumb img,.screen-item img{transition:transform .65s cubic-bezier(.16,.8,.2,1),filter .35s ease}.support-card:hover{transform:translateY(-3px)}.support-card:hover .support-image img{transform:scale(1.025)}
.latest-row{transition:transform .3s cubic-bezier(.16,.8,.2,1),background-color .3s ease}.latest-row:hover{transform:translateX(4px);background:rgba(102,18,39,.025)}.latest-row:hover .latest-thumb img{transform:scale(1.035)}.latest-row:hover h3 a{color:var(--wine-ink)}
.popular-item{transition:transform .28s cubic-bezier(.16,.8,.2,1),color .22s ease,background-color .22s ease}.popular-item:hover{transform:translateX(4px);color:var(--wine-ink);background:rgba(102,18,39,.02)}
html.motion-ready .region-detail.swap-out>*{opacity:0;translate:0 -4px;transition:opacity .16s ease,translate .16s ease}html.motion-ready .region-detail.swap-in .region-story{animation:deskRowIn .75s var(--ease-enter) backwards}html.motion-ready .region-detail.swap-in .region-story:nth-child(2){animation-delay:.08s}html.motion-ready .region-detail.swap-in .region-story:nth-child(3){animation-delay:.16s}html.motion-ready .region-detail.swap-in .region-summary{animation:deskRowIn .8s var(--ease-enter) .28s backwards}@keyframes deskRowIn{from{opacity:0;translate:0 8px}to{opacity:1;translate:none}}
.region-story{transition:transform var(--t-hover) var(--ease)}.region-story img{transition:transform var(--t-media) var(--ease),filter var(--t-hover) ease}.region-story:hover{transform:translateX(4px)}.region-story:hover img{transform:scale(1.035)}
.popular-list.panel-in :is(.popular-item,.popular-empty){animation:popRowIn .65s var(--ease-enter) backwards}.popular-list.panel-in .popular-item:nth-child(2){animation-delay:60ms}.popular-list.panel-in .popular-item:nth-child(3){animation-delay:120ms}.popular-list.panel-in .popular-item:nth-child(4){animation-delay:180ms}.popular-list.panel-in .popular-item:nth-child(5){animation-delay:240ms}@keyframes popRowIn{from{opacity:0;translate:0 8px}to{opacity:1;translate:none}}
.screen-item{transition:transform .32s cubic-bezier(.16,.8,.2,1),background-color .32s ease}.screen-item:hover{transform:translateX(5px);background:rgba(255,255,255,.018)}.screen-item:hover img{transform:scale(1.035)}
.opinion-col{transition:transform .34s cubic-bezier(.16,.8,.2,1)}.opinion-col:hover{transform:translateY(-3px)}
.save-icon svg{transition:transform .22s cubic-bezier(.16,.8,.2,1),fill .22s ease,stroke .22s ease}.save-icon:hover svg{transform:translateY(-1px) scale(1.06)}.save-icon.just-saved svg{animation:savePop .34s cubic-bezier(.2,.9,.2,1)}@keyframes savePop{0%{transform:scale(.92)}55%{transform:scale(1.16)}100%{transform:scale(1)}}
${REVEAL_CSS}
.hero img{transform-origin:58% 42%;transition:transform .68s var(--ease),filter .42s ease}.hero-copy{transition:transform .42s var(--ease)}.hero:hover img{transform:scale(1.018) translate(-.25%,-.15%);filter:sepia(.26) saturate(.8) contrast(1.06) brightness(.79)}.hero:hover .hero-copy{transform:translateY(-4px)}
.support-card,.latest-row,.popular-item,.screen-item,.opinion-col{transition-timing-function:var(--ease);transition-duration:var(--t-hover)}.support-image img,.latest-thumb img{transition:transform var(--t-media) var(--ease),filter var(--t-hover) ease}
.focus-card,.focus-mini{transition:transform .34s var(--ease),background-color .3s ease}.focus-card img,.focus-mini img{transition:opacity .72s var(--ease-enter),transform .72s var(--ease-enter),filter .34s ease}.focus-card:hover{transform:translateY(-2px);background:rgba(102,18,39,.018)}.focus-mini:hover{transform:translateX(3px);background:rgba(102,18,39,.014)}.focus-card:hover img,.focus-mini:hover img{transform:scale(1.018)}.focus-card:hover .focus-copy,.focus-mini:hover>div{transform:translateX(2px)}.focus-copy,.focus-mini>div{transition:transform .34s var(--ease)}
.screen-lead img{transition:transform .82s var(--ease),filter .42s ease,scale .78s var(--ease-enter)}.screen-lead:hover img{transform:scale(1.025) translate(-.45%,-.28%);filter:sepia(.22) saturate(.82) contrast(1.04) brightness(.98)!important}.screen-lead h3 a{transition:color var(--t-hover) ease}
.screen-item img{transition:transform var(--t-media) var(--ease),filter var(--t-hover) ease}.screen-item:hover img{transform:scale(1.035) translateX(-1.5%);filter:sepia(.18) saturate(.82) contrast(1.03) brightness(1.02)}.screen-item .eyebrow{transition:color var(--t-hover) ease}.screen-item:hover .eyebrow{color:#e9bdc7}
.opinion-col{transition:transform var(--t-hover) var(--ease)}.opinion-avatar{transition:background-color var(--t-hover) ease,color var(--t-hover) ease}.opinion-col:hover .opinion-avatar{background:var(--wine);color:#f6efe4}
.newsletter-in:hover .kicker{letter-spacing:.205em}.newsletter-in:hover h2{transform:translateX(6px)}.newsletter-in:hover .signup{transform:translateX(-4px)}.signup input{transition:border-color var(--t-hover) ease,background-color var(--t-hover) ease,box-shadow var(--t-hover) ease}.signup input:focus{background:rgba(255,255,255,.1);box-shadow:inset 3px 0 0 rgba(255,255,255,.5)}.signup button{transition:background-color var(--t-hover) ease,color var(--t-hover) ease,transform var(--t-hover) var(--ease)}.signup button:hover{transform:translateY(-1px)}
.footer-cols a{transition:color var(--t-quick) ease,transform var(--t-quick) var(--ease)}.footer-cols a:hover{transform:translateX(3px)}

.search-sheet{position:fixed;inset:0;z-index:100;background:rgba(10,10,10,.55);display:none;place-items:start center;padding-top:110px}.search-sheet.open{display:grid}.search-box{width:min(800px,calc(100% - 30px));background:var(--paper2);padding:22px;border:1px solid var(--line);box-shadow:0 30px 80px rgba(0,0,0,.25)}.search-box input{width:100%;border:0;border-bottom:2px solid var(--ink);background:transparent;color:inherit;font-size:28px;padding:8px 0;outline:0}.search-results{margin-top:14px;display:grid;max-height:55vh;overflow:auto}.search-result{padding:11px 0;border-bottom:1px solid var(--line)}.search-result small{color:var(--wine-ink);text-transform:uppercase;font-family:var(--text);font-size:9px}.search-result strong{display:block;font-size:17px;font-weight:400;margin-top:3px}
@media(max-width:1180px){.shell{width:min(100% - 32px,1500px)}.header-row{grid-template-columns:250px 1fr 240px}.main-nav{gap:18px;font-size:15px;justify-content:center;padding-left:0}.home-layout{grid-template-columns:1.3fr 1fr}.hero h1{font-size:36px}.region-tabs{display:grid;grid-template-columns:repeat(4,1fr)}.region-tab:nth-child(4n){border-right:0}.region-tab:nth-child(-n+4){border-bottom:1px solid var(--line)}.screen-lead img{height:340px}}
@media(max-width:900px){.right-col{grid-template-rows:auto}.in-focus-section{display:block}.focus-secondary{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto;flex:none}.focus-mini{grid-template-columns:88px minmax(0,1fr)}.focus-mini.is-text{grid-template-columns:1fr}.focus-mini+ .focus-mini{border-top:0;border-left:1px solid var(--hair);padding-left:12px}.support-card+.support-card:before{display:none}.header-row{height:auto;grid-template-columns:minmax(190px,1fr) auto;padding:14px 0 0}.main-nav{grid-column:1/-1;order:3;justify-content:flex-start;padding-left:0;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none}.home-layout{grid-template-columns:1fr}.support-grid{grid-template-columns:1fr 1fr}.support-card:last-child{grid-column:1/-1}.hero{height:430px}.screen-grid{grid-template-columns:1fr}.screen-side{border-left:0;padding-left:0}.screen-item:first-child{padding-top:16px;border-top:1px solid #2f2b2d}.opinion-grid{grid-template-columns:1fr}.opinion-col,.opinion-col:first-child{border-left:0;padding:16px 0;border-top:1px solid var(--line)}.newsletter-in{grid-template-columns:1fr;gap:22px}.signup{justify-self:start}.footer-top{grid-template-columns:1fr;gap:28px}.footer-cols{grid-template-columns:repeat(2,1fr)}}
@media(max-width:620px){.brief-invite{padding:12px}.brief-invite-card{padding:31px 23px 25px}.brief-invite h2{font-size:34px}.brief-invite-dek{font-size:15px}.brief-invite-form{grid-template-columns:1fr}.brief-invite-form>button[type=submit]{width:100%}
@media(max-width:620px){.header-row{grid-template-columns:auto minmax(0,1fr);gap:6px}.header-tools{gap:0}.icon-btn{padding:6px}.icon-btn svg{width:20px;height:20px}.subscribe{padding:0 10px;height:34px;font-size:13px;margin-left:2px}.main-nav{gap:17px;font-size:14px;min-width:0}.ticker-inner{grid-template-columns:auto minmax(0,1fr);gap:16px}.view-all{display:none}.hero{height:440px}.hero-copy{left:18px;right:18px;bottom:22px}.hero h1{font-size:30px;margin:14px 0 10px}.hero-dek{font-size:15px}.support-grid{grid-template-columns:1fr}.support-card:last-child{grid-column:auto}.support-card{display:grid;grid-template-columns:130px 1fr}.support-image img{height:100%;min-height:110px}.region-detail{grid-template-columns:1fr}.region-summary{border-left:0;border-top:1px solid var(--line);padding:14px 0 4px}.region-tabs{display:grid;grid-template-columns:repeat(2,1fr)}.region-tab{min-height:44px;border-bottom:1px solid var(--line)}.region-tab:nth-child(2n){border-right:0}.world-map-wrap{height:188px}.latest-row{grid-template-columns:110px 1fr auto;gap:12px}.latest-thumb img{height:66px}.latest-list{--latest-slot:109px}.latest-list .latest-copy h3{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.latest-filters{gap:18px;padding-right:28px;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent)}.focus-card{grid-template-columns:1fr}.focus-card img{height:180px}.focus-secondary{grid-template-columns:1fr;grid-template-rows:auto}.focus-mini,.focus-mini.is-text{grid-template-columns:112px minmax(0,1fr);min-height:0}.focus-mini.is-text{grid-template-columns:1fr}.focus-mini+ .focus-mini{border-left:0;border-top:1px solid var(--hair);padding:12px 0}.focus-mini img{width:100%;height:78px}.focus-mini h4{font-size:17px;line-height:1.16}.popular-head{flex-wrap:wrap;gap:4px 18px}.popular-head .rule{display:none}.popular-tabs{gap:8px}.popular-tabs button{min-height:40px}.screen-lead img{height:230px}.screen-lead h3{font-size:26px}.screen-item{grid-template-columns:110px 1fr}.screen-item img{height:72px}.screen-item h4{font-size:16px}.newsletter h2{font-size:28px}.footer-cols{gap:18px}.footer-cols a{padding:7px 0}}
@media(max-width:620px){.shell{width:min(100% - 20px,1500px)}.brand-zone{width:180px;height:52px}.brand-monogram-mark{width:45px;height:45px}.brand-monogram-n{font-size:44px}.brand-tagline{font-size:10px}.brand-expanded{left:0;width:246px;background:var(--paper2);padding:8px 10px;border:1px solid var(--line);box-shadow:var(--shadow)}.brand-letter{font-size:29px;min-width:20px}.brand-home-star{font-size:16px;min-width:20px}.brand-monogram-star{font-size:16px;right:-8px}.brand-expanded-note{font-size:9px}}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  html.motion-ready :is(.support-card,.latest-section,.latest-row,.popular,.popular-item,.in-focus-section,.focus-card,.focus-mini,.screen .section-title,.screen-lead-media,.screen-lead>.chip,.screen-lead>h3,.screen-lead>p,.screen-lead>.story-meta,.screen-item,.opinion-sec .section-title,.opinion-col,.footer-top>div:first-child,.footer-cols>div,.footer-bottom){--from:0 5px;--dur:.58s}
  html.motion-ready .screen-item{--from:6px 0}
  html.motion-ready .hero:not(.hero-enter) .hero-copy>*{transform:translateY(7px)}
  html.motion-ready .hero:not(.hero-enter) img{opacity:.72;transform:scale(1.015)}
  html.motion-ready .hero.hero-enter img{animation:heroSettle .72s var(--ease-enter) backwards!important}
  html.motion-ready .hero.hero-enter .hero-copy>*{animation-duration:.62s!important}
  html.motion-ready .newsletter-in :is(.kicker,h2,.signup,.signup-msg){translate:0 4px}
  .support-card,.latest-row,.popular-item,.screen-item,.opinion-col,.focus-card img,.focus-mini img,.support-image img,.latest-thumb img,.region-story,.region-story img,.save-icon svg{transition-duration:.24s!important}
}
</style>
<script>try{if('IntersectionObserver' in window)document.documentElement.classList.add('motion-ready')}catch(e){}</script>
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'Nuvellum',url:canonical,description})}</script>
</head>
<body data-home-version="nuvellum-editorial-home-v6">
<script>${THEME_BODY}</script>
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
      <a class="icon-btn" id="savedOpen" href="/saved" aria-label="Saved stories"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="bookmark-shadow" transform="translate(1.35 1.55)" d="M7.35 4.15Q7.35 3.65 7.9 3.65H16.1Q16.65 3.65 16.65 4.15V19.05L12 16.35 7.35 19.05Z"/><path class="bookmark-face" d="M7.35 4.15Q7.35 3.65 7.9 3.65H16.1Q16.65 3.65 16.65 4.15V19.05L12 16.35 7.35 19.05Z"/></svg></a>
      <button class="icon-btn" id="themeToggle" type="button" aria-label="Toggle night reading" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="solid" d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z"/></svg></button>
      <button class="subscribe" type="button" data-brief-open aria-haspopup="dialog" aria-controls="briefInvitation">Subscribe</button>
    </div>
  </div>
</header>

<div class="news-ticker">
  <div class="shell ticker-inner">
    <div class="latest-label">Latest</div>
    <div class="ticker-links" aria-label="Latest headlines"><div class="ticker-track"><div class="ticker-group">${ticker}</div><div class="ticker-group" aria-hidden="true">${tickerClone}</div></div></div>
    <a class="view-all" href="/latest">View all &nbsp;→</a>
  </div>
</div>

<main class="shell home-layout">
  <div class="left-col">
    <article class="hero${heroImage ? '' : ' is-text'}">
      ${heroImage ? `<a href="${route(hero)}"><img src="${heroImage}" alt="${attr(hero.imageAlt || hero.title)}"${focusAttr(hero)}></a>` : MARK}
      <div class="hero-copy">
        <div class="hero-kicker">${esc(hero.section)}</div>
        <h1><a href="${route(hero)}">${esc(hero.title)}</a></h1>
        <div class="hero-dek">${esc(hero.dek)}</div>
        ${meta(hero)}
      </div>
    </article>
    <div class="support-grid">${supporting.map(card).join('')}</div>

    <section class="section-block latest-section" aria-labelledby="latest-heading">
      <div class="section-title"><h2 id="latest-heading">Latest</h2><span class="rule"></span><a href="/latest">View all →</a></div>
      <div class="latest-filters" role="tablist" aria-label="Filter Latest by section">${
        latestFilters.map((f, i) => `<button type="button" role="tab" id="latest-tab-${f.key}" aria-controls="latestList" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-latest-tab="${f.key}">${esc(f.label)}</button>`).join('')
      }</div>
      <div class="latest-list" id="latestList" role="tabpanel" aria-labelledby="latest-tab-all" aria-live="polite">${latestSet(latestFilters[0])}</div>
      ${latestFilters.slice(1).map(f => `<template data-latest-set="${f.key}">${latestSet(f)}</template>`).join('')}
    </section>
  </div>

  <aside class="right-col">
    <section class="panel world-desk-panel" id="world-desk">
      <div class="panel-head"><h2>World Desk</h2><a class="panel-link" href="/world-explorer">Explore the world &nbsp;→</a></div>
      <div class="world-map-wrap">
        <svg class="world-map" viewBox="${WORLD_MAP_VIEWBOX}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Interactive World Desk map">
          
          <defs>
            <filter id="atlasTexture" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="11" result="mottle"/>
              <feColorMatrix in="mottle" type="saturate" values="0" result="mottleGrey"/>
              <feComponentTransfer in="mottleGrey" result="mottleSoft"><feFuncR type="linear" slope="1.4" intercept="-0.2"/><feFuncG type="linear" slope="1.4" intercept="-0.2"/><feFuncB type="linear" slope="1.4" intercept="-0.2"/></feComponentTransfer>
              <feBlend in="mottleSoft" in2="SourceGraphic" mode="soft-light" result="toned"/>
              <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="1" seed="4" result="grain"/>
              <feColorMatrix in="grain" type="saturate" values="0" result="grainGrey"/>
              <feComponentTransfer in="grainGrey" result="grainSoft"><feFuncR type="linear" slope="0.8" intercept="0.1"/><feFuncG type="linear" slope="0.8" intercept="0.1"/><feFuncB type="linear" slope="0.8" intercept="0.1"/></feComponentTransfer>
              <feBlend in="grainSoft" in2="toned" mode="soft-light" result="textured"/>
              <feComposite in="textured" in2="SourceGraphic" operator="in"/>
            </filter>
          </defs>
          <g class="atlas-land" filter="url(#atlasTexture)">${mapRegions}</g>
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

    <section class="section-block in-focus-section">
      <div class="section-title"><h2>In Focus</h2><span class="rule"></span><a href="/section/world">View all →</a></div>
      <article class="focus-card${art(focusLead) ? '' : ' is-text'}">
        ${art(focusLead) ? `<a class="focus-media" href="${route(focusLead)}" tabindex="-1" aria-hidden="true">${img(focusLead)}</a>` : ''}
        <div class="focus-copy"><span class="chip">${esc(focusLead.type)}</span><h3><a href="${route(focusLead)}">${esc(focusLead.title)}</a></h3><p>${esc(focusLead.dek)}</p>${meta(focusLead)}</div>
      </article>
      <div class="focus-secondary">${focusSide.map(a => `
        <article class="focus-mini${art(a) ? '' : ' is-text'}">
          ${art(a) ? `<a class="focus-mini-media" href="${route(a)}" tabindex="-1" aria-hidden="true">${img(a)}</a>` : ''}
          <div><span class="eyebrow">${esc(a.type || a.section)}</span><h4><a href="${route(a)}">${esc(a.title)}</a></h4>${meta(a)}</div>
        </article>`).join('')}</div>
    </section>
  </aside>
</main>

${screenLead ? `<section class="screen" id="screen-play" aria-labelledby="screen-heading">
  <div class="shell">
    <div class="section-title"><h2 id="screen-heading">Screen &amp; Play</h2><span class="rule"></span><a href="/section/entertainment">Film · Anime · Gaming &nbsp;→</a></div>
    <div class="screen-grid">
      ${art(screenLead) ? `<article class="screen-lead">
        <a class="screen-lead-media" href="${route(screenLead)}" tabindex="-1" aria-hidden="true">${img(screenLead)}</a>
        <span class="chip">${esc(screenLead.section)}</span>
        <h3><a href="${route(screenLead)}">${esc(screenLead.title)}</a></h3>
        <p>${esc(screenLead.dek)}</p>
        ${meta(screenLead)}
      </article>` : `<article class="screen-lead is-text">
        <div class="screen-lead-panel">
          ${MARK}
          <span class="chip">${esc(screenLead.section)}</span>
          <h3><a href="${route(screenLead)}">${esc(screenLead.title)}</a></h3>
          <p>${esc(screenLead.dek)}</p>
          ${meta(screenLead)}
        </div>
      </article>`}
      <div class="screen-side">${screenSide.map(a => art(a) ? `
        <a class="screen-item" href="${route(a)}">${img(a)}<span><span class="eyebrow">${esc(a.section)}</span><h4>${esc(a.title)}</h4>${meta(a)}</span></a>` : `
        <a class="screen-item is-text" href="${route(a)}"><span><span class="eyebrow">${esc(a.section)}</span><h4>${esc(a.title)}</h4><span class="tl-dek">${esc(a.dek)}</span>${meta(a)}</span></a>`).join('')}
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
      <label class="signup-consent"><input type="checkbox" id="signupConsent" name="consent" required> <span>Send me the Nuvellum Brief by email. I can unsubscribe at any time. <a href="/privacy">Privacy</a></span></label>
      <div class="signup-hp" aria-hidden="true"><label for="signupWebsite">Website</label><input type="text" id="signupWebsite" name="website" tabindex="-1" autocomplete="off"></div>
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
        <div><h3>More</h3><a href="/advertise">Advertise &amp; Sponsorships</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/credits">Image credits</a><a href="/rss">RSS</a></div>
      </nav>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} Nuvellum. Independent international media.</span><span>Browse by initial: <a href="/headlines/n">N</a> · <a href="/headlines/u">U</a> · <a href="/headlines/v">V</a> · <a href="/headlines/e">E</a> · <a href="/headlines/l">L</a> · <a href="/headlines/m">M</a></span></div>
  </div>
</footer>

<div class="brief-invite" id="briefInvitation" role="dialog" aria-modal="true" aria-labelledby="briefInvitationTitle" hidden>
  <div class="brief-invite-backdrop" data-brief-close aria-hidden="true"></div>
  <section class="brief-invite-card" tabindex="-1">
    <button class="brief-invite-close" type="button" data-brief-close aria-label="Close the Nuvellum Brief invitation">×</button>
    <div class="brief-invite-kicker">The Nuvellum Brief</div>
    <h2 id="briefInvitationTitle">A considered dispatch, once a day.</h2>
    <p class="brief-invite-dek">The day’s consequential stories, gathered without the noise and arranged for the reader who would rather understand than merely keep up.</p>
    <form class="brief-invite-form" id="briefModalForm" novalidate>
      <label class="sr-only" for="briefModalEmail">Email address</label>
      <input type="email" id="briefModalEmail" name="email" required autocomplete="email" placeholder="you@example.com">
      <button type="submit">Receive the Brief</button>
      <label class="brief-invite-consent"><input type="checkbox" name="consent" required> <span>Send me the Nuvellum Brief by email. I can unsubscribe at any time. <a href="/privacy">Privacy</a></span></label>
      <div class="brief-invite-hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="brief-invite-msg" role="status" aria-live="polite">No noise. Unsubscribe anytime.</div>
    </form>
  </section>
</div>

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
  // Some touch browsers/WebViews report a fine pointer even though hover is unavailable.
  // Treat actual touch capability as coarse input too so the first tap reveals the wordmark
  // instead of navigating away before the reader can see it.
  const touchBrand=()=>coarsePointer?.matches===true || Number(navigator.maxTouchPoints||0)>0 || 'ontouchstart' in window;
  const closeBrand=()=>brandZone?.classList.remove('is-open');
  brandMonogram?.addEventListener('click',e=>{
    if(touchBrand() && !brandZone?.classList.contains('is-open')){
      e.preventDefault();
      brandZone?.classList.add('is-open');
    }
  });
  document.addEventListener('pointerdown',e=>{
    if(touchBrand() && brandZone?.classList.contains('is-open') && !brandZone.contains(e.target)) closeBrand();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeBrand()});

  const theme=document.getElementById('themeToggle');
  const syncTheme=()=>theme?.setAttribute('aria-pressed',String(body.classList.contains('night')));syncTheme();
  // Reading mode flips in a single frame with transitions suppressed: colour transitions made
  // the browser restyle the whole document and re-rasterise the entire page every frame.
  // Where supported, a View Transition then crossfades the two rendered states for 180ms on
  // the compositor; elsewhere the switch is instant.
  let themeRun=0;
  theme?.addEventListener('click',()=>{
    const run=++themeRun;
    theme.classList.remove('is-tapping');void theme.offsetWidth;theme.classList.add('is-tapping');
    const flip=()=>{
      body.classList.add('theme-switching');
      body.classList.toggle('night');
      document.documentElement.style.colorScheme=body.classList.contains('night')?'dark':'light';
      syncTheme();
      try{localStorage.setItem('nuvellum-theme',body.classList.contains('night')?'night':'day')}catch{}
    };
    const settle=()=>{if(run===themeRun)body.classList.remove('theme-switching')};
    const motionOk=!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(document.startViewTransition&&motionOk)document.startViewTransition(flip).finished.finally(settle);
    else{flip();requestAnimationFrame(()=>requestAnimationFrame(settle))}
  });

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

  const systemReduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  // Nuvellum keeps its restrained editorial entrances enabled even when the OS advertises
  // reduced motion; CSS below softens travel/continuous drift instead of deleting motion entirely.
  // This also avoids Windows animation settings silently turning the whole homepage static.
  const reduceMotion=false;
  if(systemReduceMotion)document.documentElement.classList.add('motion-soft');

  // Saves are delegated so rows swapped in by the Latest filters work too.
  const savedKey='nuvellum-saved-v2';
  const readSaved=()=>{try{return JSON.parse(localStorage.getItem(savedKey)||'[]')}catch{return[]}};
  const syncSaved=(root=document)=>{const list=readSaved();root.querySelectorAll('[data-save]').forEach(btn=>{const on=list.some(x=>x&&x.title===btn.dataset.save);btn.classList.toggle('saved',on);btn.setAttribute('aria-pressed',String(on))})};
  syncSaved();
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-save]');if(!btn)return;
    try{let list=readSaved();const title=btn.dataset.save;const url=btn.dataset.url;if(list.some(x=>x&&x.title===title))list=list.filter(x=>x&&x.title!==title);else list.unshift({title,url});localStorage.setItem(savedKey,JSON.stringify(list.slice(0,80)));syncSaved();btn.classList.remove('just-saved');void btn.offsetWidth;btn.classList.add('just-saved');setTimeout(()=>btn.classList.remove('just-saved'),380)}catch{}
  });

  const detail=document.getElementById('regionDetail');
  const mapLinks=[...document.querySelectorAll('[data-region]')];
  const tabs=[...document.querySelectorAll('[data-region-tab]')];
  const tooltip=document.getElementById('mapTooltip');
  const regionLabels=${JSON.stringify(Object.fromEntries(REGIONS.map(r=>[r.slug,r.label])))};
  const regionCounts=${JSON.stringify(Object.fromEntries(REGIONS.map(r=>[r.slug,regionMap.get(r.slug)?.length||0])))};
  // The old rows exit briefly, then the new ones enter one by one; the map and tabs update at
  // once. Only the latest choice is rendered if regions change in quick succession.
  let activeRegion='',regionSwap=0;
  const activate=slug=>{
    if(slug===activeRegion)return;
    activeRegion=slug;
    mapLinks.forEach(el=>el.classList.toggle('is-active',el.dataset.region===slug));
    tabs.forEach(el=>{const on=el.dataset.regionTab===slug;el.classList.toggle('is-active',on);el.setAttribute('aria-pressed',String(on))});
    const template=document.querySelector('template[data-region-template="'+slug+'"]');
    if(!template||!detail)return;
    const token=++regionSwap;
    const swap=(immediate)=>{
      if(token!==regionSwap)return;
      detail.innerHTML=template.innerHTML;
      detail.classList.remove('swap-in');
      if(immediate){detail.classList.remove('swap-out');detail.classList.add('swap-in');return}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==regionSwap)return;detail.classList.remove('swap-out');detail.classList.add('swap-in')}));
    };
    if(reduceMotion||!detail.children.length){swap(true);return}
    detail.classList.add('swap-out');
    setTimeout(swap,160);
  };
  tabs.forEach(tab=>tab.addEventListener('click',()=>activate(tab.dataset.regionTab)));
  mapLinks.forEach(link=>{
    const slug=link.dataset.region;
    link.addEventListener('mouseenter',e=>{activate(slug);if(tooltip){tooltip.querySelector('strong').textContent=regionLabels[slug]||slug;const n=regionCounts[slug]||0;tooltip.querySelector('span').textContent=n+(n===1?' story':' stories');tooltip.style.opacity='1';placeTip(e)}});
    link.addEventListener('mousemove',placeTip);
    link.addEventListener('mouseleave',()=>{if(tooltip)tooltip.style.opacity='0'});
    link.addEventListener('focus',()=>activate(slug));
    link.addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();activate(slug)});
  });
  function placeTip(e){if(!tooltip)return;const p=document.querySelector('.world-map-wrap').getBoundingClientRect();const w=tooltip.offsetWidth-14,h=tooltip.offsetHeight+16;const x=Math.max(22,Math.min(e.clientX-p.left,p.width-w)),y=Math.max(e.clientY-p.top,h);tooltip.style.left=x+'px';tooltip.style.top=y+'px'}
  activate('${defaultRegion.slug}');

  // Latest filters swap the five visible rows from inert <template> sets; the list keeps its
  // five-row height, so the column never changes size.
  const latestTabs=[...document.querySelectorAll('[data-latest-tab]')];
  const latestList=document.getElementById('latestList');
  const latestSets={all:latestList?.innerHTML||''};
  document.querySelectorAll('template[data-latest-set]').forEach(t=>{latestSets[t.dataset.latestSet]=t.innerHTML});
  let latestSwap=0;
  const selectLatest=(tab,focus)=>{
    if(focus)tab.focus();
    if(!latestList||tab.getAttribute('aria-selected')==='true')return;
    latestTabs.forEach(t=>{const on=t===tab;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1});
    latestList.setAttribute('aria-labelledby',tab.id);
    const token=++latestSwap;
    const swap=()=>{
      if(token!==latestSwap)return;
      latestList.innerHTML=latestSets[tab.dataset.latestTab]||'';
      latestList.querySelectorAll('.latest-row').forEach(row=>row.classList.add('is-visible'));
      syncSaved(latestList);relative();
      if(reduceMotion){latestList.classList.remove('is-leaving','is-entering');return}
      // New rows stay hidden (is-leaving) for two frames so insertion and image decoding
      // cannot swallow the start of the staggered entrance.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==latestSwap)return;latestList.classList.remove('is-leaving');latestList.classList.add('is-entering')}));
    };
    if(reduceMotion){swap();return}
    latestList.classList.remove('is-entering');latestList.classList.add('is-leaving');
    setTimeout(swap,220);
  };
  latestTabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>selectLatest(tab));
    tab.addEventListener('keydown',e=>{const n=latestTabs.length;const j={ArrowRight:(i+1)%n,ArrowLeft:(i+n-1)%n,Home:0,End:n-1}[e.key];if(j===undefined)return;e.preventDefault();selectLatest(latestTabs[j],true)});
  });

  const popTabs=[...document.querySelectorAll('[data-popular-tab]')];
  const selectPopular=tab=>{popTabs.forEach(t=>{const on=t===tab;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;const panel=document.getElementById(t.getAttribute('aria-controls'));if(panel){if(on)panel.querySelectorAll('.popular-item').forEach(i=>i.classList.add('is-visible'));panel.hidden=!on;if(on){panel.classList.remove('panel-in');void panel.offsetWidth;panel.classList.add('panel-in')}}})};
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

  // Homepage motion (enabled in <head>; see REVEAL_* in the renderer).
  const root=document.documentElement;
  if(root.classList.contains('motion-ready')){
    root.classList.add('motion-live');
    const units=[...document.querySelectorAll(${JSON.stringify(REVEAL_CONTAINERS + ',' + REVEAL_ITEMS)})];
    const isContainer=el=>el.matches(${JSON.stringify(REVEAL_CONTAINERS)});
    // Scroll speed averaged over ~120ms: ordinary wheel/trackpad scrolling keeps the full,
    // staggered entrance; only a genuine flick (>4px/ms) gets the short version.
    const samples=[];let fast=false;
    addEventListener('scroll',()=>{const now=performance.now();samples.push([now,scrollY]);while(samples.length>1&&now-samples[0][0]>120)samples.shift();const dt=now-samples[0][0];fast=dt>16&&Math.abs(scrollY-samples[0][1])/dt>4},{passive:true});
    const show=(el,instant,stagger=0)=>{
      if(instant){el.classList.add('reveal-instant');setTimeout(()=>el.classList.remove('reveal-instant'),80);stagger=0}
      else if(fast){el.classList.add('reveal-quick');stagger=0}
      el.style.setProperty('--stagger',stagger+'ms');
      el.classList.add('is-visible');
      setTimeout(()=>el.style.removeProperty('--stagger'),2400);
    };
    let started=false;
    const begin=()=>{
      if(started)return;started=true;
      // Class on the hero itself: a class change on <html> would restyle and repaint the whole
      // page (including the World Desk map's SVG filter) and freeze the very frames it animates.
      document.querySelector('.hero')?.classList.add('hero-enter');
      // Units reaching the reading line together are staggered 75ms apart in screen order
      // (Screen & Play side stories follow the lead image).
      const io=new IntersectionObserver(entries=>{
        const batch=entries.filter(e=>e.isIntersecting&&!e.target.classList.contains('is-visible')).map(e=>e.target);
        const pos=el=>{const r=el.getBoundingClientRect();return r.top*4+r.left/1000};
        batch.sort((a,b)=>pos(a)-pos(b));
        let slot=0;
        batch.forEach(el=>{io.unobserve(el);if(isContainer(el)){show(el);return}show(el,false,Math.min(slot++*75,450)+(el.matches('.screen-item')?180:0))});
      },{threshold:0,rootMargin:'0px 0px -15% 0px'});
      units.forEach(el=>{if(!el.classList.contains('is-visible'))io.observe(el)});
      // Units jumped past (End key, #newsletter, restored scroll) appear at once; at the very
      // bottom of the page anything still on screen reveals normally.
      let pending=0;
      const sweep=()=>{pending=0;const atEnd=innerHeight+scrollY>=document.documentElement.scrollHeight-2;units.forEach(el=>{if(el.classList.contains('is-visible')||el.offsetParent===null)return;const r=el.getBoundingClientRect();if(r.bottom<0){io.unobserve(el);show(el,true)}else if(atEnd&&r.top<innerHeight){io.unobserve(el);show(el)}})};
      addEventListener('scroll',()=>{if(!pending)pending=requestAnimationFrame(sweep)},{passive:true});
      sweep();
      // Fetch and decode the images behind the Latest filters and World Desk regions while idle,
      // so swapped-in rows neither pop their thumbnails in late nor stall on first decode.
      const warm=()=>{const seen=new Set();document.querySelectorAll('template').forEach(t=>t.content.querySelectorAll('img[src]').forEach(img=>{const src=img.getAttribute('src');if(seen.has(src))return;seen.add(src);const i=new Image();i.decoding='async';i.src=src;i.decode?.().catch(()=>{})}))};
      ('requestIdleCallback' in window)?requestIdleCallback(warm,{timeout:3000}):setTimeout(warm,1500);
    };
    // Begin on the first stable painted frames so the hero entrance is visible instead of
    // starting late enough to look like a static page. The timeout is only a safety fallback.
    requestAnimationFrame(()=>requestAnimationFrame(begin));
    setTimeout(begin,320);
  }

  // The Nuvellum Brief: the masthead opens a quiet in-page invitation instead of
  // jumping the reader down the page. Both forms use the same consent-first endpoint.
  const briefModal=document.getElementById('briefInvitation');
  const briefModalForm=document.getElementById('briefModalForm');
  let briefReturnFocus=null;
  const openBrief=(opener)=>{
    if(!briefModal)return;
    briefReturnFocus=opener||document.activeElement;
    if(briefModalForm)briefModalForm.dataset.opened=String(Date.now());
    briefModal.hidden=false;body.classList.add('brief-open');
    requestAnimationFrame(()=>briefModal.querySelector('input[type=email]')?.focus());
  };
  const closeBrief=()=>{
    if(!briefModal||briefModal.hidden)return;
    briefModal.hidden=true;body.classList.remove('brief-open');
    if(briefReturnFocus&&typeof briefReturnFocus.focus==='function')briefReturnFocus.focus();
  };
  document.querySelectorAll('[data-brief-open]').forEach(el=>el.addEventListener('click',()=>openBrief(el)));
  briefModal?.querySelectorAll('[data-brief-close]').forEach(el=>el.addEventListener('click',closeBrief));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&briefModal&&!briefModal.hidden){e.preventDefault();closeBrief()}
    if(e.key==='Tab'&&briefModal&&!briefModal.hidden){
      const focusable=[...briefModal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')].filter(el=>el.offsetParent!==null);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  });

  function wireBriefForm(form,source){
    if(!form)return;
    if(!form.dataset.opened)form.dataset.opened=String(Date.now());
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const email=form.querySelector('input[name=email]'),consent=form.querySelector('input[name=consent]'),website=form.querySelector('input[name=website]'),msg=form.querySelector('[role=status]'),btn=form.querySelector('button[type=submit]');
      if(!email||!msg||!consent||!btn||btn.disabled)return;
      const say=(t,err)=>{msg.textContent=t;msg.classList.toggle('is-error',!!err)};
      if(!email.checkValidity()||!email.value.trim()){say('Please enter a valid email address.',1);email.focus();return}
      if(!consent.checked){say('Please tick the box to confirm you want the Brief.',1);consent.focus();return}
      btn.disabled=true;say('Signing you up…');
      try{
        const res=await fetch('/api/brief?action=subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,consent:true,website:website?.value||'',elapsedMs:Date.now()-Number(form.dataset.opened||Date.now()),source})});
        const data=await res.json().catch(()=>({}));
        if(res.ok){say(data.message||'Thank you. You are on the list for the Nuvellum Brief.');form.reset();dispatchEvent(new CustomEvent('nuvellum:brief-signup',{detail:{source}}))}
        else say(data.error||'Something went wrong. Please try again.',1);
      }catch{say('Could not reach Nuvellum. Check your connection and try again.',1)}
      finally{btn.disabled=false}
    });
  }
  wireBriefForm(document.getElementById('signup'),'home');
  wireBriefForm(briefModalForm,'header');

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
})();
</script>
</body>
</html>`;

writeFileSync(homePath, html);
console.log(`Rendered editorial homepage v6 with ${articles.length} published stories.`);
