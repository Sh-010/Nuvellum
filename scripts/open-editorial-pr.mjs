// Opens (or corrects) the editorial PR for an incoming/** branch.
//
// Runs from the default branch on every push to incoming/**. The PR's title
// and body are derived from the article that the branch ADDS relative to
// main, read at the pushed commit. Never from the files of the pushed commit
// itself: when n8n creates a branch, the first push points at main's tip,
// and if that tip is a merge commit that published another story, its files
// would describe the wrong article (the #34/#35 bug).
//
// On later pushes an existing PR is rewritten from the branch's article, so
// stale metadata corrects itself. The binding publication decision stays with
// the gate (scripts/lib/editorial.mjs); this text is informational.

import { parseFrontmatter } from './lib/editorial.mjs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const branch = process.env.HEAD_BRANCH || '';
const sha = process.env.HEAD_SHA || '';

if (!token || !repo || !branch || !sha) {
  console.error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, HEAD_BRANCH or HEAD_SHA.');
  process.exit(1);
}
if (!branch.startsWith('incoming/')) {
  console.log(`${branch} is not an incoming/** branch; nothing to do.`);
  process.exit(0);
}

const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

async function gh(path, init = {}) {
  const res = await fetch(api + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} for ${init.method || 'GET'} ${path}: ${body?.message || ''}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const [owner] = repo.split('/');

function prText(articlePath, data) {
  const title = String(data.title || articlePath.split('/').pop().replace(/\.md$/, '').replace(/-/g, ' '));
  const risk = String(data.risk || 'unknown');
  const status = String(data.status || 'unknown');
  const editorialReview = String(data.editorialReview || 'missing');
  const verification = String(data.verification || (risk === 'sensitive' ? 'missing' : 'n/a'));
  const source = Array.isArray(data.sourceUrls) && data.sourceUrls[0] ? String(data.sourceUrls[0]) : '';
  const cleared = status === 'published' && editorialReview === 'passed'
    && (risk === 'low' || (risk === 'sensitive' && verification === 'cleared'));
  const reviewNote = cleared
    ? 'Cleared by the newsroom pipeline. The publication gate will merge this PR automatically once every required check is green (if NUVELLUM_AUTOPUBLISH is on).'
    : '⛔ Not cleared for automatic publication. This PR will not be merged automatically; close it or fix it at the source.';
  return {
    title: 'Editorial: ' + title,
    body: [
      'Automated Nuvellum editorial candidate.',
      '',
      '**Article:** `' + articlePath + '`',
      '**Section:** ' + String(data.section || 'unknown'),
      '**Risk:** ' + risk,
      '**Proposed status:** ' + status,
      '**Editorial review:** ' + editorialReview,
      '**Sensitive verification:** ' + verification,
      '**Source:** ' + source,
      '',
      reviewNote,
      '',
      'This PR was opened by Nuvellum repository automation from the article on this branch.',
      'Label it `hold` to stop automatic publication.'
    ].join('\n')
  };
}

async function main() {
  // Files this branch adds relative to main, as of the pushed commit.
  const compare = await gh(`/repos/${repo}/compare/main...${encodeURIComponent(sha)}`);
  const articles = (compare.files || [])
    .filter(f => f.status === 'added' && /^src\/content\/articles\/[^/]+\.md$/.test(f.filename))
    .map(f => f.filename);

  if (articles.length === 0) {
    console.log(`${branch} does not add an article yet (image-only or branch creation); nothing to open.`);
    return;
  }
  if (articles.length > 1) {
    console.log(`::warning::${branch} adds ${articles.length} articles; an editorial branch must add exactly one. No PR opened.`);
    return;
  }

  const articlePath = articles[0];
  const file = await gh(`/repos/${repo}/contents/${enc(articlePath)}?ref=${encodeURIComponent(sha)}`);
  const data = parseFrontmatter(Buffer.from(file.content, 'base64').toString('utf8')) || {};
  const { title, body } = prText(articlePath, data);

  const existing = await gh(`/repos/${repo}/pulls?state=open&base=main&head=${encodeURIComponent(owner + ':' + branch)}`);
  const pr = (existing || []).find(p => p.head?.ref === branch);
  if (pr) {
    if (pr.title === title && pr.body === body) {
      console.log(`PR #${pr.number} already describes ${articlePath}.`);
      return;
    }
    await gh(`/repos/${repo}/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ title, body }) });
    console.log(`Updated PR #${pr.number} from ${articlePath}.`);
    return;
  }

  try {
    const created = await gh(`/repos/${repo}/pulls`, { method: 'POST', body: JSON.stringify({ head: branch, base: 'main', title, body }) });
    console.log(`Opened PR #${created.number} for ${articlePath}.`);
  } catch (err) {
    // A PR opened concurrently (by a person or a re-run) is fine.
    if (err.status === 422 && /already exists/i.test(err.message)) {
      console.log(`PR already exists for ${branch}.`);
      return;
    }
    throw err;
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
