import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// Regression (2026-10-01 rehearsal, PRs #204-#207): a photo commit pushed with GITHUB_TOKEN fires no push
// checks, and dispatched checks never attach to the PR, so branch protection blocked every automatic merge.
const wf = yaml.load(readFileSync('.github/workflows/visual-acquire.yml', 'utf8'));
const steps = wf.jobs.acquire.steps;

test('the visual pass pushes with the repository deploy key, so ordinary push checks attach to the PR', () => {
  const checkout = steps.find((s) => String(s.uses || '').startsWith('actions/checkout'));
  assert.equal(checkout.with['ssh-key'], '${{ secrets.NUVELLUM_DEPLOY_KEY }}');
  assert.match(wf.jobs.acquire.env.HAS_DEPLOY_KEY, /secrets\.NUVELLUM_DEPLOY_KEY != ''/);
});

test('dispatching checks is only the fallback without a key; secrets never appear in step conditions', () => {
  const dispatch = steps.find((s) => /^Dispatch required checks/.test(s.name || ''));
  assert.match(dispatch.if, /env\.HAS_DEPLOY_KEY != 'true'/);
  for (const s of steps) assert.doesNotMatch(String(s.if || ''), /secrets\./, s.name);
});

test('a stuck PR can be refreshed on demand with an empty deploy-key commit', () => {
  assert.equal(wf.on.workflow_dispatch.inputs.refresh_checks.type, 'boolean');
  const refresh = steps.find((s) => /^Re-run required checks/.test(s.name || ''));
  assert.match(refresh.run, /git commit --allow-empty/);
  assert.match(refresh.if, /inputs\.refresh_checks/);
});
