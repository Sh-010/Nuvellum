// One story through the social publisher: plan, render cards if something is about to be posted to an image
// platform, post, record. Pure apart from the injected functions, so every path is testable without network.
import { planStory, record, outcome } from './plan.mjs';
import { IMAGE_PLATFORMS } from './assets.mjs';
import { PostError } from './adapters.mjs';

// A card that fails to render is retried on the next run. If it still cannot be rendered after CARD_RETRIES,
// the social post is failed closed rather than silently downgrading to a raw article photo/text post. Nuvellum
// should never trade brand quality for "something got posted".
export const CARD_RETRIES = 2;

/**
 * @param {object} o
 * @param {object} o.story            loadStory() result
 * @param {object} o.entry            ledger entry (or a fresh one)
 * @param {object} o.env              process env (credentials, NUVELLUM_SOCIAL)
 * @param {boolean} o.live            post for real (else dry run)
 * @param {boolean} o.storyIsLive     the article answers 200 on the site
 * @param {boolean} [o.renderInDryRun] dry run: still render and verify the cards (no posting)
 * @param {Function} o.prepareAssets  (story) => Promise<{ok, forPlatform?, png?, error?}>
 * @param {object} o.adapters         platform adapters
 * @param {object} o.copy             per-platform feed copy
 * @param {string} o.siteUrl
 * @param {number} o.now
 * @param {Function} [o.save]         persist the entry (called after every post)
 * @returns {Promise<{ entry, lines: string[], rendered: boolean, assets: object|null }>}
 */
export async function processStory(o) {
  const { story, env, live, storyIsLive, prepareAssets, adapters, copy, siteUrl, now, save = () => {} } = o;
  let entry = o.entry;
  const lines = [];
  const plan = planStory({ ledger: entry, env, live: storyIsLive, hasShort: o.hasShort });
  const posts = plan.filter((s) => s.action === 'post');
  let assets = null, rendered = false;
  if (posts.some((s) => IMAGE_PLATFORMS.has(s.platform)) && (live || o.renderInDryRun)) {
    assets = await prepareAssets(story);
    rendered = true;
    entry = { ...entry, cards: assets.ok
      ? { status: 'rendered', at: new Date(now).toISOString(), variant: assets.manifest?.variant ?? null, formats: Object.keys(assets.png || {}) }
      : { status: 'failed', at: new Date(now).toISOString(), error: assets.error } };
    lines.push(`${story.slug} cards: ${assets.ok ? `rendered and verified (${Object.keys(assets.png).join(', ')})` : assets.error}`);
  }
  for (const step of plan) {
    if (step.action === 'keep') continue;
    if (step.action === 'record') {
      const prev = entry.platforms[step.platform];
      if (prev?.status !== step.status || prev?.reason !== step.reason) entry = record(entry, step.platform, { status: step.status, reason: step.reason }, now);
      continue;
    }
    const platform = step.platform;
    const prev = entry.platforms[platform] || {};
    let useAssets = {};
    if (IMAGE_PLATFORMS.has(platform) && assets) {
      if (assets.ok) useAssets = assets.forPlatform;
      else {
        const failures = (prev.cardFailures || 0) + 1;
        const terminal = failures >= CARD_RETRIES;
        entry = record(entry, platform, {
          status: terminal ? 'failed' : 'queued',
          cardFailures: failures,
          error: assets.error,
          reason: terminal ? 'card rendering failed repeatedly; post blocked to protect presentation quality' : 'card rendering failed; will retry'
        }, now);
        if (live) save(entry);
        lines.push(`${story.slug} ${platform}: ${terminal ? 'blocked' : 'held'} (${assets.error})`);
        continue;
      }
    }
    if (!live) {
      lines.push(`${story.slug} ${platform}: would post (dry run)${useAssets[platform] ? ` with ${useAssets[platform]}` : ''}`);
      continue;
    }
    let result;
    try {
      const r = await adapters[platform].post(story, { env, siteUrl, copy, assets: useAssets });
      result = { ok: true, at: new Date(now).toISOString(), ...r };
    } catch (e) {
      result = { ok: false, retryable: e instanceof PostError ? e.retryable : true, error: e instanceof PostError ? e.message : `${platform}: ${e.name || 'Error'}` };
    }
    const patch = outcome(prev, result);
    entry = record(entry, platform, patch, now);
    save(entry); // after every post, so a later crash cannot cause a duplicate on the next run
  }
  return { entry, lines, rendered, assets };
}

/**
 * What a run may touch. Scheduled runs scan the publication window; manual runs must name one slug, and only
 * an explicit bulk opt-in lets a manual run scan the window (an empty manual slug once bulk-posted several
 * stories). Anything else is refused before any network call or ledger change. A missing trigger counts as
 * manual, so the safe behaviour is the default.
 * @returns {{ mode: 'window' | 'slug' | 'refuse', message?: string }}
 */
export function runScope({ trigger = 'manual', slug = '', bulk = false }) {
  if (slug) return { mode: 'slug' };
  if (trigger === 'schedule') return { mode: 'window' };
  if (bulk === true) return { mode: 'window' };
  return { mode: 'refuse', message: 'Manual run without a slug: nothing was posted and the ledger is unchanged. Give a slug, or set bulk=true to deliberately process every eligible story in the window.' };
}

/** Whether a run needs the card renderer (and so Chromium): some image platform is about to be posted to. */
export function needsCards({ entry, env, storyIsLive }) {
  return planStory({ ledger: entry, env, live: storyIsLive }).some((s) => s.action === 'post' && IMAGE_PLATFORMS.has(s.platform));
}


/**
 * Pick at most one story for an unattended scheduled social run.
 * Retry an already-queued story first so transient failures are cleared, then prefer the newest
 * newly-published actionable story. This prevents a scheduler run from dumping the whole 48h window.
 */
export function chooseScheduledCandidate(items = []) {
  const actionable = items.filter((item) => item?.actionable);
  actionable.sort((a, b) => {
    const aq = a.hasQueued ? 1 : 0;
    const bq = b.hasQueued ? 1 : 0;
    if (aq !== bq) return bq - aq;
    const at = Number(a.reachedMain || 0);
    const bt = Number(b.reachedMain || 0);
    if (at !== bt) return bt - at;
    return String(a.slug || '').localeCompare(String(b.slug || ''));
  });
  return actionable[0]?.slug || null;
}
