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

test('social cards: Chromium is installed only when a run will post, with no secrets in the install step', () => {
  assert.match(wf, /- name: Will this run post cards\?\n        id: cards\n/);
  assert.match(wf, /--needs-cards --trigger "\$TRIGGER" \$\{SLUG:\+--slug "\$SLUG"\} \$\(\[ "\$BULK" = "true" \] && echo --bulk\)\)" >> "\$GITHUB_OUTPUT"/);
  const install = wf.slice(wf.indexOf('- name: Install the card renderer (Chromium)'), wf.indexOf('- name: Post and record'));
  assert.match(install, /if: steps\.cards\.outputs\.needed == 'yes'/);
  assert.match(install, /npx playwright-core install --with-deps chromium/);
  assert.doesNotMatch(install, /secrets\./, 'third-party install scripts never see credentials');
  assert.match(wf, /- name: Cache Chromium\n        if: steps\.cards\.outputs\.needed == 'yes'/);
  // The posting step itself is unchanged: live only with the switch, one run at a time.
  assert.match(wf, /node engines\/publish\/cli\.mjs --ledger \.ledger\/ledger --live --trigger "\$TRIGGER" \$\{SLUG:\+--slug "\$SLUG"\}/);
  // Manual runs never fan out by accident: dispatch needs a slug unless the default-off bulk box is ticked.
  assert.match(wf, /      bulk:\n        description: "[^"]+"\n        type: boolean\n        default: false/);
  const cli = readFileSync('engines/publish/cli.mjs', 'utf8');
  assert.match(cli, /const scope = runScope\(\{ trigger: arg\('trigger'\) \|\| 'manual', slug: onlySlug \|\| '', bulk: argv\.includes\('--bulk'\) \}\);/);
  assert.ok(cli.indexOf("scope.mode === 'refuse'") < cli.indexOf('mkdirSync(ledgerDir'), 'refused before touching the ledger');
  const dist = readFileSync('.github/workflows/social-distribution.yml', 'utf8');
  assert.match(dist, /CARDS_CHROME=1 npm test/, 'CI runs the card tests in real Chromium');
});

test('the ledger lives on its own branch, which never deploys and triggers no workflows', () => {
  assert.match(wf, /git worktree add -B social-ledger \.ledger origin\/social-ledger/);
  assert.match(wf, /git push origin HEAD:social-ledger/);
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(vercel.git.deploymentEnabled['social-ledger'], false);
  assert.match(wf, /Save the ledger\n        if: always\(\)/, 'outcomes are saved even when a post fails');
});
