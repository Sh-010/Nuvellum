import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBriefHandler } from '../scripts/lib/brief/handler.mjs';
import { createBrief, normalizeEmail, isValidEmail, subscriberId, unsubscribeToken, unsubscribeLink, LIMITS } from '../scripts/lib/brief/brief.mjs';
import { createMemoryStore, createUpstash, redisConfig } from '../scripts/lib/brief/store.mjs';
import { createResendSync, resendConfig } from '../scripts/lib/brief/resend.mjs';
import { createAdminHandler } from '../scripts/lib/admin/handler.mjs';
import { ENV, ORIGIN, req, login, call, FakeGitHub } from './admin-fixtures.mjs';

const SECRET = 'b'.repeat(48);
const BRIEF_ENV = { NUVELLUM_BRIEF_SECRET: SECRET, KV_REST_API_URL: 'https://example-brief.upstash.io', KV_REST_API_TOKEN: 't'.repeat(40), SITE_URL: 'https://www.nuvellum.news' };

function setup({ env = BRIEF_ENV, t = Date.parse('2026-09-30T09:00:00Z'), resendFactory } = {}) {
  const clock = { t };
  const store = createMemoryStore({ now: () => clock.t });
  const handle = createBriefHandler({ env, storeFactory: () => store, resendFactory, now: () => clock.t, log: {} });
  const post = (action, body, { origin = ORIGIN, ip = '203.0.113.7', contentType = 'application/json', query = '' } = {}) => handle(new Request(`${ORIGIN}/api/brief?action=${action}${query}`, {
    method: 'POST', headers: { ...(origin ? { origin } : {}), ...(contentType ? { 'content-type': contentType } : {}), 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body)
  }));
  const signup = (email, extra = {}, opts) => post('subscribe', { email, consent: true, website: '', elapsedMs: 9000, source: 'home', ...extra }, opts);
  const brief = createBrief({ store, secret: SECRET, now: () => clock.t });
  return { clock, store, post, signup, brief };
}
const json = async (res) => ({ status: res.status, data: await res.json() });

test('addresses: normalised for duplicates, validated strictly', () => {
  assert.equal(normalizeEmail('  Reader.Name+Brief@Example.COM '), 'reader.name+brief@example.com');
  assert.equal(normalizeEmail('lecteur@bücher.example'), 'lecteur@xn--bcher-kva.example');
  for (const ok of ['a@b.co', 'reader.name+brief@example.com', "o'neil@example.org", 'x@sub.domain.example.uk', 'lecteur@xn--bcher-kva.example']) assert.ok(isValidEmail(ok), ok);
  for (const bad of ['', 'plain', '@example.com', 'a@', 'a@b', 'a@b.c', 'a..b@example.com', '.a@example.com', 'a@-example.com', 'a@example..com', 'a b@example.com', '"q"@example.com', 'a@[127.0.0.1]', `${'x'.repeat(65)}@example.com`, `a@${'d'.repeat(250)}.com`]) {
    assert.equal(isValidEmail(normalizeEmail(bad)), false, bad);
  }
});

test('valid sign-up is stored once, with explicit consent recorded', async () => {
  const { signup, brief } = setup();
  const r = await json(await signup('Reader@Example.com'));
  assert.equal(r.status, 200); assert.equal(r.data.ok, true);
  const { stats, rows } = await brief.list();
  assert.deepEqual(stats, { active: 1, unsubscribed: 0, total: 1 });
  assert.equal(rows[0].email, 'reader@example.com');
  const rec = (await brief.all())[0];
  assert.equal(rec.consentVersion, 'brief-consent-v1'); assert.ok(rec.consentAt); assert.equal(rec.source, 'home');
});

test('malformed email, missing consent, honeypot and instant bot submissions are refused and store nothing', async () => {
  const { signup, brief } = setup();
  assert.equal((await json(await signup('not-an-email'))).status, 422);
  assert.equal((await json(await signup('a@b.c'))).status, 422);
  assert.equal((await json(await signup('reader@example.com', { consent: false }))).status, 422);
  assert.equal((await json(await signup('reader@example.com', { consent: 'yes' }))).status, 422, 'consent must be an explicit true');
  assert.equal((await json(await signup('reader@example.com', { website: 'http://spam.example' }))).status, 400, 'honeypot');
  assert.equal((await json(await signup('reader@example.com', { elapsedMs: 300 }))).status, 400, 'filled faster than a person can');
  assert.equal((await brief.list()).stats.total, 0);
});

test('duplicate sign-up creates no second record and gives the same answer (no membership leak)', async () => {
  const { signup, brief, clock } = setup();
  const first = await json(await signup('reader@example.com'));
  clock.t += 60_000;
  const again = await json(await signup('  READER@example.com  ', {}, { ip: '198.51.100.9' }));
  assert.deepEqual(again, first, 'identical response for new and existing subscribers');
  assert.equal((await brief.list()).stats.total, 1);
});

test('unsubscribe with the signed link, repeat it, then resubscribe', async () => {
  const { signup, post, brief, clock } = setup();
  await signup('reader@example.com');
  const id = subscriberId(SECRET, 'reader@example.com'), t = unsubscribeToken(SECRET, id);
  const u1 = await json(await post('unsubscribe', { s: id, t }));
  assert.equal(u1.status, 200);
  assert.equal((await brief.list()).stats.unsubscribed, 1);
  const u2 = await json(await post('unsubscribe', { s: id, t }));
  assert.deepEqual(u2, u1, 'repeating it is harmless and answers the same');
  clock.t += 3_600_000;
  assert.equal((await json(await signup('reader@example.com', {}, { ip: '192.0.2.44' }))).status, 200);
  const { stats } = await brief.list();
  assert.deepEqual(stats, { active: 1, unsubscribed: 0, total: 1 }, 'resubscribing reactivates the same record');
  const rec = (await brief.all())[0];
  assert.ok(rec.resubscribedAt); assert.equal(rec.unsubscribedAt, null);
});

test('unsubscribe links carry no address or raw id, and cannot be forged or reused for someone else', async () => {
  const { signup, post, brief } = setup();
  await signup('reader@example.com'); await signup('other@example.com', {}, { ip: '198.51.100.2' });
  const id = subscriberId(SECRET, 'reader@example.com');
  const link = unsubscribeLink('https://www.nuvellum.news', SECRET, id);
  assert.doesNotMatch(link, /reader|example\.com|%40|@/i);
  assert.match(link, /^https:\/\/www\.nuvellum\.news\/brief\/unsubscribe\?s=[A-Za-z0-9_-]{32}&t=[A-Za-z0-9_-]{43}$/);
  const otherId = subscriberId(SECRET, 'other@example.com');
  for (const [s, t] of [[id, 'x'.repeat(43)], [otherId, unsubscribeToken(SECRET, id)], [id, unsubscribeToken('z'.repeat(48), id)], ['../../etc', 'a'], [null, null]]) {
    assert.equal((await post('unsubscribe', { s, t })).status, 403, `${s} / ${t}`);
  }
  assert.equal((await brief.list()).stats.active, 2, 'nobody was unsubscribed');
});

test('email clients can unsubscribe in one click (RFC 8058), without a browser origin', async () => {
  const { signup, post, brief } = setup();
  await signup('reader@example.com');
  const id = subscriberId(SECRET, 'reader@example.com'), t = unsubscribeToken(SECRET, id);
  const r = await post('unsubscribe', 'List-Unsubscribe=One-Click', { origin: null, contentType: 'application/x-www-form-urlencoded', query: `&s=${id}&t=${t}` });
  assert.equal(r.status, 200);
  assert.equal((await brief.list()).stats.unsubscribed, 1);
  assert.equal((await post('unsubscribe', 'anything', { origin: null, contentType: 'text/plain', query: `&s=${id}&t=${t}` })).status, 400);
});

test('rate limits: per client and overall', async () => {
  const { signup, brief, clock } = setup();
  for (let i = 0; i < LIMITS.perClient; i++) assert.equal((await signup(`reader${i}@example.com`)).status, 200);
  assert.equal((await signup('one-more@example.com')).status, 429, 'sixth sign-up from one client in ten minutes');
  assert.equal((await signup('elsewhere@example.com', {}, { ip: '198.51.100.20' })).status, 200, 'another client is unaffected');
  clock.t += LIMITS.perClientWindowS * 1000;
  assert.equal((await signup('later@example.com')).status, 200, 'the window resets');
  assert.equal((await brief.list()).stats.total, LIMITS.perClient + 2);
  const g = setup();
  let blocked = 0;
  for (let i = 0; i < LIMITS.global + 5; i++) if ((await g.signup(`r${i}@example.com`, {}, { ip: `10.0.${i >> 8}.${i & 255}` })).status === 429) blocked++;
  assert.equal(blocked, 5, 'the overall hourly ceiling holds even across many clients');
});

test('the public endpoint refuses cross-site sign-ups and exposes nothing', async () => {
  const { post, signup } = setup();
  assert.equal((await signup('reader@example.com', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await signup('reader@example.com', {}, { origin: null })).status, 403);
  assert.equal((await post('subscribe', 'email=a@b.co', { contentType: 'application/x-www-form-urlencoded' })).status, 415);
  const handle = createBriefHandler({ env: BRIEF_ENV, storeFactory: () => createMemoryStore(), log: {} });
  for (const [method, action] of [['GET', 'subscribe'], ['GET', 'list'], ['POST', 'list'], ['POST', 'export'], ['GET', '']]) {
    const res = await handle(new Request(`${ORIGIN}/api/brief?action=${action}`, { method, headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined }));
    assert.equal(res.status, 404, `${method} ${action}`);
  }
});

test('until the store and secret are configured, nothing is stored and the reader is told plainly', async () => {
  for (const env of [{}, { NUVELLUM_BRIEF_SECRET: SECRET }, { ...BRIEF_ENV, NUVELLUM_BRIEF_SECRET: 'short' }, { ...BRIEF_ENV, KV_REST_API_URL: 'http://insecure.example' }]) {
    const handle = createBriefHandler({ env, storeFactory: () => { throw new Error('must not connect'); }, log: {} });
    const res = await handle(new Request(`${ORIGIN}/api/brief?action=subscribe`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', consent: true }) }));
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /not open for sign-ups yet/);
  }
  assert.deepEqual(redisConfig({ UPSTASH_REDIS_REST_URL: 'https://x.upstash.io/', UPSTASH_REDIS_REST_TOKEN: 'k'.repeat(30) }), { ok: true, url: 'https://x.upstash.io', token: 'k'.repeat(30) });
});

test('the admin Brief view: login required, list, search, manual unsubscribe, CSV export', async () => {
  const { signup, store } = setup();
  await signup('alpha@example.com'); await signup('beta@example.org', {}, { ip: '198.51.100.3' }); await signup('=cmd@example.com', {}, { ip: '198.51.100.4' });
  const handle = createAdminHandler({ env: { ...ENV, ...BRIEF_ENV }, githubFactory: () => new FakeGitHub(), briefStoreFactory: () => store, log: { error() {} }, delay: async () => {} });
  // Unauthorised: no session, and no CSRF token for the write.
  for (const action of ['brief', 'brief-export']) assert.equal((await handle(req(action))).status, 401, action);
  assert.equal((await handle(req('brief-unsubscribe', { method: 'POST', body: { id: 'x'.repeat(32) } }))).status, 401);
  const auth = await login(handle);
  assert.equal((await handle(req('brief-unsubscribe', { method: 'POST', cookie: auth.cookie, body: { id: 'x'.repeat(32) } }))).status, 403, 'CSRF token required');

  const list = await call(handle, auth, 'brief');
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.stats, { active: 3, unsubscribed: 0, total: 3 });
  assert.equal((await call(handle, auth, 'brief', { params: { q: 'beta' } })).data.rows.length, 1);
  const betaId = list.data.rows.find((r) => r.email === 'beta@example.org').id;
  const un = await call(handle, auth, 'brief-unsubscribe', { method: 'POST', body: { id: betaId } });
  assert.equal(un.status, 200); assert.equal(un.data.outcome, 'unsubscribed');
  assert.equal((await call(handle, auth, 'brief', { params: { status: 'unsubscribed' } })).data.rows[0].email, 'beta@example.org');
  assert.equal((await call(handle, auth, 'brief-unsubscribe', { method: 'POST', body: { id: '../../x' } })).status, 400);

  const csvRes = await handle(req('brief-export', { cookie: auth.cookie }));
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  assert.match(csvRes.headers.get('content-disposition'), /attachment; filename="nuvellum-brief-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(csvRes.headers.get('cache-control'), 'no-store, max-age=0');
  const csv = await csvRes.text();
  assert.match(csv, /^email,status,subscribed_at,consent_at,consent_version,source,unsubscribe_url\r\n/);
  assert.match(csv, /alpha@example\.com,active,/);
  assert.doesNotMatch(csv, /beta@example\.org/, 'the export lists active subscribers only');
  assert.match(csv, /"'=cmd@example\.com"/, 'spreadsheet formula injection is neutralised');
  assert.match(csv, /https:\/\/www\.nuvellum\.news\/brief\/unsubscribe\?s=/);
});

test('the Upstash client sends authenticated REST calls to the configured database only', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) }); return new Response(JSON.stringify(url.endsWith('/pipeline') ? [{ result: 1 }, { result: 'OK' }] : { result: 'v' })); };
  const r = createUpstash({ url: 'https://db.upstash.io', token: 'secret-token', fetchImpl });
  assert.equal(await r.run(['GET', 'k']), 'v');
  assert.deepEqual(await r.pipeline([['INCR', 'a'], ['SET', 'b', '1']]), [1, 'OK']);
  assert.deepEqual(calls.map((c) => c.url), ['https://db.upstash.io', 'https://db.upstash.io/pipeline']);
  assert.ok(calls.every((c) => c.auth === 'Bearer secret-token'));
  const bad = createUpstash({ url: 'https://db.upstash.io', token: 'x', fetchImpl: async () => new Response('{"error":"WRONGPASS"}', { status: 401 }) });
  await assert.rejects(bad.run(['GET', 'k']), (e) => !/WRONGPASS|secret/.test(e.message), 'store errors never echo credentials or raw responses');
});

test('nothing about subscribers is ever written to the repository or the public site', () => {
  const vercel = readFileSync('vercel.json', 'utf8');
  assert.doesNotMatch(readFileSync('.gitignore', 'utf8') + vercel, /brief.*\.json/i);
  const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
  assert.doesNotMatch(home, /localStorage[^;]*(signup|brief|email)/i, 'the form never keeps addresses in the browser');
  assert.match(home, /fetch\('\/api\/brief\?action=subscribe'/, 'the homepage form posts to the Brief endpoint');
});

test('Subscribe opens the in-page Brief invitation instead of jumping the reader down the page', () => {
  const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
  const shell = readFileSync('src/components/InteriorShell.astro', 'utf8');
  const css = readFileSync('src/styles/interior.css', 'utf8');
  for (const source of [home, shell]) {
    assert.match(source, /data-brief-open/, 'the masthead exposes an in-page Brief opener');
    assert.match(source, /id="briefInvitation"/, 'the invitation dialog is present');
    assert.doesNotMatch(source, /<a class="subscribe" href="#newsletter">/, 'Subscribe is not a fragment-navigation link');
  }
  assert.match(home, /wireBriefForm\(briefModalForm,'header'\)/, 'modal sign-ups are attributed separately');
  assert.match(shell, /source:'header'/, 'interior modal sign-ups use the Brief endpoint');
  assert.match(css, /brief-invite-card/, 'interior pages carry the invitation styling');
});

test('the admin Brief view says plainly when the store is not connected', async () => {
  const handle = createAdminHandler({ env: ENV, githubFactory: () => new FakeGitHub(), briefStoreFactory: () => { throw new Error('must not connect'); }, log: { error() {} }, delay: async () => {} });
  const auth = await login(handle);
  assert.deepEqual((await call(handle, auth, 'brief')).data, { configured: false });
  assert.equal((await handle(req('brief-export', { cookie: auth.cookie }))).status, 409);
  assert.equal((await call(handle, auth, 'brief-unsubscribe', { method: 'POST', body: { id: 'x'.repeat(32) } })).status, 409);
});


const RESEND_ENV = {
  ...BRIEF_ENV,
  RESEND_API_KEY: 're_' + 'x'.repeat(32),
  RESEND_BRIEF_SEGMENT_ID: 'f6b07c32-c7e8-4008-a971-86bd197e88da',
  RESEND_BRIEF_TOPIC_ID: '114a9a70-ee92-485e-a94f-9ba2cd4bb24d'
};

test('Resend config requires the API key, Brief segment and Brief topic together', () => {
  assert.equal(resendConfig({}).ok, false);
  assert.equal(resendConfig({ ...RESEND_ENV, RESEND_API_KEY: '' }).ok, false);
  assert.equal(resendConfig({ ...RESEND_ENV, RESEND_BRIEF_SEGMENT_ID: 'not-a-uuid' }).ok, false);
  assert.equal(resendConfig(RESEND_ENV).ok, true);
});

test('Resend sync creates a new Brief contact with segment, topic and Nuvellum consent metadata', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body });
    if (init.method === 'PATCH' && /\/contacts\/reader%40example\.com$/.test(url)) return new Response('{}', { status: 404 });
    if (init.method === 'POST' && url.endsWith('/contacts')) return new Response('{}', { status: 201 });
    return new Response('{}', { status: 500 });
  };
  const sync = createResendSync({ ...resendConfig(RESEND_ENV), fetchImpl });
  await sync.subscribe({
    email: 'reader@example.com',
    id: 'opaque-id',
    source: 'header',
    consentAt: '2026-09-30T09:00:00.000Z',
    unsubscribeUrl: 'https://www.nuvellum.news/brief/unsubscribe?s=a&t=b'
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((x) => x.auth === `Bearer ${RESEND_ENV.RESEND_API_KEY}`));
  const create = calls[1].body;
  assert.equal(create.email, 'reader@example.com');
  assert.equal(create.unsubscribed, false);
  assert.deepEqual(create.segments, [{ id: RESEND_ENV.RESEND_BRIEF_SEGMENT_ID }]);
  assert.deepEqual(create.topics, [{ id: RESEND_ENV.RESEND_BRIEF_TOPIC_ID, subscription: 'opt_in' }]);
  assert.deepEqual(create.properties, {
    nuvellum_subscriber_id: 'opaque-id',
    nuvellum_unsubscribe_url: 'https://www.nuvellum.news/brief/unsubscribe?s=a&t=b',
    nuvellum_source: 'header',
    nuvellum_consent_at: '2026-09-30T09:00:00.000Z'
  });
});

test('Resend sync reactivates an existing contact and restores its Brief membership/topic', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === 'PATCH' && /\/contacts\/reader%40example\.com$/.test(url)) return new Response('{}', { status: 200 });
    if (init.method === 'POST' && url.includes('/segments/')) return new Response('{}', { status: 409 });
    if (init.method === 'PATCH' && url.endsWith('/topics')) return new Response('{}', { status: 200 });
    return new Response('{}', { status: 500 });
  };
  const sync = createResendSync({ ...resendConfig(RESEND_ENV), fetchImpl });
  await sync.subscribe({ email: 'reader@example.com', id: 'id', source: 'home', consentAt: 'at', unsubscribeUrl: 'url' });
  assert.deepEqual(calls.map((x) => [x.method, new URL(x.url).pathname]), [
    ['PATCH', '/contacts/reader%40example.com'],
    ['POST', `/contacts/reader%40example.com/segments/${RESEND_ENV.RESEND_BRIEF_SEGMENT_ID}`],
    ['PATCH', '/contacts/reader%40example.com/topics']
  ]);
  assert.deepEqual(calls[2].body, [{ id: RESEND_ENV.RESEND_BRIEF_TOPIC_ID, subscription: 'opt_in' }]);
});

test('Resend sync marks a site-unsubscribed contact and Brief topic opted out', async () => {
  const calls = [];
  const sync = createResendSync({
    ...resendConfig(RESEND_ENV),
    fetchImpl: async (url, init) => { calls.push({ url, method: init.method, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); }
  });
  await sync.unsubscribe({ email: 'reader@example.com' });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, { unsubscribed: true });
  assert.deepEqual(calls[1].body, [{ id: RESEND_ENV.RESEND_BRIEF_TOPIC_ID, subscription: 'opt_out' }]);
});

test('public Brief handler mirrors subscribe and unsubscribe to Resend without exposing provider state', async () => {
  const events = [];
  const resendFactory = () => ({
    subscribe: async (v) => events.push(['subscribe', v]),
    unsubscribe: async (v) => events.push(['unsubscribe', v])
  });
  const { signup, post, brief } = setup({ env: RESEND_ENV, resendFactory });
  const first = await json(await signup('Reader@Example.com', { source: 'header' }));
  assert.deepEqual(first, { status: 200, data: { ok: true, message: 'Thank you. You are on the list for the Nuvellum Brief.' } });
  assert.equal(events[0][0], 'subscribe');
  assert.equal(events[0][1].email, 'reader@example.com');
  assert.equal(events[0][1].source, 'header');
  assert.match(events[0][1].unsubscribeUrl, /^https:\/\/www\.nuvellum\.news\/brief\/unsubscribe\?s=/);
  const rec = (await brief.all())[0];
  const r = await json(await post('unsubscribe', { s: rec.id, t: unsubscribeToken(SECRET, rec.id) }));
  assert.equal(r.status, 200);
  assert.deepEqual(events[1], ['unsubscribe', { email: 'reader@example.com' }]);
  assert.deepEqual(Object.keys(first.data).sort(), ['message', 'ok']);
});

test('admin unsubscribe mirrors the reader to Resend without returning their address', async () => {
  const store = createMemoryStore();
  const brief = createBrief({ store, secret: SECRET, now: () => Date.parse('2026-09-30T09:00:00Z') });
  const added = await brief.subscribe({ email: 'reader@example.com', consent: true, elapsedMs: 9000, ip: '203.0.113.5' });
  const events = [];
  const handle = createAdminHandler({
    env: { ...ENV, ...RESEND_ENV },
    githubFactory: () => new FakeGitHub(),
    briefStoreFactory: () => store,
    resendFactory: () => ({ unsubscribe: async (v) => events.push(v) }),
    log: { error() {} },
    delay: async () => {}
  });
  const auth = await login(handle);
  const out = await call(handle, auth, 'brief-unsubscribe', { method: 'POST', body: { id: added.id } });
  assert.equal(out.status, 200);
  assert.deepEqual(out.data, { ok: true, outcome: 'unsubscribed' });
  assert.deepEqual(events, [{ email: 'reader@example.com' }]);
});

test('a Resend outage never rolls back a valid consent record or leaks provider detail to the reader', async () => {
  const logs = [];
  const { signup, brief } = setup({
    env: RESEND_ENV,
    resendFactory: () => ({ subscribe: async () => { throw new Error('provider secret detail'); }, unsubscribe: async () => {} })
  });
  const handle = createBriefHandler({
    env: RESEND_ENV,
    storeFactory: () => createMemoryStore(),
    resendFactory: () => ({ subscribe: async () => { throw new Error('provider secret detail'); }, unsubscribe: async () => {} }),
    log: { error: (m) => logs.push(m), info() {} }
  });
  // The setup handler proves the record is committed even if its provider mirror fails.
  assert.equal((await signup('reader@example.com')).status, 200);
  assert.equal((await brief.list()).stats.active, 1);
  // A separate handler proves the public response stays generic and logs no provider response/secret.
  const res = await handle(new Request(`${ORIGIN}/api/brief?action=subscribe`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
    body: JSON.stringify({ email: 'other@example.com', consent: true, website: '', elapsedMs: 9000, source: 'home' })
  }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.ok(logs.some((m) => /Resend sync failed/.test(m)));
  assert.ok(logs.every((m) => !/provider secret detail|re_/.test(m)));
});
