// Regression: a World Desk region shows ONLY stories whose regions metadata names it. Empty regions used to be
// topped up with the latest World stories (homepage desk) or a "From the World desk" block (/world/<region>),
// which put e.g. a Sub-Saharan Africa story under Latin America and duplicated stories across desks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS, storiesByRegion, regionsForArticle } from '../src/lib/geography.js';
import { parseFrontmatter } from '../scripts/lib/home-selection.mjs';

const zimbabwe = { slug: 'zimbabwe-helicopter', section: 'World', status: 'published', title: 'Zimbabwe businessman killed in helicopter crash', regions: ['sub-saharan-africa'], countries: ['Zimbabwe'] };
const reneeGood = { slug: 'renee-good-lawsuit', section: 'World', status: 'published', title: 'Family sues over fatal shooting', regions: ['north-america'], countries: ['United States'] };

test('a Sub-Saharan Africa article belongs to that desk only, never Latin America or North America', () => {
  const map = storiesByRegion([zimbabwe, reneeGood]);
  assert.deepEqual(map.get('sub-saharan-africa').map((a) => a.slug), ['zimbabwe-helicopter']);
  assert.deepEqual(map.get('latin-america-caribbean'), [], 'an empty region stays empty');
  assert.deepEqual(map.get('north-america').map((a) => a.slug), ['renee-good-lawsuit']);
  for (const r of REGIONS) if (r.slug !== 'sub-saharan-africa') assert.ok(!map.get(r.slug).includes(zimbabwe), r.slug);
});

test('the homepage desk template never tops a region up with other World stories', () => {
  const src = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
  const fn = src.slice(src.indexOf('function regionTemplate('), src.indexOf('const maxRegionCount'));
  assert.doesNotMatch(fn, /world\.filter|is-fill|World desk ·/);
  assert.match(fn, /No stories on this desk yet\./);
  assert.doesNotMatch(readFileSync('src/pages/world/[region].astro', 'utf8'), /From the World desk|worldDesk/);
});

// Built output: every region, homepage desk and region page.
const dist = 'dist';
const built = existsSync(join(dist, 'index.html'));
const articles = readdirSync('src/content/articles').filter((n) => n.endsWith('.md'))
  .map((n) => ({ slug: n.slice(0, -3), ...parseFrontmatter(readFileSync(join('src/content/articles', n), 'utf8')) }))
  .filter((a) => a.status === 'published');
const regionsOf = new Map(articles.map((a) => [a.slug, regionsForArticle(a)]));
const linkedSlugs = (html) => [...html.matchAll(/href="\/article\/([a-z0-9-]+)"/g)].map((m) => m[1]);

test('built homepage: each region panel lists only its own stories, or the empty state', { skip: !built && 'run npm run build first' }, () => {
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  for (const r of REGIONS) {
    const t = home.match(new RegExp(`<template data-region-template="${r.slug}">([\\s\\S]*?)</template>`));
    assert.ok(t, `template for ${r.slug}`);
    const list = t[1].match(/<div class="region-story-list">([\s\S]*?)<\/div>\s*<aside/)[1];
    const slugs = linkedSlugs(list);
    for (const s of slugs) assert.ok(regionsOf.get(s)?.includes(r.slug), `${s} must not appear under ${r.slug}`);
    if (!slugs.length) assert.match(list, /No stories on this desk yet\./, `${r.slug} shows the empty state`);
  }
});

test('built region pages: /world/<region> lists only stories filed to that region', { skip: !built && 'run npm run build first' }, () => {
  for (const r of REGIONS) {
    const file = join(dist, 'world', r.slug, 'index.html');
    if (!existsSync(file)) continue;
    // The page body only: from <main> to the country gazetteer (the site-wide header ticker lists every story).
    const html = readFileSync(file, 'utf8');
    const main = html.slice(html.indexOf('<main'), html.indexOf('aria-labelledby="gazetteer"'));
    assert.ok(main.length > 0, `main content of /world/${r.slug}`);
    for (const s of linkedSlugs(main)) assert.ok(regionsOf.get(s)?.includes(r.slug), `${s} must not appear on /world/${r.slug}`);
  }
});
