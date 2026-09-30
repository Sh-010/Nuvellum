import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrief } from '../scripts/lib/brief/brief.mjs';
import { createMemoryStore } from '../scripts/lib/brief/store.mjs';
import {
  cairoIssueDate,
  selectBriefStories,
  issueFingerprint,
  renderBriefIssue,
  buildRecipientEmail,
  sendResendBatches,
  BRIEF_LIMITS
} from '../api/lib/brief-issue.mjs';
import { createBriefSendHandler } from '../api/brief-send.js';

const SECRET = 's'.repeat(48);
const TOPIC = '114a9a70-ee92-485e-a94f-9ba2cd4bb24d';
const ENV = {
  SITE_URL: 'https://www.nuvellum.news',
  NUVELLUM_BRIEF_SECRET: SECRET,
  KV_REST_API_URL: 'https://brief.example.upstash.io',
  KV_REST_API_TOKEN: 'k'.repeat(40),
  RESEND_API_KEY: 're_' + 'x'.repeat(32),
  RESEND_BRIEF_TOPIC_ID: TOPIC
};

const articles = [
  { slug: 'newest-story', title: 'Newest story headline', dek: 'A complete standfirst with enough context for a Brief item.', section: 'World', status: 'published', origin: 'automation', date: '2026-09-30', publishedAt: '2026-09-30T08:30:00Z' },
  { slug: 'second-story', title: 'Second story headline', dek: 'Another complete standfirst with enough context for readers.', section: 'Culture', status: 'published', origin: 'manual', date: '2026-09-30', publishedAt: '2026-09-30T07:30:00Z' },
  { slug: 'third-story', title: 'Third story headline', dek: 'A third complete standfirst with enough context for readers.', section: 'Technology', status: 'published', origin: 'automation', date: '2026-09-29', publishedAt: '2026-09-29T22:00:00Z' },
  { slug: 'seed-placeholder', title: 'Seed placeholder headline', dek: 'This is long enough but deliberately lacks a production origin.', section: 'World', status: 'published', date: '2026-10-01' },
  { slug: 'draft-story', title: 'Draft story headline', dek: 'A draft that must never enter the newsletter issue selection.', section: 'World', status: 'draft', origin: 'manual', date: '2026-10-02' }
];

test('Brief issue selection is deterministic and excludes seeds/non-published content', () => {
  assert.deepEqual(selectBriefStories(articles).map((s) => s.slug), ['newest-story', 'second-story', 'third-story']);
  assert.equal(issueFingerprint(selectBriefStories(articles)).length, 24);
  assert.equal(cairoIssueDate(new Date('2026-09-30T12:00:00Z')), '2026-09-30');
});

test('Brief rendering escapes article text and keeps the personal unsubscribe link', () => {
  const stories = selectBriefStories(articles).map((s, i) => i === 0 ? { ...s, title: '<script>alert(1)</script> Newest' } : s);
  const unsubscribeUrl = 'https://www.nuvellum.news/brief/unsubscribe?s=abc&t=def';
  const issue = renderBriefIssue({ stories, issueDate: '2026-09-30', unsubscribeUrl });
  assert.doesNotMatch(issue.html, /<script>alert/);
  assert.match(issue.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(issue.html, /brief\/unsubscribe\?s=abc&amp;t=def/);
  assert.match(issue.text, /Unsubscribe: https:\/\/www\.nuvellum\.news\/brief\/unsubscribe\?s=abc&t=def/);

  const email = buildRecipientEmail({
    subscriber: { email: 'reader@example.com' },
    stories,
    issueDate: '2026-09-30',
    site: 'https://www.nuvellum.news',
    unsubscribeUrl,
    topicId: TOPIC
  });
  assert.equal(email.topic_id, TOPIC);
  assert.equal(email.headers['List-Unsubscribe'], `<${unsubscribeUrl}>`);
  assert.equal(email.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('Resend sender stays inside the current 100-email daily plan cap and uses an idempotency key', async () => {
  const calls = [];
  const emails = Array.from({ length: BRIEF_LIMITS.maxRecipients }, (_, i) => ({
    from: 'Nuvellum Brief <brief@nuvellum.news>',
    to: [`reader${i}@example.com`],
    subject: 'Brief',
    text: 'Hello'
  }));
  const result = await sendResendBatches({
    apiKey: ENV.RESEND_API_KEY,
    emails,
    idempotencyBase: 'nuvellum-brief/2026-09-30/abc',
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return new Response('{}', { status: 200 });
    }
  });
  assert.equal(BRIEF_LIMITS.maxRecipients, 100);
  assert.deepEqual(result, { batches: 1, recipients: 100 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.length, 100);
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'nuvellum-brief/2026-09-30/abc/0');

  await assert.rejects(
    sendResendBatches({
      apiKey: ENV.RESEND_API_KEY,
      emails: [...emails, { ...emails[0], to: ['overflow@example.com'] }],
      idempotencyBase: 'overflow',
      fetchImpl: async () => new Response('{}', { status: 200 })
    }),
    /safety cap of 100/
  );
});

test('scheduled Brief sender sends once, records the issue, and a repeat cannot duplicate it', async () => {
  const clock = { t: Date.parse('2026-09-30T12:30:00Z') };
  const store = createMemoryStore({ now: () => clock.t });
  const brief = createBrief({ store, secret: SECRET, now: () => clock.t, site: ENV.SITE_URL });
  await brief.subscribe({ email: 'reader@example.com', consent: true, source: 'test', elapsedMs: 9000, ip: '198.51.100.1' });

  const batches = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith(`${ENV.SITE_URL}/search-index.json`)) {
      return new Response(JSON.stringify(articles), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url) === 'https://api.resend.com/emails/batch') {
      batches.push({ body: JSON.parse(init.body), headers: init.headers });
      return new Response('{}', { status: 200 });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const handle = createBriefSendHandler({
    env: ENV,
    fetchImpl,
    storeFactory: () => store,
    now: () => new Date(clock.t),
    auth: async () => ({ event_name: 'schedule' })
  });
  const first = await handle(new Request('https://www.nuvellum.news/api/brief-send?send=1', { method: 'POST' }));
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.sent, true);
  assert.equal(firstBody.recipients, 1);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].body[0].to[0], 'reader@example.com');

  const again = await handle(new Request('https://www.nuvellum.news/api/brief-send?send=1', { method: 'POST' }));
  const againBody = await again.json();
  assert.equal(again.status, 200);
  assert.equal(againBody.sent, false);
  assert.equal(againBody.reason, 'no-new-stories');
  assert.equal(batches.length, 1, 'retry must not send another batch');
});

test('QA-origin subscribers are excluded from unattended delivery', async () => {
  const store = createMemoryStore();
  const brief = createBrief({ store, secret: SECRET, site: ENV.SITE_URL });
  await brief.subscribe({ email: 'qa@example.com', consent: true, source: 'qa-live-e2e', elapsedMs: 9000, ip: '198.51.100.11' });

  const fetchImpl = async (url) => {
    if (String(url).startsWith(`${ENV.SITE_URL}/search-index.json`)) return new Response(JSON.stringify(articles), { status: 200 });
    throw new Error('Resend must not be called for QA-only audience');
  };
  const handle = createBriefSendHandler({
    env: ENV,
    fetchImpl,
    storeFactory: () => store,
    now: () => new Date('2026-09-30T12:30:00Z'),
    auth: async () => ({ event_name: 'schedule' })
  });
  const res = await handle(new Request('https://www.nuvellum.news/api/brief-send?send=1', { method: 'POST' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.sent, false);
  assert.equal(body.reason, 'no-active-subscribers');
  assert.equal(body.qaExcluded, 1);
});

test('main-branch push invokes the sender only as a dry run', async () => {
  const store = createMemoryStore();
  const fetchImpl = async (url) => {
    if (String(url).startsWith(`${ENV.SITE_URL}/search-index.json`)) return new Response(JSON.stringify(articles), { status: 200 });
    throw new Error('Resend must not be called during push dry-run');
  };
  const handle = createBriefSendHandler({
    env: ENV,
    fetchImpl,
    storeFactory: () => store,
    now: () => new Date('2026-09-30T12:30:00Z'),
    auth: async () => ({ event_name: 'push' })
  });
  const res = await handle(new Request('https://www.nuvellum.news/api/brief-send?send=1', { method: 'POST' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.dryRun, true);
  assert.equal(body.sent, false);
});
