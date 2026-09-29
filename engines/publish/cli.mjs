#!/usr/bin/env node
// Social publisher. Runs in GitHub Actions on a schedule (and on dispatch), never inside the site build or the
// publish gate, so a social failure can never block or undo publication.
//
//   node engines/publish/cli.mjs --ledger <dir> [--slug <slug>] [--live]
//
// Without --live (or when NUVELLUM_SOCIAL is not "on") it only prints the plan and writes nothing.
// Candidates: stories that reached main within WINDOW_HOURS (or --slug), plus any story with queued
// platforms in the ledger. The ledger (one JSON file per story) lives on the social-ledger branch.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { generateFeedCopy } from '../distribution/copy.mjs';
import { BRAND } from '../shared/brand.mjs';
import { ADAPTERS, PostError } from './adapters.mjs';
import { planStory, record, outcome, WINDOW_HOURS } from './plan.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
const ledgerDir = arg('ledger');
const onlySlug = arg('slug');
const live = argv.includes('--live') && process.env.NUVELLUM_SOCIAL === 'on';
if (!ledgerDir) { console.error('Usage: cli.mjs --ledger <dir> [--slug <slug>] [--live]'); process.exit(1); }
mkdirSync(ledgerDir, { recursive: true });
const env = process.env;
const now = Date.now();

const readEntry = (slug) => { const f = join(ledgerDir, slug + '.json'); try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; } };
const writeEntry = (entry) => { if (live) writeFileSync(join(ledgerDir, entry.slug + '.json'), JSON.stringify(entry, null, 2) + '\n'); };

/** When the article file first reached main (commit time), from git history. */
function reachedMain(slug) {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%cI', '-1', '--', `src/content/articles/${slug}.md`], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return out ? Date.parse(out) : null;
  } catch { return null; }
}

function candidates() {
  if (onlySlug) return [onlySlug];
  const set = new Set();
  for (const f of readdirSync(join(REPO_ROOT, 'src', 'content', 'articles')).filter((f) => f.endsWith('.md'))) {
    const slug = f.slice(0, -3);
    const t = reachedMain(slug);
    if (t && now - t <= WINDOW_HOURS * 3600e3) set.add(slug);
  }
  for (const f of readdirSync(ledgerDir).filter((f) => f.endsWith('.json'))) {
    const e = readEntry(f.slice(0, -5));
    if (e && Object.values(e.platforms || {}).some((p) => p.status === 'queued')) set.add(e.slug);
  }
  return [...set].sort();
}

async function isLive(url) {
  try { const r = await fetch(url, { method: 'GET', redirect: 'follow' }); return r.status === 200; } catch { return false; }
}

const summary = [];
for (const slug of candidates()) {
  let story;
  try { story = loadStory(slug); } catch (e) { console.log(`- ${slug}: not eligible (${e.message})`); continue; }
  let entry = readEntry(slug) || { slug, url: story.url, title: story.title, risk: story.risk, firstSeenAt: new Date(now).toISOString(), platforms: {} };
  const hasShort = existsSync(join(REPO_ROOT, 'engines', 'out', 'shorts', slug, 'short.mp4'));
  const plan = planStory({ ledger: entry, env, live: await isLive(story.url), hasShort });
  const copy = generateFeedCopy(story).copy;
  const feedCopy = Object.fromEntries(Object.entries(copy).map(([p, text]) => [p, { text }]));
  for (const step of plan) {
    if (step.action === 'keep') continue;
    if (step.action === 'record') {
      const prev = entry.platforms[step.platform];
      if (prev?.status !== step.status || prev?.reason !== step.reason) entry = record(entry, step.platform, { status: step.status, reason: step.reason }, now);
      continue;
    }
    if (!live) { summary.push(`${slug} ${step.platform}: would post (dry run)`); continue; }
    let result;
    try {
      const r = await ADAPTERS[step.platform].post(story, { env, siteUrl: BRAND.siteUrl, copy: feedCopy });
      result = { ok: true, at: new Date().toISOString(), ...r };
    } catch (e) {
      result = { ok: false, retryable: e instanceof PostError ? e.retryable : true, error: e instanceof PostError ? e.message : `${step.platform}: ${e.name || 'Error'}` };
    }
    entry = record(entry, step.platform, outcome(entry.platforms[step.platform], result), now);
    writeEntry(entry); // after every post, so a later crash cannot cause a duplicate on the next run
  }
  writeEntry(entry);
  summary.push(`${slug}: ` + Object.entries(entry.platforms).map(([p, s]) => `${p}=${s.status}`).join(' '));
}
console.log(`Social publisher (${live ? 'LIVE' : 'dry run'}; window ${WINDOW_HOURS}h)`);
for (const line of summary) console.log(' ' + line);
if (!summary.length) console.log(' nothing to do');
