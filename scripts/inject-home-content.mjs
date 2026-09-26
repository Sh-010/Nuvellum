import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicDir } from './lib/paths.mjs';

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
  return `<article class="${cls}" tabindex="0" data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}"><div class="media"><span class="quick-chip">Quick view</span><img src="${art(a)}" alt="${attr(a.imageAlt || `Editorial illustration for ${a.title}`)}"></div><div class="kicker">${esc(a.section.toUpperCase())}</div><h3>${esc(a.title)}</h3>${p}<button class="bookmark" data-save="${attr(a.title)}" data-cat="${attr(a.section)}">${saveText}</button></article>`;
}

function opinionMarkup(a) {
  const initials = String(a.author||'N').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return `<article class="opinion reveal interactive-story motion-story" tabindex="0" data-title="${attr(a.title)}" data-kicker="${attr(kicker(a))}" data-route="${route(a)}"><div class="avatar">${esc(initials)}</div><div><div class="kicker">${esc(a.type.toUpperCase())}</div><h3>${esc(a.title)}</h3><small>By ${esc(a.author)}</small></div></article>`;
}

const worldReal = real.filter(a => String(a.section).toLowerCase() === 'world');
const screenReal = real.filter(a => ['film & tv','anime','gaming'].includes(String(a.section).toLowerCase()));
const opinionReal = real.filter(a => ['opinion','essay','ideas'].includes(String(a.type).toLowerCase()) || String(a.section).toLowerCase() === 'opinion');

const hero = worldReal[0] || real[0];
const sides = real.filter(a => a.slug !== hero.slug).slice(0,3);

segmentReplace('<section class="hero wrap">', '<section class="latest-band"', seg => {
  seg = seg.replace(/<article class="lead reveal"[\s\S]*?<\/article>/, leadMarkup(hero));
  let i = 0;
  seg = seg.replace(/<article class="side reveal interactive-story motion-story"[\s\S]*?<\/article>/g, original => {
    const a = sides[i++];
    return a ? sideMarkup(a, i === 1) : original;
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

writeFileSync(homePath, html);
console.log(`Injected ${real.length} published automated stories into v5.1 homepage slots without changing layout CSS.`);
