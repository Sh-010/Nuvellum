#!/usr/bin/env node
// Shorts autopilot, driven by .github/workflows/shorts-autopilot.yml:
//   select     --ledger DIR [--slug S] [--assets TREE]  choose the next story (prints JSON; slug → GITHUB_OUTPUT)
//              TREE: `git ls-tree -r --name-only` of social-assets; a story that already has shorts/<slug>/short.mp4
//              there (made by hand before the autopilot) counts as done.
//   pending    --ledger DIR                     a rendered Short with a retryable (queued) upload, for a retry run
//   verify     --slug S                         check the rendered files; exit 1 with the problems
//   record     --ledger DIR --slug S --status rendered|failed [--error MSG]
//   distribute --ledger DIR --slug S [--live]   hand the verified Short to the video platforms
// DIR is the shorts/ folder of a social-ledger checkout. Rendering itself is engines/shorts/cli.mjs.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { shortEligibility, chooseShort, verifyShort, MAX_RENDER_FAILURES } from './autopilot.mjs';
import { ffprobeBin } from './tts.mjs';
import { distributeShort } from '../publish/video.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const get = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined; };
const ledgerDir = typeof get('ledger') === 'string' ? get('ledger') : null;
const slugArg = typeof get('slug') === 'string' ? get('slug') : null;
const now = Date.now();
const ASSET_BASE = (process.env.NUVELLUM_ASSET_BASE || 'https://cdn.jsdelivr.net/gh/Sh-010/Nuvellum@social-assets').replace(/\/$/, '');
const outDir = (slug) => join(REPO_ROOT, 'engines', 'out', 'shorts', slug);
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

const readLedger = () => {
  const entries = ledgerDir && existsSync(ledgerDir) ? readdirSync(ledgerDir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(join(ledgerDir, n), 'utf8'))) : [];
  const tree = typeof get('assets') === 'string' && existsSync(get('assets')) ? readFileSync(get('assets'), 'utf8') : '';
  for (const m of tree.matchAll(/^shorts\/([a-z0-9-]+)\/short\.mp4$/gm)) {
    if (!entries.some((e) => e.slug === m[1])) entries.push({ slug: m[1], render: { status: 'rendered', at: '1970-01-01T00:00:00Z', manual: true } });
  }
  return entries;
};
const entryFor = (slug, story) => {
  const file = join(ledgerDir, `${slug}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { slug, title: story?.title || '', risk: story?.risk || '', firstSeenAt: new Date(now).toISOString(), platforms: {} };
};
const save = (entry) => { mkdirSync(ledgerDir, { recursive: true }); writeFileSync(join(ledgerDir, `${entry.slug}.json`), JSON.stringify({ ...entry, updatedAt: new Date(now).toISOString() }, null, 2) + '\n'); };

function publishedStories() {
  const out = [];
  for (const n of readdirSync(join(REPO_ROOT, 'src', 'content', 'articles')).filter((x) => x.endsWith('.md'))) {
    try { out.push(loadStory(n.slice(0, -3))); } catch { /* unpublished or placeholder: never a Short */ }
  }
  return out;
}

if (cmd === 'select') {
  const stories = slugArg ? [loadStory(slugArg)] : publishedStories();
  const candidates = stories.map((story) => ({ story, eligibility: shortEligibility(story, { now }) }));
  let choice;
  if (slugArg) {
    // A named slug skips the recency window and daily limit, never the safety rules.
    const reasons = candidates[0].eligibility.reasons.filter((r) => !/^published \d+h ago/.test(r));
    const state = readLedger().find((e) => e.slug === slugArg)?.render?.status;
    choice = reasons.length ? { slug: null, reason: `not eligible: ${reasons.join('; ')}` }
      : state === 'rendered' ? { slug: null, reason: 'already has a Short' } : { slug: slugArg, reason: 'requested' };
  } else choice = chooseShort(candidates, readLedger(), { now });
  const considered = candidates.filter((c) => Date.parse(c.story.publishedAt || 0) > now - 72 * 3600000)
    .map((c) => ({ slug: c.story.slug, eligible: c.eligibility.eligible, score: c.eligibility.score, reasons: c.eligibility.reasons }));
  console.log(JSON.stringify({ ...choice, considered }, null, 2));
  output('slug', choice.slug || '');
  process.exit(0);
}

if (cmd === 'pending') {
  const due = readLedger().filter((e) => e.render?.status === 'rendered' && !e.render.manual && Object.values(e.platforms || {}).some((p) => p.status === 'queued'))
    .sort((a, b) => String(b.render.at).localeCompare(String(a.render.at)))[0];
  console.log(due ? `retrying uploads for ${due.slug}` : 'no queued uploads');
  output('retry', due?.slug || '');
  process.exit(0);
}

if (cmd === 'verify') {
  const dir = outDir(slugArg);
  const read = (f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } };
  const sizes = Object.fromEntries(['short.mp4', 'poster.jpg', 'captions.srt', 'script.json', 'plan.json', 'report.json'].map((f) => [f, existsSync(join(dir, f)) ? statSync(join(dir, f)).size : 0]));
  let probe = {};
  try {
    const j = JSON.parse(execFileSync(ffprobeBin(), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', join(dir, 'short.mp4')], { encoding: 'utf8' }));
    const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
    const a = (j.streams || []).find((s) => s.codec_type === 'audio') || {};
    probe = { width: v.width, height: v.height, videoCodec: v.codec_name, audioCodec: a.codec_name, duration: Number(j.format?.duration) };
  } catch (err) { probe = { error: err.message }; }
  const problems = verifyShort({ report: read('report.json'), script: read('script.json'), story: loadStory(slugArg), probe, sizes });
  console.log(JSON.stringify({ slug: slugArg, probe, sizes, problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

if (cmd === 'record') {
  const story = loadStory(slugArg);
  const entry = entryFor(slugArg, story);
  const status = get('status');
  const prev = entry.render || {};
  if (status === 'rendered') {
    const report = JSON.parse(readFileSync(join(outDir(slugArg), 'report.json'), 'utf8'));
    const assets = Object.fromEntries(['short.mp4', 'poster.jpg', 'captions.srt', 'script.json', 'plan.json', 'report.json'].map((f) => [f.split('.')[0], `${ASSET_BASE}/shorts/${slugArg}/${f}`]));
    entry.render = { status: 'rendered', at: new Date(now).toISOString(), seconds: report.seconds, tts: report.tts, failures: prev.failures || 0, assets };
  } else if (status === 'failed') {
    const failures = (prev.failures || 0) + 1;
    entry.render = { status: 'failed', at: new Date(now).toISOString(), failures, error: String(get('error') || 'render or verification failed').slice(0, 300), final: failures >= MAX_RENDER_FAILURES };
  } else { console.error('record: --status rendered|failed'); process.exit(2); }
  save(entry);
  console.log(`${slugArg}: ${entry.render.status}${entry.render.error ? ` (${entry.render.error})` : ''}`);
  process.exit(0);
}

if (cmd === 'distribute') {
  const story = loadStory(slugArg);
  const entry = entryFor(slugArg, story);
  const file = join(outDir(slugArg), 'short.mp4');
  const verified = entry.render?.status === 'rendered' && existsSync(file);
  const bytes = verified ? readFileSync(file) : null;
  const video = verified ? { bytes, size: bytes.length, url: `${ASSET_BASE}/shorts/${slugArg}/short.mp4` } : null;
  const live = get('live') === true && String(process.env.NUVELLUM_SOCIAL || '').toLowerCase() === 'on';
  const { entry: next, lines } = await distributeShort({ story, entry, env: process.env, verified, video, live, now, save });
  save(next);
  for (const l of lines) console.log(l);
  process.exit(0); // platform failures are recorded in the ledger and alerted on; they never fail the run
}

console.error('Usage: autopilot-cli.mjs select|verify|record|distribute --ledger DIR --slug S');
process.exit(2);
