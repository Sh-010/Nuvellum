// What should happen to one story on each platform, given its ledger entry. Pure; no I/O.
//
// Statuses recorded per platform:
//   queued             waiting (the story is not live on the site yet, or a retryable failure will be retried)
//   sent               posted; never posted again
//   failed             gave up (non-retryable API error, or MAX_ATTEMPTS reached)
//   skipped            not posted: platform not configured / no adapter / video-only; re-evaluated each run
//   awaiting_approval  prepared, needs a human (TikTok uploads, Shorts once a video exists)
import { ADAPTERS, xHasCredentials } from './adapters.mjs';

export const MAX_ATTEMPTS = 3;
export const WINDOW_HOURS = 48;
export const AUTO = ['telegram', 'facebook', 'linkedin', 'x', 'instagram', 'threads'];
// Video-only platforms: Shorts reach them through the Shorts autopilot and its own ledger (engines/publish/video.mjs).
export const MANUAL = { youtube: 'video platform: Shorts are distributed by the Shorts autopilot', tiktok: 'video platform: Shorts are distributed by the Shorts autopilot' };
export const ALL_PLATFORMS = [...AUTO, ...Object.keys(MANUAL)];
const FINAL = new Set(['sent', 'failed']);

/**
 * @returns {{platform, action: 'post'|'record'|'keep', status?, reason?}[]}
 */
export function planStory({ ledger = {}, env = {}, live, hasShort = false }) {
  const out = [];
  for (const platform of ALL_PLATFORMS) {
    const prev = ledger.platforms?.[platform];
    if (prev && FINAL.has(prev.status)) { out.push({ platform, action: 'keep' }); continue; }
    if (prev?.status === 'queued' && (prev.attempts || 0) >= MAX_ATTEMPTS) { out.push({ platform, action: 'record', status: 'failed', reason: `gave up after ${prev.attempts} attempts: ${prev.error || 'unknown error'}` }); continue; }
    if (platform in MANUAL) { out.push({ platform, action: 'record', status: 'skipped', reason: MANUAL[platform] }); continue; }
    if (!ADAPTERS[platform].configured(env)) {
      const reason = platform === 'x' && xHasCredentials(env) ? 'paid API (about $0.20 per linked post): needs budget approval' : 'not configured';
      out.push({ platform, action: 'record', status: 'skipped', reason });
      continue;
    }
    if (!live) { out.push({ platform, action: 'record', status: 'queued', reason: 'waiting for the story to be live' }); continue; }
    out.push({ platform, action: 'post' });
  }
  return out;
}

/** Apply one outcome to a ledger entry (returns a new entry). */
export function record(entry, platform, patch, now) {
  const prev = entry.platforms?.[platform] || {};
  const next = { ...prev, ...patch, updatedAt: new Date(now).toISOString() };
  if (patch.status !== 'queued' && patch.status !== 'failed') delete next.error;
  return { ...entry, platforms: { ...(entry.platforms || {}), [platform]: next } };
}

/** Outcome of a post attempt → ledger patch. */
export function outcome(prev = {}, result) {
  const attempts = (prev.attempts || 0) + 1;
  if (result.ok) return { status: 'sent', attempts, sentAt: result.at, remoteId: result.remoteId || null, remoteUrl: result.remoteUrl || null, kind: result.kind || null, reason: null };
  if (!result.retryable || attempts >= MAX_ATTEMPTS) return { status: 'failed', attempts, error: result.error, reason: result.retryable ? `gave up after ${attempts} attempts` : 'non-retryable API error' };
  return { status: 'queued', attempts, error: result.error, reason: 'will retry' };
}
