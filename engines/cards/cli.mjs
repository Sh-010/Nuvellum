#!/usr/bin/env node
// Render the Nuvellum social cards for one published story.
//   node engines/cards/cli.mjs --slug <slug> [--variant standard|breaking|analysis|culture] [--no-quote] [--png]
// --png rasterises every card in Chromium (playwright-core; set CHROMIUM_PATH or install its Chromium) and
// fails if any text line leaves its box. Output: engines/out/social-cards/<slug>/ plus manifest.json.
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { join } from 'node:path';
import { renderSocialCards, SOCIAL_CARD_DIR } from './render.mjs';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
const slug = val('slug');
if (!slug) {
  console.error('Usage: node cards/cli.mjs --slug <published-article-slug> [--variant standard|breaking|analysis|culture] [--no-quote] [--png]');
  process.exit(1);
}
const variant = val('variant');
if (variant && !['standard', 'breaking', 'analysis', 'culture'].includes(variant)) { console.error('unknown --variant'); process.exit(1); }

const manifest = renderSocialCards(loadStory(slug), SOCIAL_CARD_DIR, { variant: variant || undefined, quote: !argv.includes('--no-quote') });
if (argv.includes('--png')) {
  const { rasterise } = await import('./raster.mjs');
  const res = await rasterise(manifest.assets.map((a) => join(REPO_ROOT, a.path)));
  for (const a of manifest.assets) a.png = a.path.replace(/\.svg$/, '.png');
  const bad = res.filter((r) => r.overflow.length);
  for (const r of bad) console.error('OVERFLOW', r.file, r.overflow);
  if (bad.length) process.exit(2);
}
console.log(JSON.stringify(manifest, null, 2));
