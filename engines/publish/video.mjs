// Video distribution for verified Shorts: YouTube Shorts, Facebook Reels, Instagram Reels and TikTok.
// Official APIs only, each dormant until its credentials exist. Every platform is independent: a failure or
// block on one never stops another, and nothing here can touch article publication.
//
// Statuses (shorts/<slug>.json → platforms.<platform>):
//   queued                     retryable failure; tried again on the next run (up to MAX_ATTEMPTS)
//   sent                       published publicly; final
//   awaiting_approval          uploaded, but the platform kept it private (unverified/unaudited API app); final
//                              for automation (never re-uploaded) — a person can make it public
//   failed                     non-retryable error or attempts used up; final
//   blocked_credentials        no credentials configured; re-evaluated every run
//   blocked_external_approval  credentials exist, but the platform requires an audit/review before an app may
//                              publish; re-evaluated every run (set TIKTOK_AUDITED=yes once TikTok approves)
//   skipped                    not applicable (e.g. the Short is not verified)
//
//   youtube    YouTube Data API v3 resumable upload          YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
//   facebook   Graph API /{page-id}/video_reels (file_url)   FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN
//   instagram  Graph API /{ig-user-id}/media REELS + publish INSTAGRAM_USER_ID, INSTAGRAM_TOKEN
//   tiktok     Content Posting API, FILE_UPLOAD direct post  TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN
//                                                            (+ TIKTOK_AUDITED=yes after TikTok's audit)
import { PostError } from './adapters.mjs';
import { trackedUrl } from '../distribution/copy.mjs';

export const VIDEO_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok'];
export const MAX_ATTEMPTS = 3;
const FINAL = new Set(['sent', 'failed', 'awaiting_approval']);

const redact = (text, env) => {
  let t = String(text || '').slice(0, 300);
  for (const v of Object.values(env || {})) if (typeof v === 'string' && v.length >= 8) t = t.split(v).join('[redacted]');
  return t;
};
async function apiError(platform, res, env) {
  let detail = '';
  try { const j = await res.json(); detail = j.error?.message || j.error?.code || j.error_description || j.message || ''; if (typeof detail !== 'string') detail = JSON.stringify(detail); } catch {}
  return new PostError(platform, `HTTP ${res.status}${detail ? ' ' + redact(detail, env) : ''}`, { status: res.status, retryable: res.status === 429 || res.status >= 500 });
}
const clip = (s, n) => { const a = [...String(s ?? '')]; return a.length <= n ? a.join('') : a.slice(0, n - 1).join('').replace(/\s+\S*$/, '') + '…'; };

/** The caption/description for a Short on a platform: headline, dek and a tracked link back to the story. */
export function videoCopy(story, platform) {
  const link = trackedUrl(story, platform);
  const dek = clip(story.dek, 300);
  if (platform === 'youtube') return { title: clip(story.title, 95), description: `${dek}\n\nRead the full story on Nuvellum: ${link}\n\n#Shorts #News` };
  if (platform === 'tiktok') return { title: clip(`${story.title} — read more on Nuvellum`, 150) };
  return { caption: `${story.title}\n\n${dek}\n\nRead the full story on Nuvellum: ${link}` };
}

// ---------- configuration and approval ----------

export const VIDEO_CREDENTIALS = {
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
  facebook: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_TOKEN'],
  instagram: ['INSTAGRAM_USER_ID', 'INSTAGRAM_TOKEN'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN']
};
export const configuredVideo = (platform, env) => VIDEO_CREDENTIALS[platform].every((k) => Boolean(env[k]));

/** A platform policy gate that only the platform can lift (not something Nuvellum can fix in code). */
export function externalApprovalBlock(platform, env) {
  if (platform === 'tiktok' && env.TIKTOK_AUDITED !== 'yes') return 'TikTok Content Posting API: public posting needs TikTok\'s app audit; unaudited apps may only post privately (set TIKTOK_AUDITED=yes once approved)';
  return null;
}

/**
 * What to do on each video platform for one verified Short.
 * @returns {{platform, action: 'post'|'record'|'keep', status?, reason?}[]}
 */
export function planVideo({ entry = {}, env = {}, verified }) {
  return VIDEO_PLATFORMS.map((platform) => {
    const prev = entry.platforms?.[platform];
    if (prev && FINAL.has(prev.status)) return { platform, action: 'keep' };
    if (!verified) return { platform, action: 'record', status: 'skipped', reason: 'Short not rendered and verified' };
    if (prev?.status === 'queued' && (prev.attempts || 0) >= MAX_ATTEMPTS) return { platform, action: 'record', status: 'failed', reason: `gave up after ${prev.attempts} attempts: ${prev.error || 'unknown error'}` };
    if (!configuredVideo(platform, env)) return { platform, action: 'record', status: 'blocked_credentials', reason: `needs ${VIDEO_CREDENTIALS[platform].join(', ')}` };
    const block = externalApprovalBlock(platform, env);
    if (block) return { platform, action: 'record', status: 'blocked_external_approval', reason: block };
    return { platform, action: 'post' };
  });
}

/** Outcome of an upload attempt → ledger patch. */
export function videoOutcome(prev = {}, result) {
  const attempts = (prev.attempts || 0) + 1;
  if (result.ok) {
    const base = { attempts, remoteId: result.remoteId || null, remoteUrl: result.remoteUrl || null, sentAt: result.at, error: undefined };
    return result.private
      ? { ...base, status: 'awaiting_approval', reason: result.reason || 'uploaded privately by the platform; make it public by hand' }
      : { ...base, status: 'sent', reason: null };
  }
  if (!result.retryable || attempts >= MAX_ATTEMPTS) return { status: 'failed', attempts, error: result.error, reason: result.retryable ? `gave up after ${attempts} attempts` : 'non-retryable API error' };
  return { status: 'queued', attempts, error: result.error, reason: 'will retry' };
}

// ---------- adapters ----------
// Each: post(story, { env, fetchImpl, video: { bytes (Buffer), url (public https URL), size } }) →
//   { remoteId, remoteUrl, private?, reason? }

export const youtube = {
  id: 'youtube',
  async post(story, { env, fetchImpl = fetch, video }) {
    const tok = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString()
    });
    if (!tok.ok) throw await apiError('youtube', tok, env);
    const { access_token } = await tok.json();
    const copy = videoCopy(story, 'youtube');
    const privacy = env.YOUTUBE_PRIVACY || 'public';
    const meta = { snippet: { title: copy.title, description: copy.description, categoryId: '25', tags: (story.tags || []).slice(0, 8) }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false } };
    const init = await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.size) }, body: JSON.stringify(meta)
    });
    if (!init.ok) throw await apiError('youtube', init, env);
    const location = init.headers.get('location');
    if (!location) throw new PostError('youtube', 'no resumable upload URL returned', { retryable: true });
    const up = await fetchImpl(location, { method: 'PUT', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(video.size) }, body: video.bytes });
    if (!up.ok) throw await apiError('youtube', up, env);
    const v = await up.json();
    // Videos uploaded through an API project YouTube has not audited are locked to private, whatever was asked.
    const actual = v.status?.privacyStatus || privacy;
    const isPrivate = privacy === 'public' && actual !== 'public';
    return { remoteId: v.id, remoteUrl: v.id ? `https://www.youtube.com/shorts/${v.id}` : null, private: isPrivate, reason: isPrivate ? `uploaded as ${actual}: YouTube restricts uploads from unaudited API projects (request the API compliance audit)` : null };
  }
};

const GRAPH = (env) => `https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION || 'v23.0'}`;

export const facebook = {
  id: 'facebook',
  async post(story, { env, fetchImpl = fetch, video }) {
    const base = `${GRAPH(env)}/${encodeURIComponent(env.FACEBOOK_PAGE_ID)}/video_reels`;
    const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...o, access_token: env.FACEBOOK_PAGE_TOKEN }).toString() });
    const start = await fetchImpl(base, form({ upload_phase: 'start' }));
    if (!start.ok) throw await apiError('facebook', start, env);
    const { video_id, upload_url } = await start.json();
    if (!video_id || !upload_url) throw new PostError('facebook', 'no upload session returned', { retryable: true });
    const up = await fetchImpl(upload_url, { method: 'POST', headers: { Authorization: `OAuth ${env.FACEBOOK_PAGE_TOKEN}`, file_url: video.url } });
    if (!up.ok) throw await apiError('facebook', up, env);
    const fin = await fetchImpl(base, form({ upload_phase: 'finish', video_id, video_state: 'PUBLISHED', description: videoCopy(story, 'facebook').caption }));
    if (!fin.ok) throw await apiError('facebook', fin, env);
    const j = await fin.json();
    if (j.success === false) throw new PostError('facebook', 'Reel publish not accepted', { retryable: false });
    return { remoteId: String(video_id), remoteUrl: `https://www.facebook.com/reel/${video_id}` };
  }
};

export const instagram = {
  id: 'instagram',
  async post(story, { env, fetchImpl = fetch, video, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = 5000, polls = 36 }) {
    const user = `${GRAPH(env)}/${encodeURIComponent(env.INSTAGRAM_USER_ID)}`;
    const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...o, access_token: env.INSTAGRAM_TOKEN }).toString() });
    const created = await fetchImpl(`${user}/media`, form({ media_type: 'REELS', video_url: video.url, caption: videoCopy(story, 'instagram').caption, share_to_feed: 'true' }));
    if (!created.ok) throw await apiError('instagram', created, env);
    const { id } = await created.json();
    for (let i = 0; i < polls; i++) {
      const s = await fetchImpl(`${GRAPH(env)}/${encodeURIComponent(id)}?fields=status_code&access_token=${encodeURIComponent(env.INSTAGRAM_TOKEN)}`);
      if (!s.ok) throw await apiError('instagram', s, env);
      const { status_code } = await s.json();
      if (status_code === 'FINISHED') break;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new PostError('instagram', `media container ${status_code}`, { retryable: false });
      if (i === polls - 1) throw new PostError('instagram', 'media container still processing', { retryable: true });
      await sleep(pollMs);
    }
    const pub = await fetchImpl(`${user}/media_publish`, form({ creation_id: id }));
    if (!pub.ok) throw await apiError('instagram', pub, env);
    const media = (await pub.json()).id;
    return { remoteId: String(media || ''), remoteUrl: null };
  }
};

export const tiktok = {
  id: 'tiktok',
  async post(story, { env, fetchImpl = fetch, video }) {
    const tok = await fetchImpl('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: env.TIKTOK_REFRESH_TOKEN }).toString()
    });
    if (!tok.ok) throw await apiError('tiktok', tok, env);
    const { access_token } = await tok.json();
    if (!access_token) throw new PostError('tiktok', 'token refresh returned no access token (refresh token expired?)', { retryable: false });
    const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json; charset=UTF-8' };
    const info = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: auth });
    if (!info.ok) throw await apiError('tiktok', info, env);
    const creator = (await info.json()).data || {};
    const privacy = (creator.privacy_level_options || []).includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : null;
    if (!privacy) throw new PostError('tiktok', 'account cannot post publicly through the API', { retryable: false });
    const init = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ post_info: { title: videoCopy(story, 'tiktok').title, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: 'FILE_UPLOAD', video_size: video.size, chunk_size: video.size, total_chunk_count: 1 } })
    });
    if (!init.ok) throw await apiError('tiktok', init, env);
    const d = (await init.json()).data || {};
    const up = await fetchImpl(d.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(video.size), 'Content-Range': `bytes 0-${video.size - 1}/${video.size}` }, body: video.bytes });
    if (!up.ok) throw await apiError('tiktok', up, env);
    return { remoteId: String(d.publish_id || ''), remoteUrl: null };
  }
};

export const VIDEO_ADAPTERS = { youtube, facebook, instagram, tiktok };

/**
 * Distribute one verified Short. Platforms run one after another, each isolated in its own try/catch,
 * and the entry is saved after every attempt so a crash can never cause a duplicate upload.
 */
export async function distributeShort({ story, entry, env, verified, video, live, adapters = VIDEO_ADAPTERS, fetchImpl = fetch, now = Date.now(), save = () => {} }) {
  const lines = [];
  const stamp = new Date(now).toISOString();
  let e = { ...entry, platforms: { ...(entry.platforms || {}) } };
  for (const step of planVideo({ entry: e, env, verified })) {
    const prev = e.platforms[step.platform] || {};
    if (step.action === 'keep') continue;
    if (step.action === 'record') {
      if (prev.status !== step.status || prev.reason !== step.reason) e.platforms[step.platform] = { ...prev, status: step.status, reason: step.reason, updatedAt: stamp };
      lines.push(`${story.slug} ${step.platform}: ${step.status} (${step.reason})`);
      continue;
    }
    if (!live) { lines.push(`${story.slug} ${step.platform}: would upload (dry run)`); continue; }
    let result;
    try { result = { ok: true, at: stamp, ...(await adapters[step.platform].post(story, { env, fetchImpl, video })) }; }
    catch (err) { result = { ok: false, retryable: err instanceof PostError ? err.retryable : true, error: err instanceof PostError ? err.message : `${step.platform}: ${err.name || 'Error'}` }; }
    const patch = videoOutcome(prev, result);
    const next = { ...prev, ...patch, updatedAt: stamp };
    if (patch.error === undefined) delete next.error;
    e.platforms[step.platform] = next;
    lines.push(`${story.slug} ${step.platform}: ${next.status}${next.error ? ` (${next.error})` : next.reason ? ` (${next.reason})` : ''}`);
    save(e);
  }
  return { entry: e, lines };
}
