// Which published stories go where on the homepage. Pure (no files, no HTML) so the rules can be tested;
// scripts/render-editorial-home.mjs renders the result. Every published story takes part on equal terms,
// whether it came from the automated newsroom (origin: "automation"), the Editorial Desk (origin: "manual")
// or the launch set: placement depends only on date, section and type, never on origin.
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { hasStoryImage } from '../../src/lib/story-image.js';

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

export function parseFrontmatter(src) {
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

/** Newest first: date, then publish time, then slug. */
export const byNewest = (a, b) => String(b.date || '').localeCompare(String(a.date || ''))
  || String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
  || a.slug.localeCompare(b.slug);

/** Published stories from a folder of Markdown articles, newest first. */
export function loadPublished(articlesDir) {
  return readdirSync(articlesDir)
    .filter(name => name.endsWith('.md'))
    .map(name => ({ slug: basename(name, '.md'), ...parseFrontmatter(readFileSync(join(articlesDir, name), 'utf8')) }))
    .filter(article => article.status === 'published')
    .sort(byNewest);
}

export const LATEST_ROWS = 5;
/** How far down the newest stories the hero may look for one with a picture. */
export const HERO_WINDOW = 6;
const LATEST_FILTERS = [
  { key: 'all', label: 'All', href: '/latest', match: () => true },
  { key: 'world', label: 'World', href: '/section/world', match: s => s === 'world' },
  { key: 'business', label: 'Business', href: '/section/business', match: s => s === 'business' },
  { key: 'tech', label: 'Tech', href: '/section/technology', match: s => s === 'technology' },
  { key: 'culture', label: 'Culture', href: '/section/culture', match: s => s === 'culture' },
  { key: 'screen', label: 'Screen & Play', href: '/section/entertainment', match: s => ['film & tv', 'anime', 'gaming'].includes(s) },
  { key: 'sports', label: 'Sports', href: '/section/sports', match: s => s === 'sports' }
];

/**
 * Homepage placement from published stories (any order; they are sorted newest first here).
 *  hero: the newest World story with a real or representative image among the six newest World stories,
 *        otherwise the newest story with an image among the six newest overall, otherwise (no image anywhere
 *        near the top) the newest World story / newest story as before. A text-led hero leaves a huge empty
 *        ivory slot, so a strong story with a picture leads when one is this fresh.
 *  supporting: the newest story from each of three other sections, topped up with the newest remaining
 *  latestFilters: per filter, up to five of the newest stories not already shown above
 *  focusStories: In Focus (a World analysis first, then analysis/explainer/opinion formats)
 */
export function selectHome(published) {
  const articles = [...published].filter(a => a.status === undefined || a.status === 'published').sort(byNewest);
  if (!articles.length) throw new Error('Editorial homepage requires at least one published story.');
  const world = articles.filter(a => String(a.section).toLowerCase() === 'world');
  const hero = world.slice(0, HERO_WINDOW).find(hasStoryImage)
    || articles.slice(0, HERO_WINDOW).find(hasStoryImage)
    || world[0] || articles[0];
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
  const latestFilters = LATEST_FILTERS.map(filter => ({
    ...filter,
    items: articles.filter(a => !onTop.has(a.slug) && filter.match(String(a.section || '').toLowerCase())).slice(0, LATEST_ROWS)
  }));
  // In Focus avoids repeating the stories already on top of the page (hero and supporting row); it only
  // falls back to them when the edition is too small to fill the block otherwise.
  const fresh = articles.filter(a => !onTop.has(a.slug));
  const focus = fresh.find(a => String(a.section).toLowerCase() === 'world' && String(a.type).toLowerCase() === 'analysis')
    || fresh.find(a => String(a.section).toLowerCase() === 'world')
    || fresh[0]
    || articles.find(a => a.slug !== hero.slug)
    || hero;
  const focusStories = [focus];
  const add = (pool, test = () => true) => {
    for (const a of pool) {
      if (focusStories.length === 3) break;
      if (a.slug !== hero.slug && !focusStories.some(x => x.slug === a.slug) && test(a)) focusStories.push(a);
    }
  };
  add(fresh, a => ['analysis', 'feature', 'explainer', 'opinion'].includes(String(a.type || '').toLowerCase()));
  add(fresh);
  add(articles);
  return { articles, world, hero, supporting, onTop, latestFilters, focusStories };
}
