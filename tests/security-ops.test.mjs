import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planBranches } from '../scripts/lib/branch-cleanup.mjs';
import { createGitHub } from '../scripts/lib/admin/github.mjs';

const REPO = 'Sh-010/Nuvellum';
const ref = (name, sha) => ({ ref: `refs/heads/${name}`, object: { sha } });
const pr = (n, head, sha, { state = 'closed', merged = false, base = 'main' } = {}) => ({ number: n, state, merged_at: merged ? '2026-09-30T00:00:00Z' : null, head: { ref: head, sha, repo: { full_name: REPO } }, base: { ref: base } });

test('branch cleanup deletes only merged branches whose tip is the merged head, and never a stacked base', () => {
  const refs = [ref('main', 'm'), ref('social-ledger', 'l'), ref('feat/done', 'a'), ref('feat/moved', 'b2'), ref('feat/open', 'c'), ref('feat/base', 'd'), ref('feat/closed', 'e'), ref('feat/nopr', 'f'), ref('incoming/x', 'g'), ref('incoming/y', 'h')];
  const prs = [pr(1, 'feat/done', 'a', { merged: true }), pr(2, 'feat/moved', 'b1', { merged: true }), pr(3, 'feat/open', 'c', { state: 'open', base: 'feat/base' }),
    pr(4, 'feat/base', 'd', { merged: true }), pr(5, 'feat/closed', 'e'), pr(6, 'incoming/x', 'g', { merged: true }), pr(7, 'incoming/y', 'h', { state: 'open' })];
  const all = Object.fromEntries(planBranches({ refs, prs, repo: REPO, scope: 'all' }).map((p) => [p.branch, p.action + ': ' + p.reason]));
  assert.deepEqual(all, {
    main: 'keep: protected', 'social-ledger': 'keep: protected', 'feat/done': 'delete: merged in #1', 'feat/moved': 'keep: branch moved after merge of #2 (kept)',
    'feat/open': 'keep: open PR #3', 'feat/base': 'keep: base of an open PR (stacked)', 'feat/closed': 'keep: closed without merge #5 (kept as evidence)',
    'feat/nopr': 'keep: no PR (kept)', 'incoming/x': 'delete: merged in #6', 'incoming/y': 'keep: open PR #7'
  });
  const incoming = planBranches({ refs, prs, repo: REPO });
  assert.deepEqual(incoming.map((p) => p.branch), ['incoming/x', 'incoming/y'], 'the default scope stays incoming/** only');
});

test('branch cleanup is a dry run unless explicitly confirmed', () => {
  const wf = readFileSync('.github/workflows/cleanup-merged-branches.yml', 'utf8');
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /schedule:|push:/, 'never runs on its own');
  assert.match(wf, /default: "no"/);
  assert.match(readFileSync('scripts/cleanup-merged-branches.mjs', 'utf8'), /const confirm = process\.env\.CONFIRM_DELETE === 'yes';/);
});

test('the admin learns the GitHub token expiry from GitHub and the desk warns before it lapses', async () => {
  const fetchImpl = async () => new Response('{}', { status: 200, headers: { 'github-authentication-token-expiration': '2026-12-29 12:00:00 UTC' } });
  const gh = createGitHub({ token: 't', fetchImpl, log: {} });
  assert.equal(gh.tokenExpiry(), null, 'unknown until GitHub has answered once');
  await gh.snapshot().catch(() => {}); // the fake body is not a valid snapshot; only the header matters here
  assert.equal(gh.tokenExpiry(), '2026-12-29T12:00:00.000Z');
  const admin = readFileSync('src/pages/admin.astro', 'utf8');
  assert.match(admin, /n\.hidden = days > 14;/);
  assert.match(readFileSync('scripts/lib/admin/handler.mjs', 'utf8'), /tokenExpiresAt: gh\.tokenExpiry\?\.\(\) \|\| null/);
});
