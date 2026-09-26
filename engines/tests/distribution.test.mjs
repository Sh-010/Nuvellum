import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStory, listPublishedSlugs } from '../shared/article.mjs';
import { distribute } from '../distribution/engine.mjs';
import { templateCopy, checkCopy, generateCopy } from '../distribution/copy.mjs';
import { platformLength } from '../distribution/platforms.mjs';
import { server } from './helpers.mjs';

const story = loadStory('iran-proposes-seven-day-deal-to-reopen-strait-of-hormuz');
const tmp = () => mkdtempSync(join(tmpdir(), 'dist-'));

test('template copy for EVERY published article passes length, link and grounding checks', () => {
  const slugs = listPublishedSlugs();
  assert.ok(slugs.length >= 20);
  for (const slug of slugs) {
    const s = loadStory(slug);
    const c = templateCopy(s);
    for (const p of Object.keys(c)) assert.deepEqual(checkCopy(p, c[p], s), [], `${slug}/${p}`);
    assert.ok(platformLength('x', c.x) <= 280, slug);
  }
});

test('model copy that invents facts or hype is replaced by the template', async () => {
  const bad = JSON.stringify({
    x: `Iran will reopen the strait in 3 days, officials in Riyadh confirm! ${story.url}`,
    threads: `SHOCKING: this changes everything. ${story.url}`,
    facebook: { message: 'Iran says the Strait of Hormuz could reopen within seven days if Washington accepts its terms.' },
    instagram: 'Iran says the Strait of Hormuz could reopen within seven days. Full story: link in bio.',
    tiktok: 'Iran says the strait could reopen within seven days. #news',
    youtube: { title: 'Iran says the strait could reopen within seven days', description: `Read more: ${story.url}` }
  });
  const r = await generateCopy(story, { env: { NUVELLUM_ROLE_SOCIAL: 'mock', NUVELLUM_MOCK_RESPONSE: bad } });
  assert.equal(r.source.x, 'template');
  assert.equal(r.source.threads, 'template');
  assert.equal(r.source.facebook, 'model');
  assert.ok(r.notes.some(n => /x: model copy rejected .*number "3"/.test(n)), r.notes.join('\n'));
});

test('dry run posts nothing and reports configuration and missing media', async () => {
  const dir = tmp();
  try {
    const r = await distribute(story, { ledgerFile: join(dir, 'l.jsonl'), env: {} });
    assert.ok(r.results.every(x => x.status === 'dry-run'));
    assert.equal(r.results.find(x => x.platform === 'tiktok').mediaMissing, 'needs a rendered video (run the Shorts engine)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live: unconfigured platforms are disabled, never attempted', async () => {
  const dir = tmp();
  try {
    const r = await distribute(story, { live: true, ledgerFile: join(dir, 'l.jsonl'), env: {} });
    assert.ok(r.results.every(x => x.status === 'disabled'), JSON.stringify(r.results));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live: all six adapters speak their platform wire format; ledger makes reruns idempotent', async () => {
  const dir = tmp();
  const video = join(dir, 'v.mp4'); writeFileSync(video, Buffer.alloc(2048, 1));
  const s = await server((req, body) => {
    const u = req.url;
    if (u === '/2/tweets') return { json: { data: { id: 'tw1' } } };
    if (u.endsWith('/feed')) return { json: { id: 'fb1' } };
    if (u.endsWith('/threads')) return { json: { id: 'thc' } };
    if (u.endsWith('/threads_publish')) return { json: { id: 'th1' } };
    if (u.endsWith('/media')) return { json: { id: 'igc' } };
    if (u.endsWith('/media_publish')) return { json: { id: 'ig1' } };
    if (u === '/token') return { json: { access_token: 'yt-at' } };
    if (u.startsWith('/upload/youtube')) return { json: {}, status: 200 };
    if (u.includes('/v2/post/publish/video/init/')) return { json: { data: { publish_id: 'tt1', upload_url: `${s.url}/tt-upload` } } };
    if (u === '/tt-upload') return { json: {} };
    return { status: 404, json: { error: { message: 'unmocked ' + u } } };
  });
  try {
    const env = {
      X_USER_ACCESS_TOKEN: 'x-tok', X_API_BASE_URL: s.url,
      FACEBOOK_PAGE_ID: 'p1', FACEBOOK_PAGE_ACCESS_TOKEN: 'fb-tok', META_GRAPH_BASE_URL: s.url,
      THREADS_USER_ID: 'u1', THREADS_ACCESS_TOKEN: 'th-tok', THREADS_BASE_URL: s.url,
      INSTAGRAM_USER_ID: 'ig', INSTAGRAM_ACCESS_TOKEN: 'ig-tok',
      YOUTUBE_CLIENT_ID: 'c', YOUTUBE_CLIENT_SECRET: 's', YOUTUBE_REFRESH_TOKEN: 'r', GOOGLE_OAUTH_BASE_URL: s.url, YOUTUBE_UPLOAD_BASE_URL: s.url,
      TIKTOK_ACCESS_TOKEN: 'tt-tok', TIKTOK_BASE_URL: s.url
    };
    // YouTube's resumable init returns the upload URL in a Location header; emulate with a tiny proxy server.
    const yt = await server(() => ({ json: { id: 'yt1' } }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const res = await origFetch(url, init);
      if (String(url).includes('/upload/youtube/v3/videos')) return new Response(await res.text(), { status: 200, headers: { location: `${yt.url}/session` } });
      return res;
    };
    try {
      const ledgerFile = join(dir, 'l.jsonl');
      const media = { videoPath: video, imageUrl: 'https://cdn.example/card.jpg' };
      const r1 = await distribute(story, { live: true, env, media, ledgerFile, retryDelayMs: 1 });
      assert.deepEqual(Object.fromEntries(r1.results.map(x => [x.platform, x.status])), { x: 'posted', threads: 'posted', facebook: 'posted', instagram: 'posted', tiktok: 'posted', youtube: 'posted' }, JSON.stringify(r1.results));
      const tweet = s.calls.find(c => c.url === '/2/tweets');
      assert.equal(tweet.headers.authorization, 'Bearer x-tok');
      assert.ok(tweet.body.text.includes(story.url));
      const fb = s.calls.find(c => c.url.endsWith('/feed'));
      assert.ok(!fb.url.includes('fb-tok'), 'token must not be in URL');
      assert.match(String(fb.body), /access_token=fb-tok/);
      const tt = s.calls.find(c => c.url.includes('/video/init/'));
      assert.equal(tt.body.post_info.privacy_level, 'SELF_ONLY');
      assert.equal(yt.calls.length, 1);

      const callsBefore = s.calls.length;
      const r2 = await distribute(story, { live: true, env, media, ledgerFile, retryDelayMs: 1 });
      assert.ok(r2.results.every(x => x.status === 'already-posted'));
      assert.equal(s.calls.length, callsBefore, 'rerun must not call any platform');
    } finally { globalThis.fetch = origFetch; await yt.close(); }
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('live: retryable errors retry with backoff; auth errors dead-letter; one failure never blocks others', async () => {
  const dir = tmp();
  let tweetCalls = 0;
  const s = await server((req) => {
    if (req.url === '/2/tweets') { tweetCalls++; return tweetCalls < 3 ? { status: 503, json: { title: 'busy' } } : { json: { data: { id: 'ok' } } }; }
    if (req.url.endsWith('/feed')) return { status: 401, json: { error: { message: 'Invalid OAuth access token' } } };
    if (req.url.endsWith('/threads')) return { json: { id: 'c' } };
    if (req.url.endsWith('/threads_publish')) return { json: { id: 't' } };
    return { status: 404 };
  });
  try {
    const env = { X_USER_ACCESS_TOKEN: 'a', X_API_BASE_URL: s.url, FACEBOOK_PAGE_ID: 'p', FACEBOOK_PAGE_ACCESS_TOKEN: 'b', META_GRAPH_BASE_URL: s.url, THREADS_USER_ID: 'u', THREADS_ACCESS_TOKEN: 'c', THREADS_BASE_URL: s.url };
    const r = await distribute(story, { live: true, env, platforms: ['x', 'facebook', 'threads'], ledgerFile: join(dir, 'l.jsonl'), retryDelayMs: 1 });
    const by = Object.fromEntries(r.results.map(x => [x.platform, x]));
    assert.equal(by.x.status, 'posted'); assert.equal(by.x.attempts, 3);
    assert.equal(by.facebook.status, 'dead-letter'); assert.match(by.facebook.error, /401/);
    assert.equal(by.threads.status, 'posted');
    const r2 = await distribute(story, { live: true, env, platforms: ['facebook'], ledgerFile: join(dir, 'l.jsonl'), retryDelayMs: 1 });
    assert.equal(r2.results[0].status, 'dead-letter', 'dead-lettered posts are not retried automatically');
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('live: a platform that keeps failing becomes dead-letter after max runs', async () => {
  const dir = tmp();
  const s = await server(() => ({ status: 500, json: { title: 'down' } }));
  try {
    const env = { X_USER_ACCESS_TOKEN: 'a', X_API_BASE_URL: s.url };
    const opts = { live: true, env, platforms: ['x'], ledgerFile: join(dir, 'l.jsonl'), retryDelayMs: 1, maxAttempts: 2, maxRuns: 3 };
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await distribute(story, opts)).results[0].status);
    assert.deepEqual(statuses, ['failed', 'failed', 'dead-letter', 'dead-letter']);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});
