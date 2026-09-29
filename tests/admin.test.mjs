// Nuvellum admin dashboard: authentication, authorisation, the article contract, images, editorial
// gates, the GitHub write scope, stale-edit protection and the Review Queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ENV, makeHandler, req, login, call, jpeg, png, webp, form, md, BODY } from './admin-fixtures.mjs';
import { authConfig, createSession, verifySession, SESSION_TTL_MS, createThrottle } from '../scripts/lib/admin/auth.mjs';
import { createGitHub, branchFor, assertBranch, assertWorkBranch, assertWritablePaths, articlePath, uploadPath, storySlugFromFiles, REPO, GitHubError } from '../scripts/lib/admin/github.mjs';
import { buildArticle, checkArticle, publicationGates, publicationState, queueBucket } from '../scripts/lib/admin/editor.mjs';
import { checkUpload, checkImageUrl } from '../scripts/lib/admin/images.mjs';
import { renderMarkdown, renderPreview } from '../scripts/lib/admin/render.mjs';
import { articleErrors, parseArticle, serializeArticle, SECTIONS, TYPES, STATUSES, manualPublicationErrors } from '../scripts/lib/article-rules.mjs';

const EMPTY = { articles: [], uploads: new Set(), aiArt: new Set() };

// ---- authentication ----------------------------------------------------------------------------------
test('admin fails closed without strong secrets', async () => {
  for (const env of [{}, { ...ENV, NUVELLUM_ADMIN_PASSWORD: 'short' }, { ...ENV, NUVELLUM_ADMIN_SESSION_SECRET: 'short' },
    { ...ENV, NUVELLUM_ADMIN_SESSION_SECRET: ENV.NUVELLUM_ADMIN_PASSWORD + 'x'.repeat(20), NUVELLUM_ADMIN_PASSWORD: ENV.NUVELLUM_ADMIN_PASSWORD + 'x'.repeat(20) }]) {
    const { handle } = makeHandler({ env });
    for (const r of [req('session'), req('login', { method: 'POST', body: { password: 'anything at all here' } }), req('list')]) {
      const res = await handle(r);
      assert.equal(res.status, 503);
      assert.doesNotMatch(await res.text(), /correct horse|xxxxxxxx/);
    }
  }
  assert.equal(authConfig(ENV).ok, true);
});

test('login: wrong password is refused and slowed; correct password sets a hardened session cookie', async () => {
  const { handle, delays } = makeHandler();
  const bad = await handle(req('login', { method: 'POST', body: { password: 'nope nope nope nope' } }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.ok(delays[0] >= 800, 'failed logins are delayed');
  const { res, data } = await login(handle);
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^__Host-nuvellum_admin=v1\.\d+\.[\w-]{24}\.[\w-]+;/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSION_TTL_MS / 1000}`]) assert.ok(cookie.includes(flag), flag);
  assert.ok(data.csrf && data.csrf.length >= 40);
  const text = JSON.stringify(data);
  for (const secret of Object.values(ENV)) assert.ok(!text.includes(secret), 'no secret in the login response');
});

test('login is throttled after repeated failures, even with the right password', async () => {
  const { handle } = makeHandler();
  for (let i = 0; i < 5; i++) assert.equal((await handle(req('login', { method: 'POST', body: { password: `wrong-${i}-xxxxxxxxxxxx` } }))).status, 401);
  const res = await handle(req('login', { method: 'POST', body: { password: ENV.NUVELLUM_ADMIN_PASSWORD } }));
  assert.equal(res.status, 429);
  const t = createThrottle({ maxFailures: 2, windowMs: 1000 });
  t.fail('a', 0); t.fail('a', 10);
  assert.equal(t.blocked('a', 20), true);
  assert.equal(t.blocked('a', 2000), false, 'the window expires');
});

test('every protected endpoint refuses anonymous requests', async () => {
  const { handle, gh } = makeHandler();
  for (const action of ['meta', 'list', 'queue', 'article', 'status']) assert.equal((await handle(req(action))).status, 401, action);
  for (const action of ['check', 'save', 'merge', 'discard', 'review', 'logout']) assert.equal((await handle(req(action, { method: 'POST', body: {} }))).status, 401, action);
  assert.equal(gh.writes, 0);
  assert.equal((await handle(req('delete-everything'))).status, 404);
});

test('sessions expire, and tampered or foreign cookies are rejected', async () => {
  const clock = { t: Date.parse('2026-09-30T09:00:00Z') };
  const { handle } = makeHandler({ clock });
  const auth = await login(handle);
  assert.equal((await call(handle, auth, 'meta')).status, 200);
  clock.t += SESSION_TTL_MS + 1000;
  assert.equal((await call(handle, auth, 'meta')).status, 401, 'expired session');
  const s = createSession(ENV.NUVELLUM_ADMIN_SESSION_SECRET, Date.now());
  assert.ok(verifySession(s.token, ENV.NUVELLUM_ADMIN_SESSION_SECRET));
  assert.equal(verifySession(s.token, 'y'.repeat(48)), null, 'other secret');
  assert.equal(verifySession(s.token.replace(/\.(\d+)\./, (m, e) => `.${Number(e) + 1}.`), ENV.NUVELLUM_ADMIN_SESSION_SECRET), null, 'extended expiry');
  assert.equal(verifySession('v1.9999999999999.' + 'a'.repeat(24) + '.forged', ENV.NUVELLUM_ADMIN_SESSION_SECRET), null);
});

test('state-changing requests need same origin, JSON and the session CSRF token', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const body = { slug: 'x-story', intent: 'draft', form: form() };
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body, csrf: '' })).status, 403, 'no CSRF token');
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body, csrf: 'forged' })).status, 403, 'wrong CSRF token');
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body, origin: 'https://evil.example' })).status, 403, 'cross-site');
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body, origin: null })).status, 403, 'no Origin');
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body, contentType: 'text/plain' })).status, 415);
  const other = await login(makeHandler().handle);
  assert.equal((await call(handle, { cookie: auth.cookie, csrf: other.csrf }, 'save', { method: 'POST', body })).status, 403, 'CSRF bound to its own session');
  assert.equal(gh.writes, 0);
  assert.equal((await call(handle, auth, 'logout', { method: 'POST' })).res.headers.get('set-cookie').includes('Max-Age=0'), true);
});

test('API responses are never cached or indexed and never carry secrets', async () => {
  const { handle } = makeHandler();
  const auth = await login(handle);
  const { res, data } = await call(handle, auth, 'meta');
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.deepEqual(data.sections, SECTIONS);
  for (const secret of Object.values(ENV)) assert.ok(!JSON.stringify(data).includes(secret));
});

// ---- the article contract ----------------------------------------------------------------------------
test('dashboard vocabularies are the validator\'s own', () => {
  for (const s of SECTIONS) assert.deepEqual(articleErrors(md({ title: 'T one', dek: 'D', section: s, type: 'News', author: 'A', date: '2026-09-30', readingTime: '1 min', status: 'draft', tags: ['x'] }), 'a.md').filter((e) => /section/.test(e)), []);
  assert.ok(articleErrors(md({ title: 'T', dek: 'D', section: 'Weather', type: 'Blog', author: 'A', date: '2026-09-30', readingTime: '1 min', status: 'live', tags: ['x'] }), 'a.md').join('|').match(/unsupported section.*unsupported type|status must be/));
  const validator = readFileSync(new URL('../scripts/validate-content.mjs', import.meta.url), 'utf8');
  assert.match(validator, /from '\.\/lib\/article-rules\.mjs'/, 'the validator uses the shared contract');
  assert.deepEqual(STATUSES, ['draft', 'review', 'published']);
  assert.ok(TYPES.includes('Opinion') && TYPES.includes('Essay'));
});

test('slug validation and suggestion', async () => {
  const { handle } = makeHandler();
  const auth = await login(handle);
  for (const slug of ['../etc/passwd', 'Upper-Case', 'has space', 'trailing-', '-leading', 'a/b', 'x'.repeat(91), 'emoji-😀']) {
    const r = await call(handle, auth, 'check', { method: 'POST', body: { slug, intent: 'draft', form: form() } });
    assert.equal(r.status, 422, slug);
  }
  const ok = await call(handle, auth, 'check', { method: 'POST', body: { slug: 'ceasefire-talks-resume', intent: 'review', form: form() } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.suggestedSlug, 'ceasefire-talks-will-resume-on-thursday');
});

test('check reports which problems would block even a draft, separately from publication requirements', async () => {
  const { handle } = makeHandler();
  const auth = await login(handle);
  // Incomplete but safe: publication requirements are reported, nothing blocks a draft.
  const incomplete = await call(handle, auth, 'check', { method: 'POST', body: { slug: 'half-written', intent: 'review', form: form({ dek: '', tags: [] }) } });
  assert.equal(incomplete.status, 200);
  assert.ok(incomplete.data.errors.length >= 2, 'dek and tags are still required for publication');
  assert.deepEqual(incomplete.data.draftBlockers, [], 'an incomplete story can still be saved as a draft');
  // Unsafe markup blocks drafts too, and is reported as such.
  const unsafe = await call(handle, auth, 'check', { method: 'POST', body: { slug: 'unsafe-body', intent: 'review', form: form({ body: 'Hello <script>alert(1)</script>' }) } });
  assert.ok(unsafe.data.draftBlockers.some((e) => /raw HTML|unsafe/.test(e)), JSON.stringify(unsafe.data.draftBlockers));
  assert.ok(unsafe.data.draftBlockers.every((e) => unsafe.data.errors.includes(e) || /image/i.test(e)), 'draft blockers are a subset of the reported problems');
  // And the draft save really is refused for it, while the incomplete story saves.
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body: { slug: 'unsafe-body', intent: 'draft', isNew: true, form: form({ body: 'Hello <script>alert(1)</script>' }), image: { mode: 'none' } } })).status, 422);
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body: { slug: 'half-written', intent: 'draft', isNew: true, form: form({ dek: '', tags: [] }), image: { mode: 'none' } } })).status, 200);
});

test('serialization: dashboard articles are valid Nuvellum Markdown with origin manual', () => {
  const now = new Date('2026-09-30T10:15:00Z');
  const { markdown, data } = buildArticle(form(), { intent: 'publish', now });
  assert.equal(data.origin, 'manual');
  assert.equal(data.status, 'published');
  assert.equal(data.publishedAt, '2026-09-30T10:15:00Z');
  assert.equal(data.readingTime, '1 min');
  assert.deepEqual(articleErrors(markdown, 'ceasefire-talks.md'), []);
  const parsed = parseArticle(markdown, 'x.md');
  assert.deepEqual(parsed.data.tags, ['Diplomacy']);
  assert.equal(parsed.body, BODY_TRIM());
  assert.equal(serializeArticle(parsed.data, parsed.body), markdown, 'stable round-trip');
  assert.equal(buildArticle(form(), { intent: 'draft', now }).data.status, 'draft');
  assert.equal(buildArticle(form(), { intent: 'review', now }).data.status, 'review');
  const edit = buildArticle(form(), { existing: { status: 'published', origin: 'automation', date: '2026-09-01' }, intent: 'publish', now });
  assert.equal(edit.data.updated, '2026-09-30', 'editing a published story records the update');
  assert.equal(edit.data.origin, 'automation', 'an edit keeps the story\'s origin');
});
const BODY_TRIM = () => form().body.trim();

test('every existing article round-trips through the serializer unchanged', () => {
  const dir = new URL('../src/content/articles/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const a = parseArticle(src, f);
    const b = parseArticle(serializeArticle(a.data, a.body), f);
    assert.deepEqual({ ...b.data }, { ...a.data }, f);
    assert.equal(b.body, a.body, f);
  }
});

test('unsafe Markdown and HTML are rejected, and the preview renders them inert', () => {
  const bad = { html: 'Hello <img src=x onerror=alert(1)> world', script: 'Hi <script>alert(1)</script>', js: '[x](javascript:alert(1))', data: '[x](data:text/html;base64,PHNjcmlwdD4=)', vb: '[x](vbscript:msgbox)', ref: '[x][1]\n\n[1]: javascript:alert(1)', proto: '[x](//evil.example/x)' };
  for (const [name, body] of Object.entries(bad)) {
    const { markdown, data } = buildArticle(form({ body: `Opening paragraph for a story.\n\n${body}` }), { intent: 'draft' });
    const r = checkArticle({ slug: 'unsafe-story', markdown, data, snapshot: EMPTY, isNew: true });
    assert.ok(r.errors.length > 0, `${name} must be rejected`);
    assert.ok(r.safetyErrors.length > 0, `${name} blocks even a draft`);
  }
  const { html } = renderMarkdown('Hi <script>alert(1)</script> and [x](javascript:alert(1)) and [ok](https://example.org "t") and **b** *i*');
  assert.doesNotMatch(html, /<script|javascript:|onerror/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="https:\/\/example.org" rel="noopener nofollow">ok<\/a>/);
  assert.match(html, /<strong>b<\/strong>/);
  const preview = renderPreview({ title: '<b>T</b>', dek: '"><svg onload=1>', section: 'World', type: 'News', author: 'A <x>', readingTime: '1 min', date: '2026-09-30' }, 'Body');
  assert.doesNotMatch(preview, /<b>T<\/b>|<svg|<x>/);
});

// ---- images --------------------------------------------------------------------------------------------
test('image uploads: JPEG, PNG and WebP by content; SVG, mismatches, tiny and oversized files refused', () => {
  const b64 = (buf) => buf.toString('base64');
  for (const [name, type, buf, ext] of [['a.jpg', 'image/jpeg', jpeg(), 'jpg'], ['a.png', 'image/png', png(), 'png'], ['a.webp', 'image/webp', webp(), 'webp']]) {
    const r = checkUpload({ name, type, dataBase64: b64(buf) });
    assert.equal(r.ok, true, name + ': ' + r.errors);
    assert.equal(r.ext, ext);
    assert.equal(r.width, 1200);
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(checkUpload({ name: 'a.svg', type: 'image/svg+xml', dataBase64: b64(svg) }).ok, false);
  assert.equal(checkUpload({ name: 'a.jpg', type: 'image/jpeg', dataBase64: b64(svg) }).ok, false, 'SVG disguised as JPEG');
  assert.equal(checkUpload({ name: 'a.png', type: 'image/png', dataBase64: b64(jpeg()) }).ok, false, 'extension does not match content');
  assert.equal(checkUpload({ name: 'a.jpg', type: 'image/png', dataBase64: b64(jpeg()) }).ok, false, 'MIME claim does not match content');
  assert.equal(checkUpload({ name: 'a.jpg', type: 'image/jpeg', dataBase64: b64(jpeg(320, 200)) }).ok, false, 'too small');
  assert.equal(checkUpload({ name: 'a.jpg', type: 'image/jpeg', dataBase64: b64(Buffer.concat([jpeg(), Buffer.alloc(3.2 * 1024 * 1024)])) }).ok, false, 'too large');
  assert.equal(checkUpload({ name: 'a.gif', type: 'image/gif', dataBase64: b64(Buffer.from('GIF89a......')) }).ok, false);
  assert.equal(checkImageUrl('http://example.org/a.jpg'), 'Image URL must use https://.');
  assert.match(checkImageUrl('https://user:pw@example.org/a.jpg'), /credentials/);
  assert.match(checkImageUrl('https://example.org/a.svg'), /SVG/);
  assert.equal(checkImageUrl('https://upload.wikimedia.org/a.jpg'), null);
});

test('an uploaded image is committed to public/uploads/articles/<slug>.<ext> with the article', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const r = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'ceasefire-talks', intent: 'draft', expectedSha: null, form: form(),
    image: { mode: 'upload', upload: { name: 'photo.JPG', type: 'image/jpeg', dataBase64: jpeg().toString('base64') }, alt: 'Negotiators', credit: 'Jane Doe', caption: 'File photo', kind: 'photo', provider: 'manual' } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const files = gh.filesAt(r.data.branch);
  assert.ok(files.has('public/uploads/articles/ceasefire-talks.jpg'));
  const d = parseArticle(files.get('src/content/articles/ceasefire-talks.md'), 'x.md').data;
  assert.equal(d.image, '/uploads/articles/ceasefire-talks.jpg');
  assert.equal(d.imageCredit, 'Jane Doe');
  assert.equal(d.imageProvider, 'manual');
});

// ---- editorial gates ------------------------------------------------------------------------------------
test('low-risk gate: publishing needs editorial review passed (dashboard and repository validator)', () => {
  for (const review of ['', 'failed', 'uncertain']) {
    const { markdown, data } = buildArticle(form({ editorialReview: review }), { intent: 'publish' });
    const r = checkArticle({ slug: 'low-risk', markdown, data, snapshot: EMPTY, isNew: true, intent: 'publish' });
    assert.ok(r.errors.some((e) => /editorial review: passed|editorialReview/i.test(e)), review || 'missing');
    assert.ok(articleErrors(markdown, 'low-risk.md').some((e) => /editorialReview: "passed"/.test(e)), 'CI refuses it too');
  }
  const ok = buildArticle(form(), { intent: 'publish' });
  assert.deepEqual(checkArticle({ slug: 'low-risk', markdown: ok.markdown, data: ok.data, snapshot: EMPTY, isNew: true, intent: 'publish' }).errors, []);
  const draft = buildArticle(form({ editorialReview: '' }), { intent: 'draft' });
  assert.deepEqual(articleErrors(draft.markdown, 'low-risk.md'), [], 'gates apply only at publication');
});

test('sensitive gate: verification cleared and a named reviewer are both required', () => {
  const cases = [
    [{ verification: '', reviewedBy: 'Sam Shehab' }, /verification/],
    [{ verification: 'uncertain', reviewedBy: 'Sam Shehab' }, /verification/],
    [{ verification: 'failed', reviewedBy: 'Sam Shehab' }, /verification/],
    [{ verification: 'cleared', reviewedBy: '' }, /reviewer|reviewedBy/],
    [{ verification: 'cleared', reviewedBy: 'Nuvellum Verification Pipeline' }, /reviewer|reserved/]
  ];
  for (const [over, re] of cases) {
    const { markdown, data } = buildArticle(form({ risk: 'sensitive', ...over }), { intent: 'publish' });
    assert.equal(publicationGates(data).ok, false, JSON.stringify(over));
    const r = checkArticle({ slug: 'sensitive-story', markdown, data, snapshot: EMPTY, isNew: true, intent: 'publish' });
    assert.ok(r.errors.some((e) => re.test(e)), JSON.stringify(over) + ' -> ' + r.errors);
    assert.ok(articleErrors(markdown, 's.md').length > 0, 'CI refuses it too');
  }
  const ok = buildArticle(form({ risk: 'sensitive', verification: 'cleared', reviewedBy: 'Sam Shehab' }), { intent: 'publish' });
  assert.equal(publicationGates(ok.data).ok, true);
  assert.deepEqual(articleErrors(ok.markdown, 's.md'), []);
  assert.deepEqual(manualPublicationErrors({ origin: undefined, status: 'published' }, 'legacy.md'), [], 'legacy launch articles are untouched');
});

test('the dashboard never records review or verification on its own', () => {
  const { data } = buildArticle(form({ editorialReview: '', verification: '', reviewedBy: '', risk: 'sensitive' }), { intent: 'publish' });
  assert.equal(data.editorialReview, undefined);
  assert.equal(data.verification, undefined);
  assert.equal(data.reviewedBy, '');
});

// ---- GitHub scope ---------------------------------------------------------------------------------------
test('branch naming and repository path restrictions', () => {
  const b = branchFor('ceasefire-talks', new Date('2026-09-30T10:15:07Z'));
  assert.equal(b, 'manual/ceasefire-talks-20260930101507');
  for (const bad of ['main', 'incoming/x-1a2b3c4d', 'manual/../main', 'manual/x', 'feature/x-20260930101507', 'manual/X-20260930101507']) assert.throws(() => assertBranch(bad), GitHubError, bad);
  assert.doesNotThrow(() => assertWorkBranch('incoming/some-story-1a2b3c4d'));
  assert.throws(() => assertWorkBranch('incoming/../main'));
  assert.throws(() => articlePath('../../.github/workflows/x'));
  assert.throws(() => uploadPath('ok', 'svg'));
  assert.throws(() => assertWritablePaths(['.github/workflows/build.yml'], 'ok'));
  assert.throws(() => assertWritablePaths(['src/content/articles/other.md'], 'ok'), 'another story');
  assert.throws(() => assertWritablePaths(['public/uploads/articles/other.jpg'], 'ok'));
  assert.throws(() => assertWritablePaths(['public/generated/ai/ok.svg'], 'ok'), 'no SVG writes');
  assert.doesNotThrow(() => assertWritablePaths(['src/content/articles/ok.md', 'public/uploads/articles/ok.webp'], 'ok'));
  assert.equal(storySlugFromFiles([{ filename: 'src/content/articles/a.md', status: 'added' }, { filename: 'public/generated/ai/a.svg', status: 'added' }]), 'a');
  assert.equal(storySlugFromFiles([{ filename: 'src/content/articles/a.md', status: 'added' }, { filename: 'package.json', status: 'modified' }]), null);
});

test('the real GitHub client only talks to the Nuvellum repository and never leaks GitHub errors', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push([init.method, url, init.headers.Authorization]); return new Response(JSON.stringify({ message: 'Bad credentials: token ghp_SECRETSECRETSECRET' }), { status: 401 }); };
  const gh = createGitHub({ token: 'tok', fetchImpl, log: { error() {} } });
  const err = await gh.readArticle('some-story').catch((e) => e);
  assert.ok(err instanceof GitHubError);
  assert.doesNotMatch(err.message, /ghp_|Bad credentials/);
  assert.match(seen[0][1], new RegExp(`^https://api\\.github\\.com/repos/${REPO}/contents/src/content/articles/some-story\\.md\\?ref=main$`));
  assert.throws(() => createGitHub({ token: '' }), /not set/);
  await assert.rejects(gh.commit({ branch: 'main', slug: 'x', files: [], message: 'm' }), /Invalid working branch/);
  await assert.rejects(gh.commit({ branch: 'manual/x-20260930101507', slug: 'x', files: [{ path: 'package.json', content: '{}' }], message: 'm' }), /Refusing to write/);
  await assert.rejects(gh.deleteBranch('incoming/x-1a2b3c4d'), /Invalid working branch/);
  await assert.rejects(gh.setLabel(1, 'merge-me', true), /Unknown review label/);
});

test('a stale commit writes nothing (real client against a GitHub that moved on)', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(init.method + ' ' + url.replace('https://api.github.com', ''));
    if (url.includes('/git/ref/heads/manual')) return new Response(JSON.stringify({ object: { sha: 'a'.repeat(40) } }), { status: 200 });
    if (url.includes('/contents/')) return new Response(JSON.stringify({ sha: 'c'.repeat(40), content: '' }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const gh = createGitHub({ token: 'tok', fetchImpl, log: { error() {} } });
  await assert.rejects(gh.commit({ branch: 'manual/x-20260930101507', slug: 'x', files: [{ path: 'src/content/articles/x.md', content: 'new' }], message: 'm', expectedArticleSha: 'b'.repeat(40) }), (e) => e.status === 409);
  assert.ok(calls.every((c) => c.startsWith('GET ')), 'no blob, tree, commit or ref write: ' + calls.join(', '));
});

test('editing an existing story is protected against overwriting a newer version', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const opened = await call(handle, auth, 'article', { params: { slug: 'existing-story' } });
  assert.equal(opened.status, 200);
  const expectedSha = opened.data.main.sha;
  gh.setMain('src/content/articles/existing-story.md', md({ title: 'Someone else changed it', dek: 'D', section: 'Business', type: 'News', author: 'A', date: '2026-09-01', readingTime: '1 min', status: 'published', tags: ['x'], origin: 'manual', risk: 'low', editorialReview: 'passed' }));
  const before = gh.writes;
  const r = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'existing-story', intent: 'review', expectedSha, form: form({ title: 'My edit of the story' }) } });
  assert.equal(r.status, 409);
  assert.equal(gh.writes, before, 'nothing written');
  const fresh = await call(handle, auth, 'article', { params: { slug: 'existing-story' } });
  const ok = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'existing-story', intent: 'review', expectedSha: fresh.data.main.sha, form: form({ title: 'My edit of the story' }), image: { mode: 'none' } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const d = parseArticle(gh.filesAt(ok.data.branch).get('src/content/articles/existing-story.md'), 'x.md').data;
  assert.equal(d.updated, '2026-09-30');
  assert.equal(d.date, '2026-09-30', 'the form date is kept');
  assert.ok(ok.data.pr.number, 'an edit goes through a pull request');
  assert.equal(gh.filesAt('main').get('src/content/articles/existing-story.md').includes('Someone else changed it'), true, 'main untouched');
});

test('a new story cannot take an existing slug or duplicate a title', async () => {
  const { handle } = makeHandler();
  const auth = await login(handle);
  const clash = await call(handle, auth, 'check', { method: 'POST', body: { slug: 'existing-story', intent: 'review', isNew: true, form: form() } });
  assert.ok(clash.data.errors.some((e) => /already used/.test(e)));
  const dupTitle = await call(handle, auth, 'check', { method: 'POST', body: { slug: 'fresh-slug', intent: 'review', isNew: true, form: form({ title: 'An existing published story' }) } });
  const draftClash = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'existing-story', intent: 'draft', isNew: true, expectedSha: null, form: form() } });
  assert.equal(draftClash.status, 422, 'a new draft cannot claim an existing slug');
  assert.ok(dupTitle.data.errors.some((e) => /duplicate title/.test(e)));
});

// ---- publication flow ----------------------------------------------------------------------------------
test('publish: draft -> PR -> checks -> merge only when green, with gates re-checked on the merged commit', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const draft = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'ceasefire-talks', intent: 'draft', expectedSha: null, form: form() } });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.pr, null, 'a draft opens no pull request');
  assert.match(draft.data.branch, /^manual\/ceasefire-talks-\d{14}$/);
  assert.equal(gh.filesAt('main').has('src/content/articles/ceasefire-talks.md'), false, 'nothing on main');

  const prep = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'ceasefire-talks', intent: 'publish', branch: draft.data.branch, expectedSha: draft.data.articleSha, form: form() } });
  assert.equal(prep.status, 200, JSON.stringify(prep.data));
  const pr = await gh.pull(prep.data.pr.number);
  let st = await call(handle, auth, 'status', { params: { branch: draft.data.branch } });
  assert.equal(st.data.state, 'PR created');
  assert.equal(st.data.canMerge, false);
  assert.equal((await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } })).status, 409, 'no merge before checks');

  gh.green(pr.head.sha, ['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard'], 'failure');
  st = await call(handle, auth, 'status', { params: { branch: draft.data.branch } });
  assert.equal(st.data.state, 'Checks failed');
  assert.equal((await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } })).status, 409, 'failed checks are never bypassed');

  gh.green(pr.head.sha);
  st = await call(handle, auth, 'status', { params: { branch: draft.data.branch } });
  assert.equal(st.data.state, 'Ready to publish');
  assert.equal((await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: 'f'.repeat(40) } })).status, 409, 'stale head');
  const merged = await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } });
  assert.equal(merged.status, 200, JSON.stringify(merged.data));
  assert.equal(merged.data.state, 'Published');
  assert.ok(gh.filesAt('main').has('src/content/articles/ceasefire-talks.md'));
  assert.deepEqual(gh.deleted, [draft.data.branch]);
});

test('a story with an uploaded image can be published (its image arrives in the same pull request)', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const image = { mode: 'upload', upload: { name: 'p.webp', type: 'image/webp', dataBase64: webp().toString('base64') }, alt: 'A photo', kind: 'photo', provider: 'manual', credit: 'Jane Doe' };
  const r = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'with-image', intent: 'publish', isNew: true, expectedSha: null, form: form({ title: 'A story with its own photo' }), image } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const pr = await gh.pull(r.data.pr.number);
  gh.green(pr.head.sha);
  const m = await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } });
  assert.equal(m.status, 200, JSON.stringify(m.data));
  assert.ok(gh.filesAt('main').has('public/uploads/articles/with-image.webp'));
});

test('publish is refused when the story fails gates even if checks are green', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const bad = await call(handle, auth, 'save', { method: 'POST', body: { slug: 'ungated', intent: 'publish', expectedSha: null, form: form({ editorialReview: 'uncertain' }) } });
  assert.equal(bad.status, 422, 'cannot even prepare publication');
  assert.ok(bad.data.errors.some((e) => /gate/i.test(e)));
  assert.equal(gh.writes, 0);
});

test('unpublish keeps the file and history, needs typed confirmation, and goes through checks', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const open = await call(handle, auth, 'article', { params: { slug: 'existing-story' } });
  assert.equal((await call(handle, auth, 'save', { method: 'POST', body: { intent: 'unpublish', slug: 'existing-story', confirm: 'yes', expectedSha: open.data.main.sha } })).status, 400);
  const r = await call(handle, auth, 'save', { method: 'POST', body: { intent: 'unpublish', slug: 'existing-story', confirm: 'existing-story', expectedSha: open.data.main.sha } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const text = gh.filesAt(r.data.branch).get('src/content/articles/existing-story.md');
  assert.match(text, /^status: "draft"$/m);
  assert.match(text, /^updated: "2026-09-30"$/m);
  assert.match(text, /An existing published story/, 'content kept');
  const pr = await gh.pull(r.data.pr.number);
  gh.green(pr.head.sha);
  const st = await call(handle, auth, 'status', { params: { branch: r.data.branch } });
  assert.equal(st.data.state, 'Ready to unpublish');
  const m = await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } });
  assert.equal(m.data.state, 'Unpublished');
  assert.ok(gh.filesAt('main').has('src/content/articles/existing-story.md'), 'never deleted');
});

// ---- newsroom review queue ------------------------------------------------------------------------------
const newsroomFm = (over = {}) => ({ title: 'Egypt says ceasefire talks will resume', dek: 'Cairo said negotiators would travel.', section: 'World', type: 'News', author: 'Nuvellum Global Desk',
  date: '2026-09-30', publishedAt: '2026-09-30T08:00:00Z', readingTime: '1 min', status: 'review', tags: ['Egypt'], regions: ['middle-east-north-africa'], countries: ['Egypt'],
  sourceUrls: ['https://www.bbc.co.uk/news/articles/abc'], sourceNote: 'Prepared from BBC reporting.', origin: 'automation', risk: 'sensitive', editorialReview: 'uncertain', verification: 'uncertain', reviewedBy: '', ...over });

test('review queue: newsroom and manual PRs sorted into the five columns', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const pending = gh.addNewsroomPull('egypt-talks', newsroomFm());
  const ready = gh.addNewsroomPull('ready-story', newsroomFm({ title: 'A cleared newsroom story', status: 'published', risk: 'low', editorialReview: 'passed', verification: undefined, sourceUrls: ['https://example.org/other'] }));
  gh.green(ready.head.sha);
  const running = gh.addNewsroomPull('running-story', newsroomFm({ title: 'A newsroom story in checks', status: 'published', risk: 'low', editorialReview: 'passed', verification: undefined, sourceUrls: ['https://example.org/third'] }));
  const held = gh.addNewsroomPull('held-story', newsroomFm({ title: 'A held newsroom story', sourceUrls: ['https://example.org/fourth'] }), { labels: ['hold'] });
  const q = await call(handle, auth, 'queue');
  assert.equal(q.status, 200);
  const col = (name) => q.data.columns[name].map((i) => i.pr.number);
  assert.deepEqual(col('Pending Review'), [pending.number]);
  assert.deepEqual(col('Ready to Publish'), [ready.number]);
  assert.deepEqual(col('Checks Running'), [running.number]);
  assert.deepEqual(col('Held / Rejected'), [held.number]);
  const card = q.data.columns['Pending Review'][0];
  assert.equal(card.origin, 'automation');
  assert.deepEqual(card.sourceUrls, ['https://www.bbc.co.uk/news/articles/abc']);
  assert.ok(card.pr.newsroom);
  assert.ok(card.checks.some((c) => c.name === 'Acquire editorial visual'), 'newsroom PRs also wait for the image pass');
});

test('newsroom story: edit, approve, clear verification with a named reviewer, then publish after checks', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const pr = gh.addNewsroomPull('egypt-talks', newsroomFm());
  const opened = await call(handle, auth, 'article', { params: { pr: String(pr.number) } });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.slug, 'egypt-talks');
  assert.equal(opened.data.work.data.origin, 'automation');
  const f = { ...form(), ...newsroomFm(), body: BODY, tags: ['Egypt'], countries: ['Egypt'], regions: ['middle-east-north-africa'], title: 'Egypt says ceasefire talks will resume on Thursday',
    editorialReview: 'passed', verification: 'cleared', reviewedBy: 'Sam Shehab' };
  const saved = await call(handle, auth, 'save', { method: 'POST', body: { intent: 'publish', branch: pr.head.ref, slug: 'renamed-by-mistake', expectedSha: opened.data.work.sha, form: f } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.slug, 'egypt-talks', 'the newsroom slug cannot be changed');
  assert.match(gh.lastMessage, /^editor: publish egypt-talks$/, 'marked so the image pass keeps the editor\'s visual decision');
  const d = parseArticle(gh.filesAt(pr.head.ref).get('src/content/articles/egypt-talks.md'), 'x.md').data;
  assert.equal(d.origin, 'automation');
  assert.equal(d.status, 'published');
  assert.equal(d.verification, 'cleared');
  assert.equal(d.reviewedBy, 'Sam Shehab');
  assert.deepEqual(articleErrors(gh.filesAt(pr.head.ref).get('src/content/articles/egypt-talks.md'), 'egypt-talks.md'), []);
  gh.green(pr.head.sha, ['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard']);
  let st = await call(handle, auth, 'status', { params: { branch: pr.head.ref } });
  assert.notEqual(st.data.state, 'Ready to publish', 'the image pass is still required for newsroom PRs');
  gh.green(pr.head.sha);
  st = await call(handle, auth, 'status', { params: { branch: pr.head.ref } });
  assert.equal(st.data.state, 'Ready to publish');
  const m = await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } });
  assert.equal(m.data.state, 'Published');
  assert.deepEqual(gh.deleted, [], 'newsroom branches are left to the repository cleanup');
});

test('newsroom sensitive story without cleared verification cannot be published, even with green checks', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const pr = gh.addNewsroomPull('egypt-talks', newsroomFm({ status: 'published', editorialReview: 'passed', verification: 'uncertain' }));
  gh.green(pr.head.sha);
  const st = await call(handle, auth, 'status', { params: { branch: pr.head.ref } });
  assert.equal(st.data.canMerge, false);
  assert.equal((await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: pr.head.sha } })).status >= 400, true);
  assert.deepEqual(gh.merged, []);
});

test('hold, release, send back and reject are recorded on the PR; notes required where it matters', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const pr = gh.addNewsroomPull('egypt-talks', newsroomFm());
  assert.equal((await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'hold' } })).status, 200);
  assert.ok(pr.labels.some((l) => l.name === 'hold'));
  let st = await call(handle, auth, 'status', { params: { branch: pr.head.ref } });
  assert.equal(st.data.state, 'On hold');
  assert.equal(st.data.bucket, 'Held / Rejected');
  await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'release' } });
  assert.ok(!pr.labels.some((l) => l.name === 'hold'));
  assert.equal((await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'sendback' } })).status, 400, 'send back needs a note');
  await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'sendback', note: 'Attribute the ministry quote.' } });
  assert.ok(pr.labels.some((l) => l.name === 'needs-human'));
  assert.ok(gh.comments.some(([n, t]) => n === pr.number && /Attribute the ministry quote/.test(t)));
  assert.equal((await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'reject', note: 'Duplicate of an earlier story.' } })).status, 200);
  assert.equal(pr.state, 'closed');
  assert.ok(pr.labels.some((l) => l.name === 'rejected'));
  assert.equal((await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'hold' } })).status, 409, 'closed PRs are final');
  assert.equal((await call(handle, auth, 'review', { method: 'POST', body: { number: pr.number, action: 'merge' } })).status, 400);
});

test('a PR that touches files outside its story is never merged by the dashboard', async () => {
  const { handle, gh } = makeHandler();
  const auth = await login(handle);
  const pr = gh.addNewsroomPull('egypt-talks', newsroomFm({ status: 'published', risk: 'low', editorialReview: 'passed', verification: undefined }));
  const files = new Map(gh.filesAt(pr.head.sha)); files.set('.github/workflows/build.yml', 'evil');
  const s = gh.store(files); gh.refs.set(pr.head.ref, s); pr.head.sha = s; gh.green(s);
  const m = await call(handle, auth, 'merge', { method: 'POST', body: { number: pr.number, sha: s } });
  assert.equal(m.status, 409);
  assert.deepEqual(gh.merged, []);
});

test('publication state and queue buckets', () => {
  const pr = { state: 'open', labels: [], head: { sha: 'a' } };
  const runs = (c) => ['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard'].map((name) => ({ name, status: 'completed', conclusion: c, created_at: 'x' }));
  assert.equal(publicationState({ pr: null, branchExists: true }).state, 'Draft');
  assert.equal(publicationState({ pr, runs: [] }).state, 'PR created');
  assert.equal(publicationState({ pr, runs: runs('failure'), fileStatus: 'published', gatesOk: true }).state, 'Checks failed');
  assert.equal(publicationState({ pr, runs: runs('success'), fileStatus: 'published', gatesOk: true }).canMerge, true);
  assert.equal(publicationState({ pr, runs: runs('success'), fileStatus: 'published', gatesOk: false }).canMerge, false);
  assert.equal(publicationState({ pr: { ...pr, labels: [{ name: 'hold' }] }, runs: runs('success'), fileStatus: 'published', gatesOk: true }).canMerge, false);
  assert.equal(queueBucket({ state: 'Merged', pr: { merged_at: 'x' } }), 'Published');
  assert.equal(queueBucket({ state: 'Rejected', pr: { state: 'closed' } }), 'Held / Rejected');
});

test('/admin is served as a static shell with no credentials and is not linked publicly', () => {
  const page = readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  assert.match(page, /<meta name="robots" content="noindex, nofollow/);
  assert.doesNotMatch(page, /NUVELLUM_GITHUB_TOKEN|NUVELLUM_ADMIN_PASSWORD|api\.github\.com/);
  assert.doesNotMatch(page, /innerHTML/, 'untrusted data is inserted as text');
  assert.match(page, /sandbox="allow-same-origin"/, 'the preview iframe runs no scripts');
  for (const f of ['src/components/SiteHeader.astro', 'src/components/SiteFooter.astro', 'src/components/InteriorShell.astro']) {
    try { assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /href="\/admin/); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const robots = readFileSync(new URL('../src/pages/robots.txt.ts', import.meta.url), 'utf8');
  assert.match(robots, /Disallow: \/admin/);
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(vercel.git.deploymentEnabled['manual/**'], false);
  assert.ok(vercel.headers.some((h) => h.source === '/api/admin' && h.headers.some((x) => x.key === 'X-Robots-Tag')));
});

test('the image pass leaves editor-reviewed newsroom commits alone', () => {
  const wf = readFileSync(new URL('../.github/workflows/visual-acquire.yml', import.meta.url), 'utf8');
  assert.match(wf, /git log -1 --format=%s \| grep -q '\^editor: '/);
});
