#!/usr/bin/env node
// Render sample cards (real published stories and the edge-case fixtures), rasterise them in Chromium at their
// exact size and verify every text line against its fitted box.
//   node engines/cards/sample-qa.mjs [--out <dir>] [slug ...]
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { renderSocialCards } from './render.mjs';
import { rasterise } from './raster.mjs';
import { FIXTURES } from './fixtures.mjs';

const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const out = oi >= 0 ? argv[oi + 1] : join(REPO_ROOT, 'engines', 'out', 'card-samples');
const slugs = argv.filter((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1));
const jobs = slugs.length ? slugs.map((s) => ({ story: loadStory(s) })) : Object.values(FIXTURES);
const files = [];
for (const job of jobs) {
  const m = renderSocialCards(job.story, out, job.options || {});
  console.log(`${m.slug}: ${m.variant}, ${m.sourceMode}${m.quote.kind ? ', ' + m.quote.kind : ''} | ` + m.assets.map((a) => `${a.format} ${a.headline ? a.headline.size + 'px x' + a.headline.lines + (a.headline.layout !== 'normal' ? ' ' + a.headline.layout : '') : a.quote.size + 'px x' + a.quote.lines}`).join(', '));
  for (const f of readdirSync(join(out, m.slug))) if (f.endsWith('.svg')) files.push(join(out, m.slug, f));
}
const res = await rasterise(files);
const bad = res.filter((r) => r.overflow.length);
for (const r of bad) console.log('OVERFLOW', r.file, r.overflow);
console.log(`${res.length} cards rasterised in Chromium, ${bad.length} with overflow`);
process.exit(bad.length ? 1 : 0);
