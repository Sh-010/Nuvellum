import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync('.github/workflows/social-publish.yml', 'utf8');

test('social publishing runs apart from the build and publish gate, one run at a time', () => {
  assert.match(wf, /^on:\n  schedule:\n    - cron: "12,42 \* \* \* \*"\n  workflow_dispatch:/m, 'scheduled (auto-merges do not trigger push workflows) and dispatchable');
  assert.doesNotMatch(wf, /^\s+(push|pull_request|workflow_run):/m, 'never tied to pushes, PRs or other workflows');
  assert.match(wf, /concurrency:\n  group: social-publish\n  cancel-in-progress: false/);
  const gate = readFileSync('scripts/lib/editorial.mjs', 'utf8');
  assert.doesNotMatch(gate, /Social publish/, 'the publish gate never waits on social posting');
});

test('live posting needs the NUVELLUM_SOCIAL switch; X needs a separate budget approval; secrets stay in env', () => {
  assert.match(wf, /NUVELLUM_SOCIAL: \$\{\{ vars\.NUVELLUM_SOCIAL \}\}/);
  assert.match(wf, /NUVELLUM_X_BUDGET_APPROVED: \$\{\{ vars\.NUVELLUM_X_BUDGET_APPROVED \}\}/);
  for (const line of wf.split('\n').filter((l) => l.includes('secrets.'))) assert.match(line, /^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/, `secret only via env: ${line.trim()}`);
  assert.doesNotMatch(wf, /echo[^\n]*(TOKEN|SECRET)/);
  const cli = readFileSync('engines/publish/cli.mjs', 'utf8');
  assert.match(cli, /const live = argv\.includes\('--live'\) && process\.env\.NUVELLUM_SOCIAL === 'on';/);
});

test('the ledger lives on its own branch, which never deploys and triggers no workflows', () => {
  assert.match(wf, /git worktree add -B social-ledger \.ledger origin\/social-ledger/);
  assert.match(wf, /git push origin HEAD:social-ledger/);
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(vercel.git.deploymentEnabled['social-ledger'], false);
  assert.match(wf, /Save the ledger\n        if: always\(\)/, 'outcomes are saved even when a post fails');
});
