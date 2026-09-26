// End-to-end tests of the GitHub-facing scripts against a local mock API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_CHECKS, VERIFICATION_REVIEWER } from '../scripts/lib/editorial.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = 'Sh-010/Nuvellum';
const b64 = (s) => Buffer.from(s).toString('base64');

function md(fields) {
  const fm = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  return `---\n${fm}\n---\n\n${'A measured, sourced paragraph of reporting with names and figures. '.repeat(20)}\n`;
}

// Minimal GitHub API mock. `state` describes branches, PRs and runs.
function mockGitHub(state) {
  const calls = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    calls.push(`${req.method} ${p}${url.search}`);
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    const base = `/repos/${REPO}`;

    if (req.method === 'GET' && p === `${base}/pulls`) {
      const st = url.searchParams.get('state');
      return json(200, state.prs.filter(pr => st === 'all' || pr.state === st));
    }
    let m;
    if ((m = p.match(new RegExp(`^${base}/pulls/(\\d+)/files$`)))) return json(200, state.prs.find(x => x.number === +m[1]).files);
    if (req.method === 'PUT' && (m = p.match(new RegExp(`^${base}/pulls/(\\d+)/merge$`)))) {
      let body = ''; req.on('data', c => body += c); req.on('end', () => { state.merged.push({ number: +m[1], ...JSON.parse(body) }); json(200, { merged: true }); });
      return;
    }
    if ((m = p.match(new RegExp(`^${base}/pulls/(\\d+)$`)))) return json(200, state.prs.find(x => x.number === +m[1]));
    if (req.method === 'DELETE' && (m = p.match(new RegExp(`^${base}/git/refs/heads/(.+)$`)))) { state.deleted.push(m[1]); return json(204); }
    if (p === `${base}/actions/runs`) return json(200, { workflow_runs: state.runs[url.searchParams.get('head_sha')] || [] });
    if (p === `${base}/git/matching-refs/heads/incoming/`) return json(400, { message: 'Bad Request (real GitHub behaviour)' });
    if (p === `${base}/git/matching-refs/heads/incoming`) return json(200, [...Object.keys(state.branches).filter(b => b.startsWith('incoming/')), 'incoming-lookalike'].map(b => ({ ref: `refs/heads/${b}` })));
    if ((m = p.match(new RegExp(`^${base}/compare/main\\.\\.\\.(.+)$`)))) {
      const br = state.branches[m[1]] || Object.values(state.branches).find(b => b.sha === m[1]);
      if (!br) return json(404, { message: 'Not Found' });
      return json(200, { ahead_by: 1, files: br.files.map(([filename]) => ({ filename, status: 'added' })), commits: [{ commit: { committer: { date: br.first } } }] });
    }
    if ((m = p.match(new RegExp(`^${base}/contents/(.+)$`)))) {
      const ref = url.searchParams.get('ref');
      const tree = ref === 'main' ? state.main : (state.branches[ref] || Object.values(state.branches).find(b => b.sha === ref))?.files;
      const hit = (tree || []).find(([f]) => f === m[1]);
      return hit ? json(200, { content: b64(hit[1]) }) : json(404, { message: 'Not Found' });
    }
    json(404, { message: `unmocked ${req.method} ${p}` });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

function run(script, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [join(root, 'scripts', script)], { env: { PATH: process.env.PATH, GITHUB_TOKEN: 't', GITHUB_REPOSITORY: REPO, ...env } });
    let out = '';
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
    child.on('close', code => resolve({ code, out }));
  });
}

const green = () => REQUIRED_CHECKS.map(name => ({ name, status: 'completed', conclusion: 'success', created_at: '2026-09-26T10:00:00Z' }));

function prFor(number, slug, sha, extra = {}) {
  return {
    number, state: 'open', draft: false, labels: [], base: { ref: 'main' },
    head: { ref: `incoming/${slug}-1a2b3c4d`, sha, repo: { full_name: REPO } },
    files: [{ filename: `src/content/articles/${slug}.md`, status: 'added' }],
    ...extra
  };
}

function scenario() {
  const low = md({ title: 'Low story', status: 'published', origin: 'automation', risk: 'low', editorialReview: 'passed', section: 'World', type: 'News', sourceUrls: ['https://ex.com/low'], sourceNote: 'Prepared from Example reporting.' });
  const sensOk = md({ title: 'Sensitive ok', status: 'published', origin: 'automation', risk: 'sensitive', editorialReview: 'passed', verification: 'cleared', reviewedBy: VERIFICATION_REVIEWER, section: 'World', type: 'News', sourceUrls: ['https://ex.com/s1'], sourceNote: 'Prepared from Example reporting.' });
  const sensBad = md({ title: 'Sensitive uncertain', status: 'review', origin: 'automation', risk: 'sensitive', editorialReview: 'passed', verification: 'uncertain', section: 'World', type: 'News', sourceUrls: ['https://ex.com/s2'], sourceNote: 'Prepared from Example reporting.' });
  const pending = md({ title: 'Pending checks', status: 'published', origin: 'automation', risk: 'low', editorialReview: 'passed', section: 'World', type: 'News', sourceUrls: ['https://ex.com/p'], sourceNote: 'Prepared from Example reporting.' });
  return {
    main: [],
    merged: [], deleted: [],
    branches: {
      'incoming/low-1a2b3c4d': { sha: 'sha-low', first: '1', files: [['src/content/articles/low.md', low]] },
      'incoming/sens-ok-1a2b3c4d': { sha: 'sha-sok', first: '1', files: [['src/content/articles/sens-ok.md', sensOk]] },
      'incoming/sens-bad-1a2b3c4d': { sha: 'sha-sbad', first: '1', files: [['src/content/articles/sens-bad.md', sensBad]] },
      'incoming/pending-1a2b3c4d': { sha: 'sha-pend', first: '1', files: [['src/content/articles/pending.md', pending]] }
    },
    prs: [prFor(1, 'low', 'sha-low'), prFor(2, 'sens-ok', 'sha-sok'), prFor(3, 'sens-bad', 'sha-sbad'), prFor(4, 'pending', 'sha-pend')],
    runs: {
      'sha-low': green(), 'sha-sok': green(), 'sha-sbad': green(),
      'sha-pend': green().map(r => r.name === 'CodeQL' ? { ...r, status: 'in_progress', conclusion: null } : r)
    }
  };
}

test('auto-publish: merges only cleared stories with green checks, pinned to head SHA', async () => {
  const state = scenario();
  const { server, url } = await mockGitHub(state);
  try {
    const r = await run('auto-publish.mjs', { GITHUB_API_URL: url, NUVELLUM_AUTOPUBLISH: 'on' });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(state.merged.map(m => m.number).sort(), [1, 2], r.out);
    for (const m of state.merged) {
      assert.equal(m.merge_method, 'squash');
      assert.equal(m.sha, state.prs.find(p => p.number === m.number).head.sha);
    }
    assert.deepEqual(state.deleted.sort(), ['incoming/low-1a2b3c4d', 'incoming/sens-ok-1a2b3c4d']);
    assert.match(r.out, /HOLD {2}PR #3[\s\S]*uncertain/);
    assert.match(r.out, /HOLD {2}PR #4[\s\S]*CodeQL" is in_progress/);
  } finally { server.close(); }
});

test('auto-publish: kill switch off means evaluate only, never merge', async () => {
  const state = scenario();
  const { server, url } = await mockGitHub(state);
  try {
    const r = await run('auto-publish.mjs', { GITHUB_API_URL: url });
    assert.equal(r.code, 0, r.out);
    assert.equal(state.merged.length, 0);
    assert.match(r.out, /READY PR #1/);
  } finally { server.close(); }
});

test('auto-publish: HEAD_BRANCH limits evaluation to one PR', async () => {
  const state = scenario();
  const { server, url } = await mockGitHub(state);
  try {
    const r = await run('auto-publish.mjs', { GITHUB_API_URL: url, NUVELLUM_AUTOPUBLISH: 'on', HEAD_BRANCH: 'incoming/sens-ok-1a2b3c4d' });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(state.merged.map(m => m.number), [2]);
  } finally { server.close(); }
});

test('duplicate guard: newer branch with the same source fails, older passes, published ignored', async () => {
  const story = (src) => md({ title: 'T', sourceUrls: [src] });
  const state = {
    merged: [], deleted: [],
    main: [['src/content/articles/published.md', story('https://bbc.co.uk/news/old')]],
    branches: {
      'incoming/older': { sha: 'sha-older', first: '2026-09-26T09:00:00Z', files: [['src/content/articles/older.md', story('https://www.bbc.co.uk/news/x?at_medium=RSS')]] },
      'incoming/newer': { sha: 'sha-newer', first: '2026-09-26T10:00:00Z', files: [['src/content/articles/newer.md', story('https://bbc.co.uk/news/x')]] },
      'incoming/stale-merged': { sha: 'sha-stale', first: '2026-09-25T09:00:00Z', files: [['src/content/articles/published.md', story('https://bbc.co.uk/news/old')]] },
      'incoming/closed': { sha: 'sha-closed', first: '2026-09-20T09:00:00Z', files: [['src/content/articles/closed.md', story('https://bbc.co.uk/news/x')]] },
      'incoming/unique': { sha: 'sha-unique', first: '2026-09-26T11:00:00Z', files: [['src/content/articles/unique.md', story('https://bbc.co.uk/news/unique')]] }
    },
    prs: [
      { number: 9, state: 'closed', head: { ref: 'incoming/closed', repo: { full_name: REPO } } }
    ],
    runs: {}
  };
  const { server, url } = await mockGitHub(state);
  try {
    const newer = await run('check-pr-duplicates.mjs', { GITHUB_API_URL: url, HEAD_REF: 'incoming/newer', HEAD_SHA: 'sha-newer' });
    assert.equal(newer.code, 1, newer.out);
    assert.match(newer.out, /incoming\/older/);
    assert.doesNotMatch(newer.out, /incoming\/closed/);

    const older = await run('check-pr-duplicates.mjs', { GITHUB_API_URL: url, HEAD_REF: 'incoming/older', HEAD_SHA: 'sha-older' });
    assert.equal(older.code, 0, older.out);

    const unique = await run('check-pr-duplicates.mjs', { GITHUB_API_URL: url, HEAD_REF: 'incoming/unique', HEAD_SHA: 'sha-unique' });
    assert.equal(unique.code, 0, unique.out);
  } finally { server.close(); }
});

test('auto-publish: GitHub API outage fails loudly and merges nothing', async () => {
  const { createServer } = await import('node:http');
  const s = createServer((req, res) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"message":"Bad gateway"}'); });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  try {
    const r = await run('auto-publish.mjs', { GITHUB_API_URL: `http://127.0.0.1:${s.address().port}`, NUVELLUM_AUTOPUBLISH: 'on' });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /502/);
  } finally { s.close(); }
});

test('auto-publish: if the branch moved after evaluation, GitHub refuses the pinned merge and nothing is deleted', async () => {
  const state = scenario();
  state.prs = [state.prs[0]];
  const { server, url } = await mockGitHub(state);
  // Replace the merge handler: emulate GitHub's 409 "Head branch was modified".
  const orig = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (req.method === 'PUT' && req.url.includes('/merge')) { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"message":"Head branch was modified. Review and try the merge again."}'); return; }
    orig(req, res);
  });
  try {
    const r = await run('auto-publish.mjs', { GITHUB_API_URL: url, NUVELLUM_AUTOPUBLISH: 'on' });
    assert.equal(r.code, 1);
    assert.match(r.out, /FAILED to merge PR #1[\s\S]*409/);
    assert.deepEqual(state.deleted, []);
  } finally { server.close(); }
});
