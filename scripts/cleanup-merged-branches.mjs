// Deletes incoming/** branches whose editorial PR was MERGED (the content is
// on main and the PR keeps the full history). Never touches branches with an
// open PR, closed-unmerged PRs (kept as evidence), no PR, or anything outside
// incoming/**. Dry run unless CONFIRM_DELETE=yes.
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const confirm = process.env.CONFIRM_DELETE === 'yes';
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
for (let page = 1; page <= 10; page++) {
  const batch = await gh(`/repos/${repo}/pulls?state=all&per_page=100&page=${page}`);
  prs.push(...batch);
  if (batch.length < 100) break;
}
const refs = (await gh(`/repos/${repo}/git/matching-refs/heads/incoming`)).filter(r => r.ref.startsWith('refs/heads/incoming/'));

const plan = [];
for (const r of refs) {
  const branch = r.ref.replace('refs/heads/', '');
  const mine = prs.filter(p => p.head?.ref === branch && p.head?.repo?.full_name === repo);
  const open = mine.find(p => p.state === 'open');
  const merged = mine.find(p => p.merged_at);
  let action = 'keep', reason;
  if (open) reason = `open PR #${open.number}`;
  else if (!mine.length) reason = 'no PR (kept)';
  else if (!merged) reason = `closed without merge #${mine[0].number} (kept as evidence)`;
  else if (merged.head.sha !== r.object.sha) reason = `branch moved after merge of #${merged.number} (kept)`;
  else { action = 'delete'; reason = `merged in #${merged.number}`; }
  plan.push({ branch, action, reason });
}

for (const p of plan) console.log(`${p.action === 'delete' ? (confirm ? 'DELETE' : 'would delete') : 'keep  '}  ${p.branch}  — ${p.reason}`);
if (confirm) {
  for (const p of plan.filter(x => x.action === 'delete')) await gh(`/repos/${repo}/git/refs/heads/${enc(p.branch)}`, { method: 'DELETE' });
} else {
  console.log('\nDry run. Set CONFIRM_DELETE=yes to delete the branches marked above.');
}
