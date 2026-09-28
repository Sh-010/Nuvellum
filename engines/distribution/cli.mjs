#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { buildDistributionDraft } from './engine.mjs';

const argv = process.argv.slice(2);
const value = (name) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const slug = value('slug');
if (!slug) {
  console.error('Usage: node distribution/cli.mjs --slug <article-slug> [--platforms x,threads,facebook,linkedin,instagram,tiktok,youtube]');
  process.exit(1);
}
const platforms = value('platforms')?.split(',').map(x => x.trim()).filter(Boolean);
const story = loadStory(slug);
const report = buildDistributionDraft(story, { platforms });
const outDir = join(REPO_ROOT, 'engines', 'out', 'distribution');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, slug + '.json');
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
for (const [platform, draft] of Object.entries(report.drafts)) {
  const body = platform === 'youtube' ? draft.title + '\n\n' + draft.description : draft.text;
  console.log('\n[' + platform + ']\n' + body + '\nmedia: ' + draft.media.mode);
}
for (const note of report.notes) console.log('note: ' + note);
console.log('\nreport: ' + out);
