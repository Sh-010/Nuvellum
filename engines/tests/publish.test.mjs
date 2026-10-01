import test from 'node:test';
import assert from 'node:assert/strict';
import { telegram, facebook, linkedin, x, telegramMessage, oauth1Header, PostError } from '../publish/adapters.mjs';
import { planStory, outcome, record, MAX_ATTEMPTS } from '../publish/plan.mjs';
import { chooseScheduledCandidate } from '../publish/run.mjs';

const SITE = 'https://www.nuvellum.news';
const story = (over = {}) => ({ slug: 'a-story', url: SITE + '/article/a-story', title: 'Council <approves> "new" budget & plan', dek: 'The vote was 7–2 after a long debate.', section: 'World', risk: 'low', tags: [], image: '/uploads/articles/a-story.jpg', ...over });
const TG = { TELEGRAM_BOT_TOKEN: '123456:ABCDEFsecretTOKENvalue', TELEGRAM_CHAT_ID: '@nuvellum' };
const fakeFetch = (reply, calls = []) => async (url, init = {}) => { calls.push({ url, init }); return typeof reply === 'function' ? reply(url, init) : new Response(JSON.stringify(reply.body), { status: reply.status || 200, headers: reply.headers || {} }); };

test('Telegram: headline, dek, image and tracked link; HTML-safe; photo only for real raster images', () => {
  const m = telegramMessage(story(), SITE);
  assert.equal(m.method, 'sendPhoto');
  assert.equal(m.photo, SITE + '/uploads/articles/a-story.jpg');
  assert.match(m.caption, /^<b>Council &lt;approves&gt; &quot;new&quot; budget &amp; plan<\/b>\n\nThe vote was 7–2/);
  assert.match(m.caption, /<a href="https:\/\/www\.nuvellum\.news\/article\/a-story\?utm_source=telegram&amp;utm_medium=social&amp;utm_campaign=article&amp;utm_content=a-story">Read on Nuvellum →<\/a>$/);
  assert.ok([...m.caption].length <= 1024);
  for (const image of ['/generated/ai/a-story.svg', null, 'https://elsewhere.example/x.jpg']) {
    assert.equal(telegramMessage(story({ image }), SITE).method, 'sendMessage', String(image));
  }
  const long = telegramMessage(story({ dek: 'word '.repeat(600) }), SITE);
  assert.ok([...long.caption].length <= 1024, 'long deks are clipped to the caption limit');
});

test('Telegram posts through the Bot API and records the message; errors never leak the token', async () => {
  const calls = [];
  const r = await telegram.post(story(), { env: TG, siteUrl: SITE, fetchImpl: fakeFetch({ body: { ok: true, result: { message_id: 42, chat: { username: 'nuvellum' } } } }, calls) });
  assert.deepEqual(r, { remoteId: '42', remoteUrl: 'https://t.me/nuvellum/42', kind: 'photo' });
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TG.TELEGRAM_BOT_TOKEN}/sendPhoto`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, '@nuvellum'); assert.equal(body.parse_mode, 'HTML');
  await assert.rejects(
    telegram.post(story(), { env: TG, siteUrl: SITE, fetchImpl: fakeFetch({ status: 401, body: { ok: false, description: `Unauthorized for bot${TG.TELEGRAM_BOT_TOKEN}` } }) }),
    (e) => e instanceof PostError && e.retryable === false && !e.message.includes(TG.TELEGRAM_BOT_TOKEN) && /HTTP 401/.test(e.message));
  await assert.rejects(telegram.post(story(), { env: TG, siteUrl: SITE, fetchImpl: fakeFetch({ status: 429, body: { description: 'Too Many Requests' } }) }), (e) => e.retryable === true);
  assert.equal(telegram.configured({}), false);
});

test('Facebook and LinkedIn use their official endpoints with the tracked link', async () => {
  const copy = { facebook: { text: 'FB text' }, linkedin: { text: 'LI text #Nuvellum (story)' }, x: { text: 'X text' } };
  const calls = [];
  const fb = await facebook.post(story(), { env: { FACEBOOK_PAGE_ID: '1001', FACEBOOK_PAGE_TOKEN: 'page-token-xyz' }, copy, fetchImpl: fakeFetch({ body: { id: '1001_77' } }, calls) });
  assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/1001/feed');
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get('message'), 'FB text'); assert.match(form.get('link'), /utm_source=facebook/);
  assert.equal(fb.remoteId, '1001_77');
  const li = await linkedin.post(story(), { env: { LINKEDIN_ORG_URN: 'urn:li:organization:5', LINKEDIN_TOKEN: 'li-token-abc' }, copy, fetchImpl: fakeFetch({ status: 201, body: {}, headers: { 'x-restli-id': 'urn:li:share:9' } }, calls) });
  assert.equal(calls[1].url, 'https://api.linkedin.com/rest/posts');
  assert.equal(calls[1].init.headers['X-Restli-Protocol-Version'], '2.0.0');
  const lb = JSON.parse(calls[1].init.body);
  assert.equal(lb.author, 'urn:li:organization:5'); assert.equal(lb.lifecycleState, 'PUBLISHED');
  assert.equal(lb.commentary, 'LI text \\#Nuvellum \\(story\\)', 'LinkedIn little-text reserved characters are escaped');
  assert.match(lb.content.article.source, /utm_source=linkedin/);
  assert.equal(li.remoteId, 'urn:li:share:9');
});

test('X: OAuth 1.0a signature matches the reference example in the X API documentation', () => {
  const h = oauth1Header({
    method: 'POST', url: 'https://api.twitter.com/1.1/statuses/update.json',
    params: { include_entities: 'true', status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    consumerKey: 'xvz1evFS4wEEPTGEFPHBog', consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958
  });
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});

test('X posts to /2/tweets with a signed header', async () => {
  const calls = [];
  const r = await x.post(story(), { env: { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'ts' }, copy: { x: { text: 'hello' } }, fetchImpl: fakeFetch({ status: 201, body: { data: { id: '555' } } }, calls) });
  assert.equal(calls[0].url, 'https://api.x.com/2/tweets');
  assert.match(calls[0].init.headers.Authorization, /^OAuth oauth_consumer_key="k", oauth_nonce="[0-9a-f]{32}", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA1"/);
  assert.equal(JSON.parse(calls[0].init.body).text, 'hello');
  assert.equal(r.remoteUrl, 'https://x.com/i/web/status/555');
});

test('planner: configured platforms post once live, others are recorded honestly', () => {
  const byP = (plan) => Object.fromEntries(plan.map((s) => [s.platform, s.action === 'post' ? 'post' : s.status || s.action]));
  assert.deepEqual(byP(planStory({ env: TG, live: true })), { telegram: 'post', facebook: 'skipped', linkedin: 'skipped', x: 'skipped', instagram: 'skipped', threads: 'skipped', youtube: 'skipped', tiktok: 'skipped' });
  assert.equal(byP(planStory({ env: TG, live: false })).telegram, 'queued', 'not live yet → queued, not posted');
  // Video platforms belong to the Shorts autopilot (engines/publish/video.mjs), not the feed publisher.
  assert.match(planStory({ env: TG, live: true }).find((x) => x.platform === 'tiktok').reason, /Shorts autopilot/);
  const ig = { INSTAGRAM_USER_ID: '1', INSTAGRAM_TOKEN: 't', THREADS_USER_ID: '2', THREADS_TOKEN: 't' };
  assert.equal(byP(planStory({ env: { ...TG, ...ig }, live: true })).instagram, 'post');
  assert.equal(byP(planStory({ env: { ...TG, ...ig }, live: true })).threads, 'post');
});

test('X is a paid API: credentials alone never post; the owner must approve the spend', () => {
  const creds = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'ts' };
  const xStep = (env) => planStory({ env, live: true }).find((s) => s.platform === 'x');
  assert.equal(xStep(creds).status, 'skipped');
  assert.match(xStep(creds).reason, /paid API.*budget approval/);
  assert.equal(xStep({ ...creds, NUVELLUM_X_BUDGET_APPROVED: 'true' }).status, 'skipped', 'only the exact value "yes" approves');
  assert.equal(xStep({ ...creds, NUVELLUM_X_BUDGET_APPROVED: 'yes' }).action, 'post');
  assert.equal(xStep({}).reason, 'not configured');
});

test('no duplicate posts: sent (and finally failed) platforms are never attempted again', () => {
  const ledger = { platforms: { telegram: { status: 'sent', attempts: 1 }, x: { status: 'failed', attempts: 1 } } };
  const env = { ...TG, X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'ts', NUVELLUM_X_BUDGET_APPROVED: 'yes' };
  const plan = planStory({ ledger, env, live: true });
  assert.equal(plan.find((s) => s.platform === 'telegram').action, 'keep');
  assert.equal(plan.find((s) => s.platform === 'x').action, 'keep');
});

test('retries: retryable failures are queued up to MAX_ATTEMPTS, then recorded as failed; success clears the error', () => {
  let prev = {};
  for (let i = 1; i < MAX_ATTEMPTS; i++) { prev = outcome(prev, { ok: false, retryable: true, error: 'telegram: HTTP 502' }); assert.equal(prev.status, 'queued'); assert.equal(prev.attempts, i); }
  assert.equal(outcome(prev, { ok: false, retryable: true, error: 'x' }).status, 'failed');
  assert.equal(outcome({}, { ok: false, retryable: false, error: 'telegram: HTTP 400 chat not found' }).status, 'failed', 'bad config is not retried');
  const sent = outcome(prev, { ok: true, at: '2026-09-30T10:00:00Z', remoteId: '1' });
  assert.equal(sent.status, 'sent'); assert.equal(sent.attempts, MAX_ATTEMPTS);
  const e = record(record({ slug: 's', platforms: {} }, 'telegram', { status: 'queued', error: 'boom' }, 0), 'telegram', sent, 1);
  assert.equal(e.platforms.telegram.error, undefined);
  assert.equal(planStory({ ledger: { platforms: { telegram: { status: 'queued', attempts: MAX_ATTEMPTS, error: 'HTTP 502' } } }, env: TG, live: true }).find((s) => s.platform === 'telegram').status, 'failed');
});


test('scheduled social cadence selects at most one actionable story and prefers queued retry, then newest', () => {
  assert.equal(chooseScheduledCandidate([
    { slug: 'old', actionable: true, reachedMain: 100 },
    { slug: 'new', actionable: true, reachedMain: 300 },
    { slug: 'skip', actionable: false, reachedMain: 999 }
  ]), 'new');

  assert.equal(chooseScheduledCandidate([
    { slug: 'new', actionable: true, reachedMain: 300 },
    { slug: 'retry', actionable: true, hasQueued: true, reachedMain: 100 },
    { slug: 'skip', actionable: false, hasQueued: true, reachedMain: 999 }
  ]), 'retry');

  assert.equal(chooseScheduledCandidate([
    { slug: 'a', actionable: false, reachedMain: 100 },
    { slug: 'b', actionable: false, reachedMain: 200 }
  ]), null);
});
