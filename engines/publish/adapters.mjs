// Live posting adapters, official APIs only. Each adapter is dormant until its credentials exist in the
// environment (GitHub Actions secrets); nothing here is called in tests except through an injected fetch.
//
//   telegram  Bot API sendPhoto / sendMessage                   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
//   facebook  Graph API POST /{page-id}/feed (link post)         FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN
//   linkedin  Posts API POST /rest/posts (article post)          LINKEDIN_ORG_URN, LINKEDIN_TOKEN
//   x         API v2 POST /2/tweets, OAuth 1.0a user context     X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
//   instagram Graph API /{ig-user-id}/media + media_publish       INSTAGRAM_USER_ID, INSTAGRAM_TOKEN (portrait card by public URL)
//   threads   Threads API /{user-id}/threads TEXT + publish       THREADS_USER_ID, THREADS_TOKEN
//
// Errors thrown from here carry only the platform, HTTP status and the API's own short error text, never
// credentials or request bodies.
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { trackedUrl } from '../distribution/copy.mjs';

export class PostError extends Error {
  constructor(platform, message, { status = 0, retryable = true } = {}) { super(`${platform}: ${message}`); this.platform = platform; this.status = status; this.retryable = retryable; }
}

const RASTER = /\.(?:jpe?g|png|webp)$/i;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (s, n) => { const a = [...String(s ?? '')]; return a.length <= n ? a.join('') : a.slice(0, n - 1).join('').replace(/\s+\S*$/, '') + '…'; };
const redact = (text, env) => {
  let t = String(text || '').slice(0, 300);
  for (const v of Object.values(env || {})) if (typeof v === 'string' && v.length >= 8) t = t.split(v).join('[redacted]');
  return t;
};

async function readError(platform, res, env) {
  let detail = '';
  try { const j = await res.json(); detail = j.description || j.error?.message || j.message || j.detail || j.title || ''; } catch {}
  // 4xx other than rate limits will not fix themselves on retry (bad token, bad chat, duplicate, policy).
  const retryable = res.status === 429 || res.status >= 500;
  return new PostError(platform, `HTTP ${res.status}${detail ? ' ' + redact(detail, env) : ''}`, { status: res.status, retryable });
}

/** Absolute URL of the story's own raster image on the live site, or null (SVG art and text-led stories). */
export function rasterImageUrl(story, siteUrl) {
  return story.image && story.image.startsWith('/') && RASTER.test(story.image) ? siteUrl + story.image : null;
}

// ---------- Telegram (first channel) ----------

/**
 * The Telegram post for a story. With `card` (a verified local PNG from the card system) the branded square
 * card is uploaded as the photo; without it, the legacy behaviour: the story's own raster photo by URL, or a
 * text message with a link preview.
 */
export function telegramMessage(story, siteUrl, { card = null } = {}) {
  const link = trackedUrl(story, 'telegram');
  const photo = card ? null : rasterImageUrl(story, siteUrl);
  const asPhoto = Boolean(card || photo);
  const tail = `\n\n<a href="${esc(link)}">Read on Nuvellum →</a>`;
  const head = `<b>${esc(story.title)}</b>`;
  // Captions are limited to 1024 characters, messages to 4096. Telegram counts text after entity parsing;
  // budgeting on the raw HTML (tags, escapes and the link included) keeps well inside either limit.
  const len = (s) => [...s].length;
  let dek = story.dek ? esc(clip(story.dek, (asPhoto ? 1024 : 4096) - len(head) - len(tail) - 2)) : '';
  while (dek && len(head) + 2 + len(dek) + len(tail) > (asPhoto ? 1024 : 4096)) dek = esc(clip(story.dek, len(dek) - 20));
  const text = head + (dek ? `\n\n${dek}` : '') + tail;
  if (card) return { method: 'sendPhoto', upload: card, caption: text };
  return photo ? { method: 'sendPhoto', photo, caption: text } : { method: 'sendMessage', text };
}

export const telegram = {
  id: 'telegram',
  configured: (env) => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  /** assets.telegram: path of the verified square card PNG (optional). */
  async post(story, { env, fetchImpl = fetch, siteUrl, assets = {} }) {
    const m = telegramMessage(story, siteUrl, { card: assets.telegram || null });
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${m.method}`;
    let init;
    if (m.upload) {
      // Upload the local PNG (multipart/form-data): no public image URL is needed.
      const form = new FormData();
      form.append('chat_id', env.TELEGRAM_CHAT_ID);
      form.append('caption', m.caption);
      form.append('parse_mode', 'HTML');
      form.append('photo', new Blob([readFileSync(m.upload)], { type: 'image/png' }), `${story.slug}.png`);
      init = { method: 'POST', body: form };
    } else {
      const body = m.method === 'sendPhoto'
        ? { chat_id: env.TELEGRAM_CHAT_ID, photo: m.photo, caption: m.caption, parse_mode: 'HTML' }
        : { chat_id: env.TELEGRAM_CHAT_ID, text: m.text, parse_mode: 'HTML', link_preview_options: { url: story.url, prefer_large_media: true } };
      init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    }
    const res = await fetchImpl(url, init);
    if (!res.ok) throw await readError('telegram', res, env);
    const j = await res.json();
    if (!j.ok) throw new PostError('telegram', redact(j.description || 'not ok', env), { retryable: false });
    const chat = j.result?.chat?.username;
    return { remoteId: String(j.result?.message_id ?? ''), remoteUrl: chat ? `https://t.me/${chat}/${j.result.message_id}` : null, kind: m.upload ? 'card' : m.method === 'sendPhoto' ? 'photo' : 'text' };
  }
};

// ---------- Facebook Page ----------

export const facebook = {
  id: 'facebook',
  configured: (env) => !!(env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_TOKEN),
  async post(story, { env, fetchImpl = fetch, copy }) {
    const version = env.FACEBOOK_GRAPH_VERSION || 'v23.0';
    const form = new URLSearchParams({ message: copy.facebook.text, link: trackedUrl(story, 'facebook'), access_token: env.FACEBOOK_PAGE_TOKEN });
    const res = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(env.FACEBOOK_PAGE_ID)}/feed`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (!res.ok) throw await readError('facebook', res, env);
    const j = await res.json();
    return { remoteId: String(j.id || ''), remoteUrl: j.id ? `https://www.facebook.com/${j.id}` : null, kind: 'link' };
  }
};

// ---------- LinkedIn organisation page ----------

export const linkedin = {
  id: 'linkedin',
  configured: (env) => !!(env.LINKEDIN_ORG_URN && env.LINKEDIN_TOKEN),
  async post(story, { env, fetchImpl = fetch, copy }) {
    const body = {
      author: env.LINKEDIN_ORG_URN,
      commentary: copy.linkedin.text.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => '\\' + c),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: trackedUrl(story, 'linkedin'), title: clip(story.title, 200), description: clip(story.dek, 250) } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    };
    const res = await fetchImpl('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.LINKEDIN_TOKEN}`, 'Content-Type': 'application/json', 'LinkedIn-Version': env.LINKEDIN_API_VERSION || '202509', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await readError('linkedin', res, env);
    const id = res.headers.get('x-restli-id') || '';
    return { remoteId: id, remoteUrl: id ? `https://www.linkedin.com/feed/update/${id}` : null, kind: 'article' };
  }
};

// ---------- X ----------

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** OAuth 1.0a HMAC-SHA1 Authorization header (RFC 5849). JSON bodies are not part of the signature base. */
export function oauth1Header({ method, url, params = {}, consumerKey, consumerSecret, token, tokenSecret, nonce = randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000) }) {
  const oauth = { oauth_consumer_key: consumerKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(timestamp), oauth_token: token, oauth_version: '1.0' };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const signature = createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
  const header = { ...oauth, oauth_signature: signature };
  return 'OAuth ' + Object.keys(header).sort().map((k) => `${pct(k)}="${pct(header[k])}"`).join(', ');
}

// X has no free tier (pay-per-use since February 2026; a post with a link costs about $0.20, see
// docs/SOCIAL_PLATFORM_SETUP.md). Credentials alone never enable it: the owner must also approve the spend
// with the repository variable NUVELLUM_X_BUDGET_APPROVED = "yes".
export const xHasCredentials = (env) => !!(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET);
export const x = {
  id: 'x',
  configured: (env) => xHasCredentials(env) && env.NUVELLUM_X_BUDGET_APPROVED === 'yes',
  async post(story, { env, fetchImpl = fetch, copy }) {
    const url = 'https://api.x.com/2/tweets';
    const auth = oauth1Header({ method: 'POST', url, consumerKey: env.X_API_KEY, consumerSecret: env.X_API_SECRET, token: env.X_ACCESS_TOKEN, tokenSecret: env.X_ACCESS_SECRET });
    const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: copy.x.text }) });
    if (!res.ok) throw await readError('x', res, env);
    const j = await res.json();
    const id = j.data?.id || '';
    return { remoteId: id, remoteUrl: id ? `https://x.com/i/web/status/${id}` : null, kind: 'text' };
  }
};

// ---------- Instagram (feed: the branded portrait card) ----------
// The Graph API takes images by public URL only, and JPEG only. The card workflow publishes every story's verified cards to
// the public social-assets branch, so the portrait card is fetched from there (NUVELLUM_ASSET_BASE).

const ASSET_BASE = (env) => (env.NUVELLUM_ASSET_BASE || 'https://raw.githubusercontent.com/Sh-010/Nuvellum/social-assets').replace(/\/$/, '');

export const instagram = {
  id: 'instagram',
  configured: (env) => !!(env.INSTAGRAM_USER_ID && env.INSTAGRAM_TOKEN),
  async post(story, { env, fetchImpl = fetch, copy }) {
    const image = `${ASSET_BASE(env)}/cards/${story.slug}/portrait.jpg`;
    const head = await fetchImpl(image, { method: 'HEAD' });
    if (!head.ok) throw new PostError('instagram', `public card not on social-assets yet (HTTP ${head.status})`, { status: head.status, retryable: true });
    const graph = `https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION || 'v23.0'}/${encodeURIComponent(env.INSTAGRAM_USER_ID)}`;
    const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...o, access_token: env.INSTAGRAM_TOKEN }).toString() });
    const created = await fetchImpl(`${graph}/media`, form({ image_url: image, caption: copy.instagram.text }));
    if (!created.ok) throw await readError('instagram', created, env);
    const { id } = await created.json();
    const pub = await fetchImpl(`${graph}/media_publish`, form({ creation_id: id }));
    if (!pub.ok) throw await readError('instagram', pub, env);
    const media = (await pub.json()).id;
    return { remoteId: String(media || ''), remoteUrl: null, kind: 'card' };
  }
};

// ---------- Threads (text post with the story link) ----------

export const threads = {
  id: 'threads',
  configured: (env) => !!(env.THREADS_USER_ID && env.THREADS_TOKEN),
  async post(story, { env, fetchImpl = fetch, copy }) {
    const base = `https://graph.threads.net/v1.0/${encodeURIComponent(env.THREADS_USER_ID)}`;
    const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...o, access_token: env.THREADS_TOKEN }).toString() });
    const created = await fetchImpl(`${base}/threads`, form({ media_type: 'TEXT', text: copy.threads.text, link_attachment: trackedUrl(story, 'threads') }));
    if (!created.ok) throw await readError('threads', created, env);
    const { id } = await created.json();
    const pub = await fetchImpl(`${base}/threads_publish`, form({ creation_id: id }));
    if (!pub.ok) throw await readError('threads', pub, env);
    const post = (await pub.json()).id;
    return { remoteId: String(post || ''), remoteUrl: null, kind: 'link' };
  }
};


export const ADAPTERS = { telegram, facebook, linkedin, x, instagram, threads };
