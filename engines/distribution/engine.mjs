// Distribution engine: published article -> grounded platform copy -> adapters,
// with per-platform isolation, retries, idempotency and a ledger.
// It NEVER throws for a platform failure: one platform failing cannot affect
// the others, and nothing here can affect article publication.
import { join } from 'node:path';
import { ADAPTERS } from './adapters/index.mjs';
import { PLATFORMS } from './platforms.mjs';
import { generateCopy } from './copy.mjs';
import { Ledger } from './ledger.mjs';
import { REPO_ROOT } from '../shared/article.mjs';

export const DEFAULT_LEDGER = join(REPO_ROOT, 'engines', '.state', 'distribution-ledger.jsonl');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function postFor(platform, value, story, media) {
  switch (PLATFORMS[platform].kind) {
    case 'link': return { ...value };
    case 'image': return { text: value, imageUrl: media.imageUrl };
    case 'video': return platform === 'youtube' ? { ...value, videoPath: media.videoPath } : { text: value, videoPath: media.videoPath };
    default: return { text: value };
  }
}

function missingMedia(platform, media) {
  const kind = PLATFORMS[platform].kind;
  if (kind === 'image' && !media.imageUrl) return 'needs a publicly hosted JPEG (imageUrl)';
  if (kind === 'video' && !media.videoPath) return 'needs a rendered video (run the Shorts engine)';
  return null;
}

/**
 * @param {object} story   from loadStory()
 * @param {object} opts    { env, live, platforms, media: {imageUrl, videoPath}, ledgerFile, maxAttempts, retryDelayMs }
 */
export async function distribute(story, opts = {}) {
  const env = opts.env || process.env;
  const live = Boolean(opts.live);
  const platforms = opts.platforms || Object.keys(PLATFORMS);
  const media = opts.media || {};
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  const ledger = new Ledger(opts.ledgerFile || DEFAULT_LEDGER);
  const state = ledger.state();

  const { copy, source, notes } = await generateCopy(story, { env, platforms });
  const results = [];

  for (const platform of platforms) {
    const key = `${story.slug}:${platform}`;
    const prev = state.get(key);
    const base = { slug: story.slug, platform };
    try {
      if (prev?.status === 'posted') { results.push({ ...base, status: 'already-posted', remoteId: prev.remoteId }); continue; }
      if (prev?.status === 'dead-letter') { results.push({ ...base, status: 'dead-letter', error: prev.error }); continue; }
      if (!copy[platform]) { results.push({ ...base, status: 'skipped', reason: 'no copy passed checks' }); continue; }
      const adapter = ADAPTERS[platform];
      const need = missingMedia(platform, media);
      if (!live) { results.push({ ...base, status: 'dry-run', copy: copy[platform], copySource: source[platform], configured: adapter.isConfigured(env), mediaMissing: need }); continue; }
      if (!adapter.isConfigured(env)) { results.push({ ...base, status: 'disabled', reason: `set ${adapter.env.join(', ')}` }); continue; }
      if (need) { results.push({ ...base, status: 'skipped', reason: need }); continue; }

      let lastErr;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const r = await adapter.publish(postFor(platform, copy[platform], story, media), env);
          ledger.record({ ...base, status: 'posted', remoteId: r.remoteId, url: r.url, copySource: source[platform] });
          results.push({ ...base, status: 'posted', ...r, attempts: attempt });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (!err.retryable || attempt === maxAttempts) break;
          await sleep(retryDelayMs * 2 ** (attempt - 1));
        }
      }
      if (lastErr) {
        const total = (prev?.attempts || 0) + 1;
        const status = total >= (opts.maxRuns ?? 5) || lastErr.retryable === false && lastErr.status && lastErr.status < 500 && lastErr.status !== 429 ? 'dead-letter' : 'failed';
        ledger.record({ ...base, status, error: String(lastErr.message).slice(0, 300) });
        results.push({ ...base, status, error: String(lastErr.message).slice(0, 300) });
      }
    } catch (err) {
      // Defensive: an unexpected bug in one platform must not stop the others.
      results.push({ ...base, status: 'error', error: String(err.message).slice(0, 300) });
    }
  }
  return { slug: story.slug, live, notes, results };
}
