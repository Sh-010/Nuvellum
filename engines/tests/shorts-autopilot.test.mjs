import test from 'node:test';
import assert from 'node:assert/strict';
import { shortEligibility, chooseShort, ledgerState, verifyShort, MAX_RENDER_FAILURES } from '../shorts/autopilot.mjs';
import { extractiveScript } from '../shorts/script.mjs';
import { planVideo, distributeShort, videoOutcome, videoCopy, youtube, tiktok } from '../publish/video.mjs';
import { instagram as igFeed, threads } from '../publish/adapters.mjs';

const H = 3600000;
const NOW = Date.parse('2026-10-01T12:00:00Z');
const iso = (h) => new Date(NOW - h * H).toISOString();
const SENTENCES = [
  'The space agency has awarded a five-year contract worth about twenty three million dollars to a Maryland firm.',
  'The firm will provide orbital safety analysis and conjunction screening for every uncrewed spacecraft the agency operates.',
  'Work will also support human spaceflight and the commerce department office that tracks objects in orbit.',
  'Operations will run from sites in Maryland, Texas, Virginia and Colorado over the period of performance.',
  'The award follows a competitive procurement that drew several proposals from established contractors.'
];
const story = (over = {}) => ({ slug: 'a-story', title: 'Agency awards orbital safety contract', dek: 'A five-year award.', url: 'https://www.nuvellum.news/article/a-story', section: 'Science', type: 'News', risk: 'low', live: null, publishedAt: iso(3), mediaMode: 'photo', tags: ['NASA'], sentences: SENTENCES, ...over });

// ---------- eligibility ----------
test('eligible: a fresh low-risk news story with enough verbatim text', () => {
  const e = shortEligibility(story(), { now: NOW });
  assert.equal(e.eligible, true, e.reasons.join('; '));
  assert.ok(e.seconds >= 20 && e.beats >= 2);
});

test('never automatic: sensitive, human-led, breaking/developing, stale, or too little text', () => {
  const why = (over) => shortEligibility(story(over), { now: NOW }).reasons.join('; ');
  assert.match(why({ risk: 'sensitive' }), /risk is "sensitive"/);
  for (const type of ['Opinion', 'Essay', 'Ideas', 'Review']) assert.match(why({ type }), /human-led/);
  assert.match(why({ section: 'Opinion' }), /human-led/);
  assert.match(why({ live: 'breaking' }), /facts may still change/);
  assert.match(why({ publishedAt: iso(100) }), /window 72h/);
  assert.match(why({ sentences: SENTENCES.slice(0, 1) }), /supporting line|script/);
});

test('scoring is deterministic: a photo outranks text-led; newer outranks older', () => {
  const s = (over) => shortEligibility(story(over), { now: NOW }).score;
  assert.ok(s({ mediaMode: 'photo' }) > s({ mediaMode: 'text-led' }));
  assert.ok(s({ publishedAt: iso(1) }) > s({ publishedAt: iso(40) }));
  assert.equal(s(), s(), 'same input, same score');
});

// ---------- ledger and selection ----------
const cand = (slug, score, eligible = true) => ({ story: { slug }, eligibility: { eligible, score } });
test('selection: never a duplicate; retries first; at most two a day; one render at a time', () => {
  const pool = [cand('a', 50), cand('b', 70), cand('c', 90, false)];
  assert.equal(chooseShort(pool, [], { now: NOW }).slug, 'b', 'highest eligible score');
  assert.equal(chooseShort(pool, [{ slug: 'b', render: { status: 'rendered', at: iso(30) } }], { now: NOW }).slug, 'a', 'a story with a Short is never rendered again');
  assert.equal(chooseShort(pool, [{ slug: 'a', render: { status: 'failed', failures: 1, at: iso(5) } }], { now: NOW }).slug, 'a', 'a failed render is retried first');
  assert.equal(chooseShort(pool, [{ slug: 'a', render: { status: 'failed', failures: MAX_RENDER_FAILURES, at: iso(5) } }], { now: NOW }).slug, 'b', 'until it has failed twice');
  const twoToday = [{ slug: 'x', render: { status: 'rendered', at: iso(2) } }, { slug: 'y', render: { status: 'rendered', at: iso(20) } }];
  assert.equal(chooseShort(pool, twoToday, { now: NOW }).slug, null);
  assert.match(chooseShort(pool, twoToday, { now: NOW }).reason, /daily limit/);
  assert.equal(chooseShort(pool, [{ slug: 'z', render: { status: 'rendering', at: iso(0.5) } }], { now: NOW }).slug, null, 'busy');
  assert.equal(ledgerState({ render: { status: 'rendering', at: iso(3) } }, NOW), 'retry', 'a crashed render is retried');
  assert.equal(chooseShort([cand('c', 90, false)], [], { now: NOW }).slug, null);
});

// ---------- verification ----------
const good = () => {
  const s = story();
  return { report: { status: 'rendered', tts: 'piper' }, script: extractiveScript(s), story: s, probe: { width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', duration: 38.2 }, sizes: { 'short.mp4': 4e6, 'poster.jpg': 9e4, 'captions.srt': 900, 'script.json': 900, 'plan.json': 9000, 'report.json': 400 } };
};
test('verify: a correct Piper render passes', () => assert.deepEqual(verifyShort(good()), []));
test('verify: wrong size, codec, missing audio, fallback voice, bad duration, missing files and invented lines all fail', () => {
  const p = (patch) => verifyShort({ ...good(), ...patch(good()) }).join('; ');
  assert.match(p((g) => ({ probe: { ...g.probe, width: 540, height: 960 } })), /not 1080x1920/);
  assert.match(p((g) => ({ probe: { ...g.probe, videoCodec: 'vp9' } })), /not h264/);
  assert.match(p((g) => ({ probe: { ...g.probe, audioCodec: undefined } })), /audio codec is missing/);
  assert.match(p(() => ({ report: { status: 'rendered', tts: 'silent' } })), /not piper/);
  assert.match(p(() => ({ report: { status: 'rendered', tts: 'espeak' } })), /not piper/);
  assert.match(p((g) => ({ probe: { ...g.probe, duration: 4 } })), /outside 15-60s/);
  assert.match(p((g) => ({ sizes: { ...g.sizes, 'poster.jpg': 0 } })), /poster\.jpg is missing/);
  assert.match(p((g) => ({ sizes: { ...g.sizes, 'short.mp4': 10 } })), /short\.mp4 is missing or too small/);
  assert.match(p((g) => ({ script: { ...g.script, lines: [{ ...g.script.lines[0], text: 'The agency faces a scandal.' }, ...g.script.lines.slice(1)] } })), /not verbatim article text/);
});

// ---------- video plan ----------
const ALL = { YOUTUBE_CLIENT_ID: 'id', YOUTUBE_CLIENT_SECRET: 'secret-value', YOUTUBE_REFRESH_TOKEN: 'refresh-value', FACEBOOK_PAGE_ID: '1', FACEBOOK_PAGE_TOKEN: 'page-token-value', INSTAGRAM_USER_ID: '2', INSTAGRAM_TOKEN: 'ig-token-value', TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 'tiktok-secret', TIKTOK_REFRESH_TOKEN: 'tiktok-refresh' };
const status = (plan) => Object.fromEntries(plan.map((s) => [s.platform, s.action === 'post' ? 'post' : s.status || s.action]));
test('video plan: honest states per platform', () => {
  assert.deepEqual(status(planVideo({ env: {}, verified: true })), { youtube: 'blocked_credentials', facebook: 'blocked_credentials', instagram: 'blocked_credentials', tiktok: 'blocked_credentials' });
  assert.deepEqual(status(planVideo({ env: ALL, verified: true })), { youtube: 'post', facebook: 'post', instagram: 'post', tiktok: 'blocked_external_approval' }, 'TikTok waits for its audit');
  assert.equal(status(planVideo({ env: { ...ALL, TIKTOK_AUDITED: 'yes' }, verified: true })).tiktok, 'post');
  assert.deepEqual(new Set(Object.values(status(planVideo({ env: ALL, verified: false })))), new Set(['skipped']), 'an unverified Short goes nowhere');
  const done = { platforms: { youtube: { status: 'sent' }, facebook: { status: 'awaiting_approval', remoteId: 'v' }, instagram: { status: 'failed' } } };
  const plan = planVideo({ entry: done, env: ALL, verified: true });
  assert.deepEqual(plan.filter((s) => s.action === 'keep').map((s) => s.platform), ['youtube', 'facebook', 'instagram'], 'never uploaded twice');
});

test('video outcomes: public = sent; kept private by the platform = awaiting_approval (final); retries then failed', () => {
  assert.equal(videoOutcome({}, { ok: true, remoteId: 'v' }).status, 'sent');
  const priv = videoOutcome({}, { ok: true, remoteId: 'v', private: true, reason: 'uploaded as private' });
  assert.equal(priv.status, 'awaiting_approval');
  assert.equal(priv.remoteId, 'v');
  assert.equal(videoOutcome({ attempts: 0 }, { ok: false, retryable: true, error: 'x' }).status, 'queued');
  assert.equal(videoOutcome({ attempts: 2 }, { ok: false, retryable: true, error: 'x' }).status, 'failed');
  assert.equal(videoOutcome({}, { ok: false, retryable: false, error: 'x' }).status, 'failed');
});

// ---------- adapters (mocked APIs) ----------
const res = (status, body, headers = {}) => new Response(body == null ? null : JSON.stringify(body), { status, headers });
const video = { bytes: Buffer.alloc(1000), size: 1000, url: 'https://cdn.jsdelivr.net/gh/Sh-010/Nuvellum@social-assets/shorts/a-story/short.mp4' };

test('YouTube: refresh → resumable upload; an unaudited project kept private is reported, not called public', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    if (url.includes('oauth2')) return res(200, { access_token: 'at' });
    if (url.includes('uploadType=resumable')) { assert.equal(JSON.parse(init.body).status.privacyStatus, 'public'); return res(200, {}, { location: 'https://upload.example/session' }); }
    if (url === 'https://upload.example/session') return res(200, { id: 'yt1', status: { privacyStatus: 'private', uploadStatus: 'uploaded' } });
    throw new Error(url);
  };
  const r = await youtube.post(story(), { env: ALL, fetchImpl, video });
  assert.equal(r.remoteId, 'yt1');
  assert.equal(r.private, true);
  assert.match(r.reason, /unaudited API projects/);
  assert.equal(calls.length, 3);
  assert.match(videoCopy(story(), 'youtube').description, /utm_source=youtube/);
});

test('TikTok: needs public posting rights on the account, uploads the file directly', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('oauth/token')) return res(200, { access_token: 'at' });
    if (url.includes('creator_info')) return res(200, { data: { privacy_level_options: ['SELF_ONLY'] } });
    throw new Error(url);
  };
  await assert.rejects(() => tiktok.post(story(), { env: ALL, fetchImpl, video }), /cannot post publicly/);
});

test('one platform failing never stops the others; errors never contain credentials; entry saved after every upload', async () => {
  const saved = [];
  const adapters = {
    youtube: { post: async () => { throw new Error('boom'); } },
    facebook: { post: async () => ({ remoteId: 'fb1', remoteUrl: 'https://www.facebook.com/reel/fb1' }) },
    instagram: { post: async (s, { env }) => { const { PostError } = await import('../publish/adapters.mjs'); throw new PostError('instagram', `HTTP 400 bad token ${env.INSTAGRAM_TOKEN}`.replace(env.INSTAGRAM_TOKEN, '[redacted]'), { retryable: false }); } },
    tiktok: { post: async () => { throw new Error('must not be called without audit'); } }
  };
  const { entry, lines } = await distributeShort({ story: story(), entry: { slug: 'a-story' }, env: ALL, verified: true, video, live: true, adapters, now: NOW, save: (e) => saved.push(e) });
  assert.equal(entry.platforms.youtube.status, 'queued');
  assert.equal(entry.platforms.facebook.status, 'sent');
  assert.equal(entry.platforms.instagram.status, 'failed');
  assert.equal(entry.platforms.tiktok.status, 'blocked_external_approval');
  assert.equal(saved.length, 3, 'saved after each of the three uploads');
  assert.doesNotMatch(JSON.stringify(entry) + lines.join(''), /ig-token-value|secret-value|refresh-value/);
  const again = await distributeShort({ story: story(), entry, env: ALL, verified: true, video, live: true, adapters: { ...adapters, facebook: { post: async () => { throw new Error('duplicate!'); } } }, now: NOW });
  assert.equal(again.entry.platforms.facebook.status, 'sent', 'sent is final: no second upload');
});

test('dry run: nothing is uploaded', async () => {
  const adapters = Object.fromEntries(['youtube', 'facebook', 'instagram', 'tiktok'].map((p) => [p, { post: async () => { throw new Error('uploaded in dry run'); } }]));
  const { lines } = await distributeShort({ story: story(), entry: { slug: 'a-story' }, env: ALL, verified: true, video, live: false, adapters, now: NOW });
  assert.ok(lines.some((l) => /would upload \(dry run\)/.test(l)));
});

// ---------- feed adapters ----------
test('Instagram feed: posts the public portrait card; waits (retryable) until social-assets has it', async () => {
  const env = { INSTAGRAM_USER_ID: '2', INSTAGRAM_TOKEN: 'ig-token-value' };
  const copy = { instagram: { text: 'caption' } };
  await assert.rejects(() => igFeed.post(story(), { env, copy, fetchImpl: async () => res(404, null) }), (e) => e.retryable === true && /not on social-assets yet/.test(e.message));
  const seen = [];
  const r = await igFeed.post(story(), { env, copy, fetchImpl: async (url, init = {}) => { seen.push(url); if (init.method === 'HEAD') return res(200, null); if (url.endsWith('/media')) { assert.match(init.body, /portrait\.jpg/); return res(200, { id: 'c1' }); } return res(200, { id: 'm1' }); } });
  assert.equal(r.remoteId, 'm1');
  assert.match(seen[0], /social-assets\/cards\/a-story\/portrait\.jpg$/, 'Instagram takes JPEG only');
});

test('Threads: a text post with the tracked story link', async () => {
  const r = await threads.post(story(), { env: { THREADS_USER_ID: '3', THREADS_TOKEN: 'th-token-value' }, copy: { threads: { text: 'Agency awards contract' } }, fetchImpl: async (url, init) => {
    if (url.endsWith('/threads')) { assert.match(init.body, /media_type=TEXT/); assert.match(decodeURIComponent(init.body), /utm_source=threads/); return res(200, { id: 'c' }); }
    return res(200, { id: 't1' });
  } });
  assert.equal(r.remoteId, 't1');
});

test('public media for Meta comes from a CDN that sends real image/video content types, never raw GitHub', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['publish/adapters.mjs', 'shorts/autopilot-cli.mjs']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(src, /cdn\.jsdelivr\.net\/gh\/Sh-010\/Nuvellum@social-assets/, f);
    assert.doesNotMatch(src, /raw\.githubusercontent\.com/, f + ': raw GitHub serves application/octet-stream, which Meta rejects');
  }
});
