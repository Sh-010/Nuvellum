// Editorial duplicate guard.
//
// Works for both `push` (incoming/** branches written by n8n) and
// `pull_request` events, so it does not depend on a PR having been opened —
// PRs opened with GITHUB_TOKEN never trigger pull_request workflows.
//
// It compares the source URLs of articles added/changed on this branch with
// every other in-flight editorial branch (open PRs and incoming/** branches
// that have not been closed). The oldest branch for a source wins; newer
// duplicates fail. Duplicates of already-published stories are caught by
// scripts/validate-content.mjs, which runs in the build.

import { ARTICLE_PATH_RE, articleSources, duplicateConflicts } from './lib/editorial.mjs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const headRef = process.env.HEAD_REF;
const headSha = process.env.HEAD_SHA;
const baseRef = process.env.BASE_REF || 'main';

if (!token || !repo || !headRef || !headSha) {
  console.error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, HEAD_REF or HEAD_SHA.');
  process.exit(1);
}

const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

async function gh(path, { allow404 = false } = {}) {
  const res = await fetch(api + path, { headers });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function fileText(path, ref) {
  const payload = await gh(`/repos/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, { allow404: true });
  return payload?.content ? Buffer.from(payload.content, 'base64').toString('utf8') : '';
}

// Articles this ref adds or changes relative to main, plus its oldest commit time.
async function branchInfo(ref) {
  const cmp = await gh(`/repos/${repo}/compare/${enc(baseRef)}...${enc(ref)}`);
  const articles = (cmp.files || [])
    .filter(f => ARTICLE_PATH_RE.test(f.filename) && f.status !== 'removed')
    .map(f => f.filename);
  const firstCommitAt = cmp.commits?.[0]?.commit?.committer?.date || '';
  return { articles, firstCommitAt, aheadBy: cmp.ahead_by };
}

const self = await branchInfo(headSha);
if (!self.articles.length) {
  console.log(`No article files changed on ${headRef}; nothing to check.`);
  process.exit(0);
}

const selfSources = new Set();
for (const path of self.articles) for (const s of articleSources(await fileText(path, headSha))) selfSources.add(s);
if (!selfSources.size) {
  console.log('No source URLs found in changed article files.');
  process.exit(0);
}

// Latest PR per head branch (any state) so closed/merged branches are ignored.
const prByRef = new Map();
for (let page = 1; page <= 5; page++) {
  const prs = await gh(`/repos/${repo}/pulls?state=all&per_page=100&page=${page}&sort=created&direction=desc`);
  for (const pr of prs) {
    if (pr.head?.repo?.full_name !== repo) continue;
    if (!prByRef.has(pr.head.ref)) prByRef.set(pr.head.ref, pr);
  }
  if (prs.length < 100) break;
}

const refs = new Set();
for (const [ref, pr] of prByRef) if (pr.state === 'open') refs.add(ref);
const incoming = await gh(`/repos/${repo}/git/matching-refs/heads/incoming/`);
for (const r of incoming || []) {
  const ref = r.ref.replace(/^refs\/heads\//, '');
  const pr = prByRef.get(ref);
  if (!pr || pr.state === 'open') refs.add(ref);
}
refs.delete(headRef);
refs.delete(baseRef);

const others = [];
for (const ref of refs) {
  let info;
  try { info = await branchInfo(ref); } catch (err) { console.warn(`Skipping ${ref}: ${err.message}`); continue; }
  if (!info.aheadBy) continue;
  const sources = new Set();
  for (const path of info.articles) {
    // An article already on main was published (e.g. squash-merged); the
    // validator handles duplicates against published stories.
    if (await fileText(path, baseRef)) continue;
    for (const s of articleSources(await fileText(path, ref))) sources.add(s);
  }
  if (sources.size) others.push({ ref, pr: prByRef.get(ref)?.number, firstCommitAt: info.firstCommitAt, sources });
}

const conflicts = duplicateConflicts({ ref: headRef, firstCommitAt: self.firstCommitAt, sources: selfSources }, others);
if (conflicts.length) {
  console.error('\nDuplicate editorial source: an older in-flight branch already covers this source.\n');
  for (const c of conflicts) {
    console.error(` - ${c.ref}${c.pr ? ` (PR #${c.pr})` : ''}`);
    for (const s of c.sources) console.error(`   ${s}`);
  }
  console.error('\nThis newer duplicate must not be published. Close it, or use a genuinely different source/story.');
  process.exit(1);
}

console.log(`No duplicate sources across ${others.length} other in-flight editorial branch(es).`);
