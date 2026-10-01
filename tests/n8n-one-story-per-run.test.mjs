// Hourly cadence (owner decision, 2026-10-01): each n8n run produces at most ONE publishable story. The guard
// sits between the candidate loop and the first fetch; every gate after it is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync('n8n/workflows/nuvellum-newsroom.json', 'utf8'));
const node = (name) => workflow.nodes.find((n) => n.name === name);
const edges = Object.entries(workflow.connections).flatMap(([s, o]) => (o.main || []).flatMap((arr, i) => (arr || []).map((x) => `${s}[${i}] -> ${x.node}`)));
const guard = node('One Story Per Run');

// Execute the exported guard with a fake n8n environment. `runs` = items Record GitHub Outcome produced so far
// in this execution, one array per loop pass.
function decide(runs, json = { link: 'https://www.bbc.co.uk/news/articles/x', _sourceHost: 'bbc.co.uk', _sectionHint: 'World' }) {
  const $ = (name) => {
    assert.equal(name, 'Record GitHub Outcome');
    return {
      isExecuted: runs.length > 0,
      all: (branch, run) => { if (run >= runs.length) throw new Error('no such run'); return runs[run].map((t) => ({ json: { telemetry: t } })); }
    };
  };
  return new Function('$', '$json', guard.parameters.jsCode)($, json).json;
}
const published = { event: 'candidate_published', reason: 'published' };
const pushFailed = { event: 'candidate_rejected', reason: 'github_push_failed' };

test('the guard is wired between the loop and the first fetch; every gate after it is unchanged', () => {
  assert.ok(guard, 'One Story Per Run node exists');
  assert.equal(guard.parameters.mode, 'runOnceForEachItem');
  assert.equal(guard.onError, 'continueRegularOutput');
  assert.ok(edges.includes('Process One by One[1] -> One Story Per Run'));
  assert.ok(!edges.includes('Process One by One[1] -> Fetch Full Source'), 'no path around the guard');
  assert.ok(edges.includes('One Story Per Run[0] -> Story Already Published This Run?'));
  assert.ok(edges.includes('Story Already Published This Run?[0] -> Process One by One'), 'skipped candidates return to the loop');
  assert.ok(edges.includes('Story Already Published This Run?[1] -> Fetch Full Source'), 'others continue through every gate');
  for (const e of ['Enough Source?[1]', 'Is New Story?[1]', 'Editorial Review Passed?[1]', 'Sensitive Verified?[1]', 'Exact Source Duplicate?[0]', 'Record GitHub Outcome[0]'])
    assert.ok(edges.includes(`${e} -> Process One by One`), e);
  assert.ok(edges.includes('Process One by One[0] -> Run Summary'));
});

test('the first candidate of a run always proceeds', () => {
  const j = decide([]);
  assert.equal(j._runQuotaReached, false);
  assert.equal(j.telemetry, undefined);
});

test('after a published story, every later candidate in the run is skipped with a run_quota telemetry event', () => {
  const j = decide([[published]]);
  assert.equal(j._runQuotaReached, true);
  assert.deepEqual({ event: j.telemetry.event, stage: j.telemetry.stage, reason: j.telemetry.reason, sourceHost: j.telemetry.sourceHost, section: j.telemetry.section },
    { event: 'candidate_skipped', stage: 'queue', reason: 'run_quota', sourceHost: 'bbc.co.uk', section: 'World' });
  assert.equal(decide([[pushFailed], [published]])._runQuotaReached, true, 'any earlier publish counts');
});

test('a stronger candidate rejected by a gate (or a failed push) lets the next one try, through the same gates', () => {
  assert.equal(decide([])._runQuotaReached, false, 'gate rejections never reach Record GitHub Outcome');
  assert.equal(decide([[pushFailed]])._runQuotaReached, false, 'nothing was published: the next candidate may try');
});

test('a skipped candidate is counted in the run summary, not as a rejection', () => {
  const skipped = decide([[published]]);
  const summary = new Function('$input', '$', '$execution', node('Run Summary').parameters.jsCode)(
    { all: () => [{ json: { telemetry: { ...published, stage: 'github', slug: 'a-story', section: 'World', sourceHost: 'bbc.co.uk', image: { mode: 'text-led', reason: 'image_no_candidate' } } } }, { json: skipped }] },
    () => ({ first: () => ({ json: { _queuedAt: Date.now() } }), all: () => [{}, {}] }),
    { id: '1', mode: 'trigger' }
  )[0].json;
  assert.equal(summary.published, 1);
  assert.equal(summary.rejected, 0);
  assert.equal(summary.unaccounted, 0);
  assert.equal(summary.events[1].reason, 'run_quota');
});
