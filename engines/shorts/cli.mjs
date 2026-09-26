#!/usr/bin/env node
// Usage: node shorts/cli.mjs --slug <article-slug> [--preview] [--no-render] [--out dir]
//   --preview renders at 1/2 resolution and 15 fps for a quick look.
// TTS chain: NUVELLUM_TTS (default "piper,espeak,silent"). Script model: NUVELLUM_ROLE_SHORTS_SCRIPT.
import { loadStory } from '../shared/article.mjs';
import { makeShort } from './engine.mjs';

const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined; };
if (!get('slug')) { console.error('Usage: node shorts/cli.mjs --slug <article-slug> [--preview] [--no-render]'); process.exit(1); }

const story = loadStory(get('slug'));
const preview = Boolean(get('preview'));
const t0 = Date.now();
const report = await makeShort(story, {
  outDir: typeof get('out') === 'string' ? get('out') : undefined,
  scale: preview ? 0.5 : 1, fps: preview ? 15 : 30, render: !get('no-render'),
  onProgress: (f, n) => process.stdout.write(`\rrendering ${Math.round(f / n * 100)}%`)
});
process.stdout.write('\n');
console.log(JSON.stringify(report, null, 2));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(report.status === 'refused' ? 2 : 0);
