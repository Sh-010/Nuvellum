import { readFileSync, existsSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER || 0);

if (!token || !repo || !prNumber) {
  console.error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY or PR_NUMBER.');
  process.exit(1);
}

const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

async function gh(path) {
  const res = await fetch(api + path, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

function normalizeSource(value) {
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

function parseSources(text) {
  const out = new Set();
  const block = String(text || '').match(/^sourceUrls:\s*\[(.*)\]\s*$/m);
  if (block) {
    for (const m of block[1].matchAll(/["'](https:\/\/[^"']+)["']/g)) out.add(normalizeSource(m[1]));
  }
  for (const m of String(text || '').matchAll(/^\*\*Source:\*\*\s*(https:\/\/\S+)/gm)) {
    out.add(normalizeSource(m[1]));
  }
  return out;
}

const changed = await gh(`/repos/${repo}/pulls/${prNumber}/files?per_page=100`);
const articlePaths = changed
  .map(f => f.filename)
  .filter(p => p.startsWith('src/content/articles/') && p.endsWith('.md'));

const currentSources = new Set();
for (const path of articlePaths) {
  if (!existsSync(path)) continue;
  for (const source of parseSources(readFileSync(path, 'utf8'))) currentSources.add(source);
}

if (!currentSources.size) {
  console.log('No source URLs found in changed article files.');
  process.exit(0);
}

const openPrs = await gh(`/repos/${repo}/pulls?state=open&per_page=100`);
const duplicates = [];

for (const pr of openPrs) {
  if (pr.number === prNumber) continue;

  const candidateSources = new Set(parseSources(pr.body || ''));

  if (!candidateSources.size) {
    const files = await gh(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`);
    for (const file of files) {
      if (!file.filename.startsWith('src/content/articles/') || !file.filename.endsWith('.md')) continue;
      const encoded = file.filename.split('/').map(encodeURIComponent).join('/');
      const payload = await gh(`/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(pr.head.ref)}`);
      if (!payload?.content) continue;
      const text = Buffer.from(payload.content, 'base64').toString('utf8');
      for (const source of parseSources(text)) candidateSources.add(source);
    }
  }

  const overlap = [...currentSources].filter(source => candidateSources.has(source));
  if (overlap.length) duplicates.push({ pr: pr.number, title: pr.title, sources: overlap });
}

if (duplicates.length) {
  console.error('\nDuplicate editorial source detected in another open PR:\n');
  for (const d of duplicates) {
    console.error(` - PR #${d.pr}: ${d.title}`);
    for (const source of d.sources) console.error(`   ${source}`);
  }
  console.error('\nClose the duplicate PR or use a genuinely different source/story before merging.');
  process.exit(1);
}

console.log('No duplicate source URLs found across open editorial PRs.');
