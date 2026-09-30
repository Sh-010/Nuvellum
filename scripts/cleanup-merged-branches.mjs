// Deletes branches whose PR was MERGED and whose tip is still exactly the merged head. Rules and exceptions:
// scripts/lib/branch-cleanup.mjs. Dry run unless CONFIRM_DELETE=yes. CLEANUP_SCOPE=all extends it from
// incoming/** editorial branches to every merged feature branch.
import { planBranches } from './lib/branch-cleanup.mjs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const confirm = process.env.CONFIRM_DELETE === 'yes';
const scope = process.env.CLEANUP_SCOPE === 'all' ? 'all' : 'incoming';
const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
if (!repo || (confirm && !token)) { console.error('Missing GITHUB_REPOSITORY, or GITHUB_TOKEN for deletion.'); process.exit(1); }
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
async function gh(path, init = {}) {
  const res = await fetch(api + path, { ...init, headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${init.method || 'GET'} ${path}`);
  return res.status === 204 ? null : res.json();
}

const prs = [];
for (let page = 1; page <= 20; page++) {
  const batch = await gh(`/repos/${repo}/pulls?state=all&per_page=100&page=${page}`);
  prs.push(...batch);
  if (batch.length < 100) break;
}
const refs = await gh(`/repos/${repo}/git/matching-refs/heads/`);
const plan = planBranches({ refs, prs, repo, scope });

for (const p of plan) console.log(`${p.action === 'delete' ? (confirm ? 'DELETE' : 'would delete') : 'keep  '}  ${p.branch}  — ${p.reason}`);
const doomed = plan.filter((x) => x.action === 'delete');
console.log(`\n${doomed.length} of ${plan.length} ${scope === 'all' ? '' : 'incoming/** '}branches ${confirm ? 'deleted' : 'would be deleted'}.`);
if (confirm) {
  for (const p of doomed) await gh(`/repos/${repo}/git/refs/heads/${enc(p.branch)}`, { method: 'DELETE' });
} else {
  console.log('Dry run. Re-run with confirm = "yes" to delete the branches marked above.');
}
