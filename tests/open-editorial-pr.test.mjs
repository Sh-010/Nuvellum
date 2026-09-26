// scripts/open-editorial-pr.mjs against a local mock GitHub API.
// Regression for PRs #34/#35: both were titled after the previous story
// because the branch-creation push pointed at a merge commit that added it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = 'Sh-010/Nuvellum';
const b64 = (s) => Buffer.from(s).toString('base64');

function article({ title, source, risk = 'low', section = 'World', extra = {} }) {
  const fields = { title, section, status: 'published', sourceUrls: [source], origin: 'automation', risk, editorialReview: 'passed', ...extra };
  return '---\n' + Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n---\n\nBody.\n';
}

const LEVOIT = 'src/content/articles/levoit-air-purifier.md';
const STALLONE = 'src/content/articles/stallone-bulimic.md';

// state.commits: sha -> { added: [paths] relative to main, files: { path: content } }
function mockGitHub(state) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body ?? null)); };
    const readBody = (cb) => { let b = ''; req.on('data', c => b += c); req.on('end', () => cb(JSON.parse(b || '{}'))); };
    const base = `/repos/${REPO}`;
    let m;
    if ((m = p.match(new RegExp(`^${base}/compare/main\\.\\.\\.(.+)$`)))) {
      const c = state.commits[m[1]];
      return c ? json(200, { files: c.added.map(filename => ({ filename, status: 'added' })) }) : json(404, { message: 'Not Found' });
    }
    if ((m = p.match(new RegExp(`^${base}/contents/(.+)$`)))) {
      const c = state.commits[url.searchParams.get('ref')];
      const content = c && c.files[m[1]];
      return content ? json(200, { content: b64(content) }) : json(404, { message: 'Not Found' });
    }
    if (req.method === 'GET' && p === `${base}/pulls`) {
      const head = url.searchParams.get('head');
      return json(200, state.prs.filter(pr => pr.state === 'open' && `Sh-010:${pr.head.ref}` === head));
    }
    if (req.method === 'POST' && p === `${base}/pulls`) {
      return readBody(b => { const pr = { number: 100 + state.prs.length, state: 'open', head: { ref: b.head }, title: b.title, body: b.body }; state.prs.push(pr); state.calls.push('create'); json(201, pr); });
    }
    if (req.method === 'PATCH' && (m = p.match(new RegExp(`^${base}/pulls/(\\d+)$`)))) {
      return readBody(b => { const pr = state.prs.find(x => x.number === +m[1]); Object.assign(pr, b); state.calls.push('update'); json(200, pr); });
    }
    json(404, { message: `unmocked ${req.method} ${p}` });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

function run(env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [join(root, 'scripts', 'open-editorial-pr.mjs')], { env: { PATH: process.env.PATH, GITHUB_TOKEN: 't', GITHUB_REPOSITORY: REPO, ...env } });
    let out = '';
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
    child.on('close', code => resolve({ code, out }));
  });
}

function scenario() {
  return {
    calls: [],
    prs: [],
    commits: {
      // main's tip: the merge commit that published Levoit. The new branch starts here.
      mergeTip: { added: [], files: { [LEVOIT]: article({ title: 'Levoit air purifier', source: 'https://techcrunch.com/levoit' }) } },
      imageOnly: { added: ['public/generated/ai/stallone-bulimic.svg'], files: {} },
      withArticle: {
        added: ['public/generated/ai/stallone-bulimic.svg', STALLONE],
        files: { [STALLONE]: article({ title: 'Stallone says he became bulimic', source: 'https://variety.com/stallone', risk: 'sensitive', section: 'Film & TV', extra: { verification: 'cleared', reviewedBy: 'Nuvellum Verification Pipeline' } }) }
      },
      twoArticles: { added: [STALLONE, LEVOIT], files: {} }
    }
  };
}

const BRANCH = 'incoming/stallone-bulimic-e2db9634';

test('open-editorial-pr: follows the branch article through creation, image and article pushes', async () => {
  const state = scenario();
  const { server, url } = await mockGitHub(state);
  try {
    const env = { GITHUB_API_URL: url, HEAD_BRANCH: BRANCH };
    // 1. Branch creation at main's merge commit: nothing added yet, no PR, and never the Levoit metadata.
    let r = await run({ ...env, HEAD_SHA: 'mergeTip' });
    assert.equal(r.code, 0, r.out);
    assert.equal(state.prs.length, 0);
    // 2. Image-only commit: still no PR.
    r = await run({ ...env, HEAD_SHA: 'imageOnly' });
    assert.equal(r.code, 0, r.out);
    assert.equal(state.prs.length, 0);
    // 3. Article commit: PR describes this branch's article.
    r = await run({ ...env, HEAD_SHA: 'withArticle' });
    assert.equal(r.code, 0, r.out);
    assert.equal(state.prs.length, 1);
    const pr = state.prs[0];
    assert.equal(pr.title, 'Editorial: Stallone says he became bulimic');
    assert.match(pr.body, /\*\*Source:\*\* https:\/\/variety\.com\/stallone/);
    assert.match(pr.body, /\*\*Risk:\*\* sensitive/);
    assert.match(pr.body, /\*\*Sensitive verification:\*\* cleared/);
    assert.match(pr.body, /\*\*Section:\*\* Film & TV/);
    assert.doesNotMatch(pr.title + pr.body, /Levoit|techcrunch/i);
    // 4. Re-run on the same commit: no duplicate PR, no needless update.
    r = await run({ ...env, HEAD_SHA: 'withArticle' });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(state.calls, ['create']);
  } finally { server.close(); }
});

test('open-editorial-pr: rewrites a PR that carries stale metadata from another story', async () => {
  const state = scenario();
  state.prs.push({ number: 34, state: 'open', head: { ref: BRANCH }, title: 'Editorial: Levoit air purifier', body: '**Source:** https://techcrunch.com/levoit' });
  const { server, url } = await mockGitHub(state);
  try {
    const r = await run({ GITHUB_API_URL: url, HEAD_BRANCH: BRANCH, HEAD_SHA: 'withArticle' });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(state.calls, ['update']);
    assert.equal(state.prs[0].title, 'Editorial: Stallone says he became bulimic');
    assert.match(state.prs[0].body, /variety\.com\/stallone/);
  } finally { server.close(); }
});

test('open-editorial-pr: refuses branches that add more than one article or are not incoming/**', async () => {
  const state = scenario();
  const { server, url } = await mockGitHub(state);
  try {
    let r = await run({ GITHUB_API_URL: url, HEAD_BRANCH: BRANCH, HEAD_SHA: 'twoArticles' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /adds 2 articles/);
    r = await run({ GITHUB_API_URL: url, HEAD_BRANCH: 'feature/x', HEAD_SHA: 'withArticle' });
    assert.equal(r.code, 0, r.out);
    assert.equal(state.prs.length, 0);
  } finally { server.close(); }
});
