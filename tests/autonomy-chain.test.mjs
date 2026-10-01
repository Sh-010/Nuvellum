import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyCap, DEFAULT_DAILY_CAP, publishedInLastDay, remainingToday, publishedInLastHour, remainingNow, HOURLY_CAP, MIN_GAP_MINUTES, STALE_HOURS, staleReason, isTimeSensitive, cardSlugs } from '../scripts/lib/publication-chain.mjs';
import { evaluateAlerts, alertActions, MARKER, keyOf, STUCK_PR_HOURS } from '../scripts/lib/alerts.mjs';

const H = 3600000;
const NOW = Date.parse('2026-10-01T12:00:00Z');
const iso = (hoursAgo) => new Date(NOW - hoursAgo * H).toISOString();

// ---------- publication cap ----------
test('daily cap: a usable number or the default, never unlimited', () => {
  assert.equal(dailyCap('30'), 30);
  assert.equal(dailyCap('0'), 0, 'zero pauses publishing');
  for (const bad of [undefined, '', 'lots', '-1', '999']) assert.equal(dailyCap(bad), DEFAULT_DAILY_CAP);
});

test('only automatic publications in the last 24h count against the cap', () => {
  const pulls = [
    { head: { ref: 'incoming/a-1' }, merged_at: iso(1) },
    { head: { ref: 'incoming/b-2' }, merged_at: iso(23) },
    { head: { ref: 'incoming/c-3' }, merged_at: iso(25) },          // outside the window
    { head: { ref: 'incoming/d-4' }, merged_at: null },             // closed without merging
    { head: { ref: 'ops/something' }, merged_at: iso(1) }           // a code PR, not a story
  ];
  assert.equal(publishedInLastDay(pulls, NOW), 2);
  assert.equal(remainingToday(pulls, 3, NOW), 1);
  assert.equal(remainingToday(pulls, 2, NOW), 0);
});

test('the gate dispatches card rendering after merging and waits (never fails) at the cap', () => {
  const src = readFileSync('scripts/auto-publish.mjs', 'utf8');
  assert.match(src, /actions\/workflows\/\$\{CARD_WORKFLOW\}\/dispatches/);
  assert.match(src, /CARD_WORKFLOW = 'social-card-assets\.yml'/);
  assert.match(src, /allowance <= 0/);
  const wf = readFileSync('.github/workflows/auto-publish.yml', 'utf8');
  assert.match(wf, /actions: write/);
  assert.match(wf, /NUVELLUM_PUBLISH_DAILY_CAP: \$\{\{ vars\.NUVELLUM_PUBLISH_DAILY_CAP \}\}/);
  const cards = readFileSync('.github/workflows/social-card-assets.yml', 'utf8');
  assert.match(cards, /inputs:\s*\n\s*slugs:/);
  assert.match(cards, /node scripts\/social-card-slugs\.mjs/);
});

// ---------- card sweep ----------
test('cards: requested slugs first, then recent stories still missing cards, capped', () => {
  const art = (slug, hoursAgo, status = 'published') => ({ slug, data: { status, publishedAt: iso(hoursAgo) } });
  const articles = [art('old', 72), art('fresh', 1), art('carded', 2), art('draft', 1, 'draft'), art('mid', 10), art('asked', 100)];
  const out = cardSlugs({ requested: ['asked', 'nope', 'BAD SLUG'], articles, haveCards: new Set(['carded']), now: NOW });
  assert.deepEqual(out, ['asked', 'fresh', 'mid'], 'unknown/invalid requests dropped; drafts, old and carded stories skipped; newest first');
  assert.equal(cardSlugs({ articles: Array.from({ length: 10 }, (_, i) => art(`s${i}`, i)), now: NOW, max: 4 }).length, 4);
  assert.deepEqual(cardSlugs({ articles: [art('carded', 1)], haveCards: new Set(['carded']), now: NOW }), [], 'nothing to do is a normal outcome');
});

// ---------- owner alerts ----------
const quiet = { now: NOW, autopublish: true, runs: [], pulls: [], latestAutomatedAt: iso(2), smoke: 'success', deploy: false, social: [], shorts: [] };
const run = (name, conclusion, hoursAgo = 1) => ({ name, status: 'completed', conclusion, html_url: `https://x/${name}`, created_at: iso(hoursAgo) });

test('a healthy system raises nothing', () => {
  assert.deepEqual(evaluateAlerts(quiet).alerts, []);
});

test('workflows alert on two consecutive failures, not one; a failed build on main alerts at once', () => {
  const once = evaluateAlerts({ ...quiet, runs: [run('Social publish', 'failure'), run('Social publish', 'success', 3)] });
  assert.equal(once.alerts.length, 0);
  const twice = evaluateAlerts({ ...quiet, runs: [run('Social publish', 'failure'), run('Social publish', 'cancelled', 2), run('Social publish', 'failure', 3)] });
  assert.deepEqual(twice.alerts.map((a) => a.key), ['workflow:Social publish'], 'cancelled runs are ignored');
  const build = evaluateAlerts({ ...quiet, runs: [run('Build Nuvellum', 'failure')] });
  assert.deepEqual(build.alerts.map((a) => a.key), ['workflow:Build Nuvellum']);
});

test('stuck newsroom PRs and a silent newsroom alert only while autopublish is on', () => {
  const pr = (n, hoursAgo, labels = []) => ({ number: n, title: `Story ${n}`, head: { ref: `incoming/s-${n}` }, created_at: iso(hoursAgo), labels });
  const s = { ...quiet, pulls: [pr(1, STUCK_PR_HOURS + 1), pr(2, 1), pr(3, 30, [{ name: 'hold' }])] };
  assert.deepEqual(evaluateAlerts(s).alerts.map((a) => a.key), ['stuck-incoming']);
  assert.match(evaluateAlerts(s).alerts[0].body, /#1 /);
  assert.doesNotMatch(evaluateAlerts(s).alerts[0].body, /#3 /, 'held PRs are deliberate');
  const silent = { ...quiet, latestAutomatedAt: iso(20) };
  assert.deepEqual(evaluateAlerts(silent).alerts.map((a) => a.key), ['newsroom-stalled']);
  assert.deepEqual(evaluateAlerts({ ...silent, pulls: [pr(9, 2)] }).alerts, [], 'a fresh incoming PR means the newsroom is alive');
  assert.deepEqual(evaluateAlerts({ ...silent, autopublish: false }).alerts, [], 'with autopublish off, silence is expected');
});

test('production smoke and deployment failures alert; rate limits name themselves', () => {
  assert.deepEqual(evaluateAlerts({ ...quiet, smoke: 'failure' }).alerts.map((a) => a.key), ['production-smoke']);
  const d = evaluateAlerts({ ...quiet, deploy: { sha: 'abcdef1234', state: 'failure', description: 'Deployment rate limited — retry in 24 hours.', createdAt: iso(3) } });
  assert.deepEqual(d.alerts.map((a) => a.key), ['deploy']);
  assert.match(d.alerts[0].body, /rate limited/);
  assert.deepEqual(evaluateAlerts({ ...quiet, deploy: { sha: 'x', state: 'failure', description: 'x', createdAt: iso(0.5) } }).alerts, [], 'a just-failed deploy gets time to retry');
});

test('social: credential rejections get their own alert per platform; other failures are summarised', () => {
  const social = [
    { slug: 'a', platforms: { telegram: { status: 'sent', updatedAt: iso(1) }, facebook: { status: 'failed', error: 'facebook: HTTP 401 Error validating access token: Session has expired', updatedAt: iso(1) } } },
    { slug: 'b', platforms: { linkedin: { status: 'failed', error: 'linkedin: HTTP 422 duplicate', updatedAt: iso(2) }, x: { status: 'failed', error: 'x: HTTP 500', updatedAt: iso(60) } } }
  ];
  const keys = evaluateAlerts({ ...quiet, social }).alerts.map((a) => a.key);
  assert.deepEqual(keys, ['credentials:facebook', 'social-failed']);
  const body = evaluateAlerts({ ...quiet, social }).alerts[1].body;
  assert.match(body, /linkedin: b/);
  assert.doesNotMatch(body, /x: b/, 'old failures were already reported');
});

test('shorts: failed renders alert', () => {
  const shorts = [{ slug: 'a', updatedAt: iso(1), render: { status: 'failed', failures: 2, error: 'ffprobe: no audio stream' } }, { slug: 'b', updatedAt: iso(1), render: { status: 'rendered' } }];
  const a = evaluateAlerts({ ...quiet, shorts }).alerts;
  assert.deepEqual(a.map((x) => x.key), ['shorts-failing']);
  assert.match(a[0].body, /a: ffprobe/);
});

test('delivery: new alerts open, lasting ones remind daily, cleared ones close; missing data never closes', () => {
  const issue = (key, hoursAgo, n) => ({ number: n, title: `Alert: ${key}`, body: `${MARKER(key)}\nx`, updated_at: iso(hoursAgo) });
  assert.equal(keyOf(MARKER('workflow:Social publish')), 'workflow:Social publish');
  const evaluation = { alerts: [{ key: 'deploy', title: 'd', body: 'b' }, { key: 'production-smoke', title: 's', body: 'b' }, { key: 'shorts-failing', title: 'f', body: 'b' }], unknown: ['social-failed', 'credentials:'] };
  const open = [issue('deploy', 2, 1), issue('production-smoke', 30, 2), issue('newsroom-stalled', 5, 3), issue('credentials:facebook', 5, 4)];
  const r = alertActions(evaluation, open, NOW);
  assert.deepEqual(r.open.map((a) => a.key), ['shorts-failing']);
  assert.deepEqual(r.remind.map((x) => x.issue.number), [2], 'reminded once a day, not every run');
  assert.deepEqual(r.resolve.map((i) => i.number), [3], 'credentials alert kept open: the ledger could not be read this run');
});

test('observability runs the alert step whatever failed before it, with issues write access', () => {
  const wf = readFileSync('.github/workflows/observability.yml', 'utf8');
  assert.match(wf, /issues: write/);
  assert.match(wf, /- name: Alert the owner when something needs them\n\s+if: always\(\)/);
  assert.match(wf, /SMOKE_OUTCOME: \$\{\{ steps\.smoke\.outcome \}\}/);
});

test('every gate run sweeps all open incoming PRs, so a dropped pending run cannot strand a story', () => {
  const wf = readFileSync('.github/workflows/auto-publish.yml', 'utf8');
  assert.match(wf, /HEAD_BRANCH: ''/);
  assert.doesNotMatch(wf, /HEAD_BRANCH: \$\{\{ github\.event_name == 'workflow_run'/);
});

test('hourly cadence: one publication per hourly slot (50-minute minimum gap), inside the daily cap', () => {
  assert.equal(HOURLY_CAP, 1);
  assert.equal(MIN_GAP_MINUTES, 50);
  const merged = (minsAgo) => ({ head: { ref: 'incoming/x' }, merged_at: new Date(NOW - minsAgo * 60000).toISOString() });
  assert.equal(remainingNow([], 24, NOW), 1, 'nothing merged lately: one may go');
  assert.equal(publishedInLastHour([merged(49)], NOW), 1);
  assert.equal(remainingNow([merged(49)], 24, NOW), 0, 'previous merge under 50 minutes ago: the rest wait');
  assert.equal(remainingNow([merged(57)], 24, NOW), 1, 'the next hourly push lands a few minutes early: it still goes (the old strict hour skipped it)');
  assert.equal(remainingNow([merged(55), merged(120)], 2, NOW), 0, 'the daily cap still applies');
});

test('freshness: time-sensitive candidates expire after 6h; long-life formats do not', () => {
  assert.equal(STALE_HOURS, 6);
  const at = (h) => new Date(NOW - h * H).toISOString();
  assert.match(staleReason({ createdAt: at(7), data: { type: 'News' }, now: NOW }), /^stale: News candidate waited 7h without publication \(limit 6h\)/);
  assert.equal(staleReason({ createdAt: at(5), data: { type: 'News' }, now: NOW }), null, 'under 6h: still a candidate');
  for (const flagged of [{ type: 'Analysis', tags: ['Breaking'] }, { type: 'Explainer', developing: true }, { type: 'Analysis', status_label: 'developing' }])
    assert.ok(staleReason({ createdAt: at(7), data: flagged, now: NOW }), JSON.stringify(flagged));
  for (const type of ['Explainer', 'Analysis', 'Review', 'Essay', 'Opinion', 'Ideas'])
    assert.equal(staleReason({ createdAt: at(48), data: { type }, now: NOW }), null, `${type} does not expire after 6h`);
  assert.equal(isTimeSensitive({ type: 'news' }), true, 'case-insensitive');
});

test('queued stories alert only when the gate has stopped publishing', () => {
  const pr = { number: 7, title: 'Queued', head: { ref: 'incoming/q-1' }, created_at: iso(STUCK_PR_HOURS + 2), labels: [] };
  const base = { ...quiet, pulls: [pr] };
  assert.deepEqual(evaluateAlerts({ ...base, lastAutoMergeAt: iso(0.5) }).alerts, [], 'gate merging hourly: a queue is normal');
  assert.deepEqual(evaluateAlerts({ ...base, lastAutoMergeAt: iso(5) }).alerts.map((a) => a.key), ['stuck-incoming']);
  assert.deepEqual(evaluateAlerts({ ...base, lastAutoMergeAt: null }).alerts.map((a) => a.key), ['stuck-incoming'], 'never merged');
});
