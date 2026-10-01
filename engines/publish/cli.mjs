#!/usr/bin/env node
// Social publisher. Runs in GitHub Actions on a schedule (and on dispatch), never inside the site build or the
// publish gate, so a social failure can never block or undo publication.
//
//   node engines/publish/cli.mjs --ledger <dir> --slug <slug> [--live]
//   node engines/publish/cli.mjs --ledger <dir> --trigger schedule [--live]   the scheduled window scan
//   node engines/publish/cli.mjs --ledger <dir> --bulk [--live]               deliberate manual window scan
//   ... --render        dry run that renders + verifies cards
//   ... --needs-cards   prints "yes"/"no" (workflow gate)
//
// Scope: a scheduled run (--trigger schedule) scans the window. Any other run must name a --slug, unless it
// passes --bulk explicitly; otherwise it exits at once without network calls or ledger changes.
// Without --live (or when NUVELLUM_SOCIAL is not "on") it only prints the plan and writes nothing.
// Candidates: stories that reached main within WINDOW_HOURS (or --slug), plus any story with queued
// platforms in the ledger. The ledger (one JSON file per story) lives on the social-ledger branch.
// Before posting to an image platform, the story's social cards are rendered and verified in Chromium
// (engines/cards, via assets.mjs); Telegram uploads the square card.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { generateFeedCopy } from '../distribution/copy.mjs';
import { BRAND } from '../shared/brand.mjs';
import { ADAPTERS, telegramMessage } from './adapters.mjs';
import { WINDOW_HOURS, planStory } from './plan.mjs';
import { processStory, needsCards, runScope, chooseScheduledCandidate, isSweepTrigger } from './run.mjs';
import { prepareCardAssets } from './assets.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
const ledgerDir = arg('ledger');
const onlySlug = arg('slug');
const live = argv.includes('--live') && process.env.NUVELLUM_SOCIAL === 'on';
const renderInDryRun = argv.includes('--render');
if (!ledgerDir) { console.error('Usage: cli.mjs --ledger <dir> [--slug <slug>] [--live | --render | --needs-cards]'); process.exit(1); }
if (onlySlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(onlySlug)) { console.error('invalid --slug'); process.exit(1); }
// Scheduled runs scan the window; manual runs need a slug unless --bulk is given deliberately.
const trigger = arg('trigger') || 'manual';
const bulk = argv.includes('--bulk');
const scope = runScope({ trigger, slug: onlySlug || '', bulk });
if (scope.mode === 'refuse') {
  if (argv.includes('--needs-cards')) console.log('no');
  else console.log((process.env.GITHUB_ACTIONS ? '::notice title=Social publish::' : '') + scope.message);
  process.exit(0);
}
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

function candidateSlugs() {
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

const freshEntry = (story) => ({ slug: story.slug, url: story.url, title: story.title, risk: story.risk, firstSeenAt: new Date(now).toISOString(), platforms: {} });

async function selectedCandidates() {
  const base = candidateSlugs();
  if (onlySlug || bulk || !isSweepTrigger(trigger)) return base;

  const assessed = [];
  for (const slug of base) {
    let story;
    try { story = loadStory(slug); } catch { continue; }
    const entry = readEntry(slug) || freshEntry(story);
    const liveOnSite = await isLive(story.url);
    const hasShort = existsSync(join(REPO_ROOT, 'engines', 'out', 'shorts', slug, 'short.mp4'));
    const plan = planStory({ ledger: entry, env, live: liveOnSite, hasShort });
    assessed.push({
      slug,
      reachedMain: reachedMain(slug),
      hasQueued: Object.values(entry.platforms || {}).some((p) => p.status === 'queued'),
      actionable: plan.some((step) => step.action === 'post')
    });
  }
  const chosen = chooseScheduledCandidate(assessed);
  return chosen ? [chosen] : [];
}

const selected = await selectedCandidates();

if (argv.includes('--needs-cards')) {
  // Workflow gate: install Chromium only when a run will actually post to an image platform.
  let need = false;
  for (const slug of selected) {
    let story;
    try { story = loadStory(slug); } catch { continue; }
    if (needsCards({ entry: readEntry(slug) || freshEntry(story), env, storyIsLive: await isLive(story.url) })) { need = true; break; }
  }
  console.log(need ? 'yes' : 'no');
  process.exit(0);
}

const summary = [];
for (const slug of selected) {
  let story;
  try { story = loadStory(slug); } catch (e) { console.log(`- ${slug}: not eligible (${e.message})`); continue; }
  const copy = Object.fromEntries(Object.entries(generateFeedCopy(story).copy).map(([p, text]) => [p, { text }]));
  const res = await processStory({
    story, entry: readEntry(slug) || freshEntry(story), env, live, renderInDryRun, storyIsLive: await isLive(story.url),
    hasShort: existsSync(join(REPO_ROOT, 'engines', 'out', 'shorts', slug, 'short.mp4')),
    prepareAssets: (s) => prepareCardAssets(s), adapters: ADAPTERS, copy, siteUrl: BRAND.siteUrl, now, save: writeEntry
  });
  writeEntry(res.entry);
  summary.push(...res.lines);
  if (!live && res.assets?.ok) {
    // Dry run with --render: show exactly what Telegram would receive.
    const m = telegramMessage(story, BRAND.siteUrl, { card: res.assets.forPlatform.telegram });
    summary.push(`${slug} telegram preview: ${m.method} upload=${m.upload}\n---- caption (HTML) ----\n${m.caption}\n------------------------`);
  }
  summary.push(`${slug}: ` + Object.entries(res.entry.platforms).map(([p, s]) => `${p}=${s.status}`).join(' '));
}
console.log(`Social publisher (${live ? 'LIVE' : 'dry run'}${renderInDryRun && !live ? ' + card render' : ''}; window ${WINDOW_HOURS}h; ${isSweepTrigger(trigger) && !bulk ? `${trigger === 'cards' ? 'after cards' : 'scheduled'} max 1 story` : bulk ? 'explicit bulk' : 'single story'})`);
for (const line of summary) console.log(' ' + line);
if (!summary.length) console.log(' nothing to do');
