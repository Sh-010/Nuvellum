// Shared fixtures for the admin tests: a strong test configuration, request helpers, image bytes and an
// in-memory GitHub that behaves like the real client (same guards, same stale-edit rule).
import { createHash } from 'node:crypto';
import { assertWorkBranch, assertWritablePaths, assertBranch, BRANCH_RE, INCOMING_RE, GitHubError, REPO } from '../scripts/lib/admin/github.mjs';
import { createAdminHandler } from '../scripts/lib/admin/handler.mjs';

export const ENV = {
  NUVELLUM_ADMIN_PASSWORD: 'correct horse battery staple 2026',
  NUVELLUM_ADMIN_SESSION_SECRET: 'x'.repeat(48),
  NUVELLUM_GITHUB_TOKEN: 'test-token-never-sent'
};
export const ORIGIN = 'https://www.nuvellum.news';

export function makeHandler({ env = ENV, gh = new FakeGitHub(), clock = { t: Date.parse('2026-09-30T09:00:00Z') }, delays = [] } = {}) {
  const handle = createAdminHandler({ env, githubFactory: () => gh, now: () => clock.t, delay: async (ms) => { delays.push(ms); }, log: { error() {} } });
  return { handle, gh, clock, delays };
}

export function req(action, { method = 'GET', body, cookie, csrf, origin = ORIGIN, params = {}, contentType = 'application/json', headers = {} } = {}) {
  const q = new URLSearchParams({ action, ...params });
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (method === 'POST') {
    if (origin) h.origin = origin;
    if (contentType) h['content-type'] = contentType;
    if (csrf) h['x-nuvellum-csrf'] = csrf;
  }
  return new Request(`${ORIGIN}/api/admin?${q}`, { method, headers: h, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
}

export async function login(handle) {
  const res = await handle(req('login', { method: 'POST', body: { password: ENV.NUVELLUM_ADMIN_PASSWORD } }));
  const data = await res.json();
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { res, data, cookie, csrf: data.csrf };
}

export async function call(handle, auth, action, opts = {}) {
  const res = await handle(req(action, { cookie: auth.cookie, csrf: auth.csrf, ...opts }));
  return { status: res.status, data: await res.json(), res };
}

// ---- image bytes ------------------------------------------------------------------------------
export function jpeg(width = 1200, height = 800) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), sof, Buffer.from([0xff, 0xd9])]);
}
export function png(width = 1200, height = 800) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}
export function webp(width = 1200, height = 800) {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(22, 4); b.write('WEBP', 8, 'ascii'); b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(width - 1, 24, 3); b.writeUIntLE(height - 1, 27, 3);
  return b;
}

// ---- articles -----------------------------------------------------------------------------------
export const BODY = '## What happened\n\nOfficials confirmed the talks would resume on Thursday, according to the ministry. ' +
  'The delegation will travel with a small team, and negotiators said several issues remained open.\n\n> A quoted line.\n\n- first point\n- second point';

export function form(over = {}) {
  return {
    title: 'Ceasefire talks will resume on Thursday', dek: 'Negotiators will return to Cairo this week.', section: 'World', type: 'News',
    author: 'Sam Shehab', date: '2026-09-30', publishedAt: '', body: BODY, tags: ['Diplomacy'], countries: ['Egypt'], regions: ['middle-east-north-africa'],
    sourceUrls: ['https://example.org/ceasefire'], sourceNote: 'Reported from the ministry statement.', risk: 'low', editorialReview: 'passed', verification: '', reviewedBy: '',
    ...over
  };
}

export const md = (fm, body = BODY) => `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${body}\n`;

// ---- in-memory GitHub ----------------------------------------------------------------------------
const sha1 = (s) => createHash('sha1').update(String(s)).digest('hex');

export class FakeGitHub {
  constructor() {
    this.commits = new Map(); // sha -> Map(path -> content)
    this.refs = new Map();    // branch -> sha
    this.pulls = [];
    this.runs = new Map();    // sha -> runs
    this.labelsLog = []; this.comments = []; this.merged = []; this.deleted = []; this.writes = 0;
    this.n = 100;
    const main = new Map();
    main.set('src/content/articles/existing-story.md', md({ title: 'An existing published story', dek: 'Dek.', section: 'Business', type: 'News', author: 'Nuvellum Global Desk', date: '2026-09-01', readingTime: '1 min', status: 'published', tags: ['Markets'], origin: 'manual', risk: 'low', editorialReview: 'passed', reviewedBy: '' }));
    main.set('public/uploads/articles/existing-story.jpg', 'jpg');
    this.refs.set('main', this.store(main));
  }
  store(files) { const s = sha1([...files].map(([p, c]) => p + c).join('|') + Math.random()); this.commits.set(s, files); return s; }
  filesAt(ref) { const s = this.refs.get(ref) || ref; return this.commits.get(s) || null; }
  setMain(path, content) { const f = new Map(this.filesAt('main')); f.set(path, content); this.refs.set('main', this.store(f)); }

  async snapshot(ref = 'main') {
    const f = this.filesAt(ref);
    const pick = (dir) => [...f.keys()].filter((p) => p.startsWith(dir + '/')).map((p) => p.slice(dir.length + 1));
    return {
      articles: pick('src/content/articles').map((name) => ({ name, sha: sha1(f.get(`src/content/articles/${name}`)), text: f.get(`src/content/articles/${name}`) })),
      uploads: new Set(pick('public/uploads/articles')), aiArt: new Set(pick('public/generated/ai'))
    };
  }
  async readArticle(slug, ref = 'main') { const f = this.filesAt(ref); const t = f?.get(`src/content/articles/${slug}.md`); return t === undefined ? null : { sha: sha1(t), text: t }; }
  async uploadExists(path, ref = 'main') { return Boolean(this.filesAt(ref)?.has('public' + path)); }
  async branchHead(branch) { if (branch !== 'main') assertWorkBranch(branch); return this.refs.get(branch) || null; }
  async manualBranches() { return [...this.refs.keys()].filter((b) => BRANCH_RE.test(b)).map((branch) => ({ branch, sha: this.refs.get(branch) })); }
  async editorialPulls(state = 'open') { return this.pulls.filter((p) => (state === 'all' || p.state === state)); }
  async recentlyClosed() { return this.pulls.filter((p) => p.state === 'closed'); }
  async manualPulls(state = 'open') { return (await this.editorialPulls(state)).filter((p) => BRANCH_RE.test(p.head.ref)); }
  async pullForBranch(branch) { assertWorkBranch(branch); return this.pulls.filter((p) => p.head.ref === branch).pop() || null; }
  async pull(number) { const p = this.pulls.find((x) => x.number === number); if (!p) throw new GitHubError(404, 'Not found on GitHub.'); return p; }
  async pullFiles(number) {
    const p = await this.pull(number); const head = this.filesAt(p.head.sha); const base = this.filesAt('main');
    return [...head].filter(([k, v]) => base.get(k) !== v).map(([filename]) => ({ filename, status: base.has(filename) ? 'modified' : 'added' }));
  }
  async workflowRuns(sha) { return this.runs.get(sha) || []; }
  async commit({ branch, slug, files, message, expectedArticleSha }) {
    assertWorkBranch(branch); assertWritablePaths(files.map((f) => f.path), slug);
    const existing = this.refs.get(branch);
    if (!existing && !BRANCH_RE.test(branch)) throw new GitHubError(404, 'That newsroom branch no longer exists.');
    if (INCOMING_RE.test(branch) && !/^editor: /.test(message)) throw new GitHubError(400, 'Editor commits on newsroom branches must be marked.');
    const parent = this.filesAt(existing || 'main');
    const cur = parent.get(`src/content/articles/${slug}.md`);
    if ((cur === undefined ? null : sha1(cur)) !== (expectedArticleSha || null)) throw new GitHubError(409, 'The repository changed while you were editing. Reload the article and try again.');
    const next = new Map(parent);
    for (const f of files) next.set(f.path, f.content ?? `base64:${f.base64.length}`);
    const s = this.store(next); this.refs.set(branch, s); this.writes++; this.lastMessage = message;
    for (const p of this.pulls) if (p.head.ref === branch && p.state === 'open') p.head.sha = s;
    return { commit: s, articleSha: sha1(next.get(`src/content/articles/${slug}.md`)) };
  }
  async openPull({ branch, title }) {
    assertBranch(branch);
    const pr = { number: ++this.n, state: 'open', draft: false, title, html_url: `https://github.com/${REPO}/pull/${this.n}`, merged_at: null, labels: [],
      head: { ref: branch, sha: this.refs.get(branch), repo: { full_name: REPO } }, base: { ref: 'main' } };
    this.pulls.push(pr); return pr;
  }
  addNewsroomPull(slug, fm, { labels = [] } = {}) {
    const branch = `incoming/${slug.slice(0, 60)}-1a2b3c4d`;
    const files = new Map(this.filesAt('main')); files.set(`src/content/articles/${slug}.md`, md(fm));
    const s = this.store(files); this.refs.set(branch, s);
    const pr = { number: ++this.n, state: 'open', draft: false, title: `Editorial: ${fm.title}`, html_url: '#', merged_at: null, labels: labels.map((name) => ({ name })),
      head: { ref: branch, sha: s, repo: { full_name: REPO } }, base: { ref: 'main' } };
    this.pulls.push(pr); return pr;
  }
  green(sha, names = ['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard', 'Acquire editorial visual'], conclusion = 'success') {
    this.runs.set(sha, names.map((name, i) => ({ name, status: 'completed', conclusion, created_at: `2026-09-30T09:0${i}:00Z` })));
  }
  async merge({ number, sha }) {
    const p = await this.pull(number);
    if (p.head.sha !== sha) throw new GitHubError(409, 'stale');
    this.refs.set('main', this.store(new Map(this.filesAt(sha))));
    p.state = 'closed'; p.merged_at = '2026-09-30T10:00:00Z'; p.merge_commit_sha = this.refs.get('main'); this.merged.push(number);
    return { sha: this.refs.get('main') };
  }
  async closePull(number) { const p = await this.pull(number); p.state = 'closed'; }
  async setLabel(number, label, on) {
    const p = await this.pull(number); this.labelsLog.push([number, label, on]);
    p.labels = on ? [...p.labels.filter((l) => l.name !== label), { name: label }] : p.labels.filter((l) => l.name !== label);
  }
  async comment(number, text) { this.comments.push([number, text]); }
  async deleteBranch(branch) { assertBranch(branch); this.refs.delete(branch); this.deleted.push(branch); }
}
