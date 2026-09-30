import { randomUUID } from 'node:crypto';
import { authenticateGitHubRequest } from './lib/github-oidc.mjs';
import { briefFromEnv } from '../scripts/lib/brief/handler.mjs';
import { unsubscribeLink } from '../scripts/lib/brief/brief.mjs';
import { redisConfig, createUpstash, StoreError } from '../scripts/lib/brief/store.mjs';
import {
  cairoIssueDate,
  selectBriefStories,
  issueFingerprint,
  issueHasNewStory,
  buildRecipientEmail,
  sendResendBatches,
  BRIEF_LIMITS
} from './lib/brief-issue.mjs';

const LAST_KEY = 'brief:issue:last';
const sentKey = (date) => `brief:issue:sent:${date}`;
const lockKey = (date) => `brief:issue:lock:${date}`;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff'
  }
});

const parseStored = (raw) => {
  try { return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};

async function loadPublishedStories(site, fetchImpl) {
  const res = await fetchImpl(`${site.replace(/\/+$/, '')}/search-index.json?brief=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'Nuvellum-Brief/1.0' }
  });
  if (!res.ok) throw new Error(`Published story index unavailable (${res.status}).`);
  const body = await res.json();
  const stories = selectBriefStories(body);
  if (stories.length !== 3) throw new Error('Fewer than three eligible published stories are available.');
  return stories;
}

export function createBriefSendHandler({
  env = process.env,
  fetchImpl = fetch,
  auth = authenticateGitHubRequest,
  storeFactory = (cfg) => createUpstash({ ...cfg, fetchImpl }),
  now = () => new Date()
} = {}) {
  return async function handle(request) {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

    let claims;
    try {
      claims = await auth(request, { fetchImpl });
    } catch {
      return json(401, { error: 'Unauthorized.' });
    }

    const url = new URL(request.url);
    const requestedSend = url.searchParams.get('send') === '1';
    const live = claims.event_name === 'schedule' || (claims.event_name === 'workflow_dispatch' && requestedSend);
    const site = String(env.SITE_URL || 'https://www.nuvellum.news').replace(/\/+$/, '');

    const cfg = redisConfig(env);
    const brief = briefFromEnv(env, { storeFactory, now: () => +now() });
    const apiKey = String(env.RESEND_API_KEY || '');
    const topicId = String(env.RESEND_BRIEF_TOPIC_ID || '');
    if (!cfg.ok || !brief || !apiKey.startsWith('re_') || !/^[0-9a-f-]{36}$/i.test(topicId)) {
      return json(503, { error: 'The Brief sender is not fully configured.' });
    }

    try {
      const store = storeFactory(cfg);
      const stories = await loadPublishedStories(site, fetchImpl);
      const fingerprint = issueFingerprint(stories);
      const issueDate = cairoIssueDate(now());
      const last = parseStored(await store.run(['GET', LAST_KEY]));

      if (last?.fingerprint === fingerprint || (last && !issueHasNewStory(stories, last))) {
        return json(200, { ok: true, sent: false, reason: 'no-new-stories', issueDate, stories: stories.map((s) => s.slug) });
      }

      const active = (await brief.all()).filter((r) => r.status === 'active');
      // QA sign-ups intentionally exercise the real consent flow, but must never enter an unattended production mailing.
      const subscribers = active.filter((r) => !/^qa(?:-|$)/i.test(String(r.source || '')));
      const qaExcluded = active.length - subscribers.length;
      if (subscribers.length > BRIEF_LIMITS.maxRecipients) {
        return json(503, { error: 'Active subscriber count exceeds the configured safety cap.' });
      }

      if (!live) {
        return json(200, {
          ok: true,
          dryRun: true,
          sent: false,
          issueDate,
          recipients: subscribers.length,
          qaExcluded,
          stories: stories.map((s) => s.slug),
          fingerprint
        });
      }

      if (!subscribers.length) {
        return json(200, { ok: true, sent: false, reason: 'no-active-subscribers', issueDate, qaExcluded, stories: stories.map((s) => s.slug) });
      }

      if (await store.run(['GET', sentKey(issueDate)])) {
        return json(200, { ok: true, sent: false, reason: 'already-sent-today', issueDate });
      }

      const lock = randomUUID();
      const gotLock = await store.run(['SET', lockKey(issueDate), lock, 'NX', 'EX', '900']);
      if (gotLock !== 'OK') return json(200, { ok: true, sent: false, reason: 'send-in-progress', issueDate });

      // Re-check after acquiring the lock in case another invocation completed immediately before it.
      if (await store.run(['GET', sentKey(issueDate)])) {
        return json(200, { ok: true, sent: false, reason: 'already-sent-today', issueDate });
      }

      const secret = String(env.NUVELLUM_BRIEF_SECRET || '');
      const emails = subscribers.map((subscriber) => {
        const unsubscribeUrl = unsubscribeLink(site, secret, subscriber.id, subscriber.consentAt || subscriber.createdAt);
        return buildRecipientEmail({ subscriber, stories, issueDate, site, unsubscribeUrl, topicId });
      });

      const sent = await sendResendBatches({
        apiKey,
        emails,
        idempotencyBase: `nuvellum-brief/${issueDate}/${fingerprint}`,
        fetchImpl
      });

      const record = {
        issueDate,
        fingerprint,
        slugs: stories.map((s) => s.slug),
        sentAt: now().toISOString(),
        recipients: sent.recipients,
        batches: sent.batches
      };
      await store.pipeline([
        ['SET', sentKey(issueDate), JSON.stringify(record), 'EX', String(60 * 60 * 24 * 400)],
        ['SET', LAST_KEY, JSON.stringify(record)]
      ]);

      return json(200, { ok: true, sent: true, ...record });
    } catch (err) {
      if (err instanceof StoreError) return json(503, { error: 'The Brief subscriber store is unavailable.' });
      console.error('[brief-send] failed:', err instanceof Error ? err.message : 'unknown error');
      return json(503, { error: 'The Brief issue could not be sent.' });
    }
  };
}

const handle = createBriefSendHandler();

export default {
  fetch(request) {
    return handle(request);
  }
};
