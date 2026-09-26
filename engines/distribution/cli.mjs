#!/usr/bin/env node
// Usage:
//   node distribution/cli.mjs --slug <slug> [--platforms x,threads] [--video out/short.mp4] [--image-url https://...]
//   Add --live (or DISTRIBUTION_LIVE=1) to actually post. Default is a dry run that posts nothing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { distribute } from './engine.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
if (!args.slug) { console.error('Usage: node distribution/cli.mjs --slug <article-slug> [--live] [--platforms x,threads,...]'); process.exit(1); }

const story = loadStory(args.slug);
const report = await distribute(story, {
  live: Boolean(args.live) || process.env.DISTRIBUTION_LIVE === '1',
  platforms: typeof args.platforms === 'string' ? args.platforms.split(',') : undefined,
  media: { videoPath: typeof args.video === 'string' ? args.video : undefined, imageUrl: typeof args['image-url'] === 'string' ? args['image-url'] : undefined }
});
const outDir = join(REPO_ROOT, 'engines', 'out', 'distribution');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${story.slug}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
for (const r of report.results) console.log(`${r.platform.padEnd(10)} ${r.status}${r.reason ? ` — ${r.reason}` : ''}${r.error ? ` — ${r.error}` : ''}`);
for (const n of report.notes) console.log(`note: ${n}`);
console.log(`report: ${file}`);
