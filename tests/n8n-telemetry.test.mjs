// Execution telemetry in the live newsroom (Queue stamp, Record GitHub Outcome, Run Summary).
// Runs the exported node code on fixtures: reason codes, image decisions, the run summary, and that no
// source/article text, prompts, URLs or tokens can reach telemetry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = JSON.parse(readFileSync(join(root, 'n8n', 'workflows', 'nuvellum-newsroom.json'), 'utf8'));
const node = name => {
  const found = workflow.nodes.find(n => n.name === name);
  assert.ok(found, `missing n8n node: ${name}`);
  return found;
};
const edges = Object.entries(workflow.connections).flatMap(([s, o]) => (o.main || []).flatMap((arr, i) => (arr || []).map(x => `${s}[${i}] -> ${x.node}`)));

const SECRET = 'SECRET_SOURCE_TEXT ghp_FAKETOKEN123 PROMPT_BODY';
const SOURCE = { sourceTitle: `Title ${SECRET}`, sourceLink: 'https://www.bbc.co.uk/news/articles/x?token=ghp_FAKETOKEN123', articleText: SECRET.repeat(40), sourceHost: 'bbc.co.uk', sourceSectionHint: 'World' };
const ARTICLE = { ...SOURCE, slug: 'demo-story', section: 'World', markdown: `---\n${SECRET}`, bodyMarkdown: SECRET, draftFailed: false };

const record = (payload, json) => new Function('$', '$json', node('Record GitHub Outcome').parameters.jsCode)(() => ({ item: { json: payload } }), json).json;
function summarize(items, queue = { _queuedAt: Date.now() - 42000, _queueStats: { feedItems: 180, feedErrors: 1, aggregatePages: 6, repeats: 9 } }, queued = items.length) {
  const $ = () => ({ first: () => ({ json: queue }), all: () => Array(queued).fill({ json: queue }) });
  return new Function('$input', '$', '$execution', node('Run Summary').parameters.jsCode)({ all: () => items.map(json => ({ json })) }, $, { id: '939', mode: 'manual' })[0].json;
}

test('telemetry nodes are wired after the gates and never change the loop', () => {
  assert.ok(edges.includes('Process One by One[0] -> Run Summary'), 'Run Summary reads the loop "done" output');
  assert.ok(edges.includes('Commit Article File[0] -> Record GitHub Outcome'));
  assert.ok(edges.includes('Create Review Branch[1] -> Record GitHub Outcome'));
  assert.ok(edges.includes('Record GitHub Outcome[0] -> Process One by One'));
  assert.ok(!edges.some(e => e.startsWith('Run Summary')), 'Run Summary is terminal');
  assert.deepEqual(edges.filter(e => e.endsWith('-> Record GitHub Outcome')).length, 2);
  // Every rejection branch still returns straight to the loop.
  for (const e of ['Enough Source?[1]', 'Is New Story?[1]', 'Editorial Review Passed?[1]', 'Sensitive Verified?[1]', 'Exact Source Duplicate?[0]'])
    assert.ok(edges.includes(`${e} -> Process One by One`), e);
  for (const name of ['Record GitHub Outcome', 'Run Summary']) assert.equal(node(name).onError, 'continueRegularOutput');
  assert.equal(node('Record GitHub Outcome').parameters.mode, 'runOnceForEachItem');
});

test('queue stamps run start and feed-screening counts without changing the selection', () => {
  const feed = [
    { json: { error: 'feed down' } },
    { json: { link: 'https://www.bbc.co.uk/news/live/abc', title: 'Live: x' } },
    { json: { link: 'https://www.bbc.co.uk/news/articles/a1?utm_source=x', title: 'A', isoDate: '2026-09-28T10:00:00Z' } },
    { json: { link: 'https://bbc.co.uk/news/articles/a1', title: 'A again', isoDate: '2026-09-28T09:00:00Z' } },
    { json: { link: 'https://www.ign.com/articles/b', title: 'B', isoDate: '2026-09-28T08:00:00Z' } },
    { json: { link: 'https://variety.com/2026/film/c', title: 'Watch: trailer' } }
  ];
  const out = new Function('$input', node('Queue Latest Candidates').parameters.jsCode)({ all: () => feed }).map(i => i.json);
  assert.deepEqual(out.map(j => j.link), ['https://www.bbc.co.uk/news/articles/a1', 'https://www.ign.com/articles/b']);
  assert.equal(typeof out[0]._queuedAt, 'number');
  assert.deepEqual(out[0]._queueStats, { feedItems: 6, feedErrors: 1, aggregatePages: 2, repeats: 1 });
});

test('every rejection path maps to a stable reason code', () => {
  const s = summarize([
    { ...SOURCE, sourceReady: false },
    { ...SOURCE, sourceReady: true, exactSourceMatch: true, openPrExactSourceMatch: true },
    { ...SOURCE, exactSourceMatch: false, isDuplicate: true, duplicateReason: SECRET },
    { ...SOURCE, exactSourceMatch: false, isDuplicate: true, duplicateParserError: 'bad json' },
    { ...ARTICLE, slug: '', draftFailed: true, draftError: `Drafter declined the source: ${SECRET}`, editorialApproved: false },
    { ...ARTICLE, slug: '', draftFailed: true, draftError: 'Draft contains a country the site cannot place: Narnia', editorialApproved: false },
    { ...ARTICLE, slug: '', draftFailed: true, draftError: 'Generated article is too short: 80 words (minimum 120)', editorialApproved: false },
    { ...ARTICLE, editorialApproved: false, editorialIssues: [SECRET] },
    { ...ARTICLE, editorialApproved: false, reviewParserError: 'bad json' },
    { ...ARTICLE, editorialApproved: true, risk: 'sensitive', sensitiveVerified: false, sensitiveIssues: [SECRET] },
    { ...ARTICLE, editorialApproved: true, risk: 'sensitive', sensitiveVerified: false, sensitiveVerificationError: 'x' },
    record({ ...ARTICLE, slug: 'branch-fail' }, { error: { message: `Reference already exists ${SECRET}`, httpCode: '422' } })
  ]);
  assert.deepEqual(s.events.map(e => `${e.stage}:${e.reason}`), [
    'source:thin_source', 'dedupe:duplicate_source', 'dedupe:duplicate_story', 'dedupe:duplicate_check_failed',
    'draft:draft_skip', 'draft:invalid_geography', 'draft:thin_draft', 'editorial_review:editorial_failed',
    'editorial_review:editorial_uncertain', 'verification:verification_failed', 'verification:verification_uncertain', 'github:github_push_failed'
  ]);
  assert.equal(s.events[1].detail, 'open_pr');
  assert.equal(s.events[11].httpStatus, 422);
  assert.equal(s.rejected, 12);
  assert.equal(s.published, 0);
  assert.equal(s.reachedDrafting, 8);
  assert.deepEqual(s.verification, { passed: 0, failed: 2 });
});

test('published candidates record the image decision; the summary counts modes, stages and duration', () => {
  const s = summarize([
    record({ ...ARTICLE, slug: 'text-led-story', aiImageReady: false, aiImageError: 'SVG failed Nuvellum style gate: neon' }, { content: {}, commit: { sha: 'a' } }),
    record({ ...ARTICLE, slug: 'illustrated-story', aiImageReady: true, risk: 'sensitive' }, { content: {} }),
    record({ ...ARTICLE, slug: 'no-svg-story', aiImageReady: false, aiImageError: 'No complete SVG returned' }, { content: {} }),
    { ...SOURCE, sourceReady: false }
  ], undefined, 5);
  assert.deepEqual(s.events.slice(0, 3).map(e => [e.slug, e.reason, e.image.mode, e.image.reason]), [
    ['text-led-story', 'published', 'text-led', 'image_rejected_style'],
    ['illustrated-story', 'published', 'illustration', 'approved'],
    ['no-svg-story', 'published', 'text-led', 'image_no_candidate']
  ]);
  assert.equal(s.event, 'run_summary');
  assert.equal(s.runId, '939');
  assert.deepEqual(s.imageModes, { photo: 0, illustration: 1, textLed: 2 });
  assert.deepEqual(s.github, { branchCreated: 3, pushFailed: 0 });
  assert.deepEqual(s.editorial, { passed: 3, failed: 0 });
  assert.deepEqual(s.verification, { passed: 1, failed: 0 });
  assert.deepEqual(s.queue, { feedItems: 180, feedErrors: 1, aggregatePages: 6, repeats: 9 });
  assert.equal(s.candidates, 5);
  assert.equal(s.unaccounted, 1, 'a candidate that never returned to the loop is visible');
  assert.ok(s.durationMs >= 42000 && s.durationMs < 60000);
});

test('telemetry never carries source/article text, prompts, full URLs, error text or tokens', () => {
  const s = summarize([
    { ...SOURCE, sourceReady: false },
    { ...ARTICLE, editorialApproved: false, editorialIssues: [SECRET], decisionReason: SECRET },
    record({ ...ARTICLE, aiImageError: SECRET }, { error: { message: SECRET, headers: { authorization: 'Bearer ghp_FAKETOKEN123' } } }),
    record({ ...ARTICLE }, { content: { path: SECRET }, commit: { message: SECRET } })
  ], { _queuedAt: Date.now(), _queueStats: { feedItems: 3, evil: SECRET } });
  const text = JSON.stringify(s);
  for (const needle of ['SECRET_SOURCE_TEXT', 'ghp_', 'PROMPT_BODY', 'token=', '/news/articles', 'authorization', 'Reference already', 'evil'])
    assert.ok(!text.includes(needle), `telemetry leaked "${needle}"`);
  assert.ok(text.length < 4000, 'summary stays compact');
});

test('a malformed loop item cannot break the summary', () => {
  const s = summarize([null, {}, { telemetry: 'x' }].map(x => x));
  assert.equal(s.event, 'run_summary');
  assert.ok(s.events.every(e => e.reason === 'unclassified'));
});
