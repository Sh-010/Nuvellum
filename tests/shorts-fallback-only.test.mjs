import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// Owner decision (2026-10-01): the current Shorts renderer is a fallback only. It must never post publicly on
// its own; the intended video product is a future generative-video engine.
const wf = yaml.load(readFileSync('.github/workflows/shorts-autopilot.yml', 'utf8'));

test('the Shorts autopilot has no schedule: it runs only when someone starts it', () => {
  assert.equal(wf.on.schedule, undefined);
  assert.ok(wf.on.workflow_dispatch);
});

test('public distribution needs both a manual opt-in and the NUVELLUM_SHORTS_PUBLISH=on variable', () => {
  assert.equal(wf.on.workflow_dispatch.inputs.distribute.default, false);
  const step = wf.jobs.short.steps.find((s) => s.name === 'Distribute to video platforms');
  assert.match(step.if, /inputs\.distribute/);
  assert.match(step.if, /vars\.NUVELLUM_SHORTS_PUBLISH == 'on'/);
  assert.doesNotMatch(step.if, /schedule/);
});
