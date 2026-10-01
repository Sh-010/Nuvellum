// Shorts autopilot: which published story becomes the next Short, and whether a render is good enough to
// distribute. Pure (no I/O) so every rule is tested; engines/shorts/autopilot-cli.mjs does the I/O.
//
// The short ledger lives on the social-ledger branch as shorts/<slug>.json:
//   { slug, title, risk, firstSeenAt, updatedAt,
//     render: { status: 'rendered' | 'failed' | 'skipped', failures, error, at, seconds, tts, assets },
//     platforms: { youtube|facebook|instagram|tiktok: { status, reason, attempts, remoteId, remoteUrl, ... } } }
// A slug with a rendered Short is never rendered again; a failed render is retried until MAX_RENDER_FAILURES.
import { extractiveScript, verifyScript, scriptSeconds, MIN_SECONDS, MAX_SECONDS } from './script.mjs';

export const HUMAN_LED = new Set(['Opinion', 'Essay', 'Ideas', 'Review']);
export const WINDOW_HOURS = 72;
export const MAX_RENDER_FAILURES = 2;
export const DAILY_MAX = 2;
const HOUR = 3600000;

// Sections whose stories carry naturally in short vertical video. Others are allowed, just ranked lower.
const SECTION_WEIGHT = { Science: 10, Technology: 10, 'Film & TV': 10, Gaming: 10, Anime: 8, Culture: 8, Sports: 8, World: 6, Business: 5 };

/**
 * Whether a published story should become a Short, with the reasons and a deterministic score.
 * Excluded by design:
 * - human-led formats (Opinion/Essay/Ideas/Review);
 * - sensitive stories (never automatic);
 * - breaking/developing stories (an extractive video goes stale as facts move);
 * - anything older than WINDOW_HOURS;
 * - stories whose article text cannot yield a verified, verbatim 20-45s script with at least two supporting
 *   lines.
 */
export function shortEligibility(story, { now = Date.now() } = {}) {
  const reasons = [];
  if (story.section === 'Opinion' || HUMAN_LED.has(story.type)) reasons.push('human-led format');
  if (story.risk !== 'low') reasons.push(`risk is "${story.risk}"; Shorts are automatic only for low-risk stories`);
  if (story.live) reasons.push(`${story.live} story; facts may still change`);
  const at = Date.parse(story.publishedAt || '');
  const hours = (now - at) / HOUR;
  if (!Number.isFinite(at)) reasons.push('no publication time');
  else if (hours > WINDOW_HOURS) reasons.push(`published ${Math.round(hours)}h ago (window ${WINDOW_HOURS}h)`);
  let seconds = 0, beats = 0;
  try {
    const script = extractiveScript(story);
    const problems = verifyScript(script, story);
    seconds = scriptSeconds(script);
    beats = script.lines.filter((l) => l.role === 'beat').length;
    if (problems.length) reasons.push(`script: ${problems.join('; ')}`);
    if (beats < 2) reasons.push(`only ${beats} supporting line(s) in the article`);
    if (seconds < MIN_SECONDS) reasons.push(`script runs ${seconds.toFixed(1)}s (minimum ${MIN_SECONDS}s)`);
  } catch (err) {
    reasons.push(`script: ${err.message}`);
  }
  const visual = story.mediaMode === 'photo' ? 25 : story.mediaMode === 'illustration' ? 12 : 0;
  const recency = Number.isFinite(hours) ? Math.max(0, 30 - Math.max(0, hours) / 2.4) : 0;
  const length = seconds >= 28 && seconds <= MAX_SECONDS ? 5 : 0;
  const score = Math.round((recency + visual + (SECTION_WEIGHT[story.section] || 3) + length) * 10) / 10;
  return { eligible: reasons.length === 0, reasons, score, seconds: Math.round(seconds * 10) / 10, beats };
}

/** Whether a ledger entry blocks a new render of its story, or makes it a retry. */
export function ledgerState(entry, now = Date.now()) {
  const r = entry?.render;
  if (!r) return 'new';
  if (r.status === 'rendered') return 'done';
  if (r.status === 'skipped') return 'done';
  if (r.status === 'failed') return (r.failures || 0) >= MAX_RENDER_FAILURES ? 'done' : 'retry';
  if (r.status === 'rendering') return now - Date.parse(r.at || 0) > 2 * HOUR ? 'retry' : 'busy'; // a crashed run
  return 'new';
}

/**
 * The one story to render now, or null with the reason.
 * @param {{story, eligibility}[]} candidates  published stories with shortEligibility() results
 * @param {object[]} ledger                    short ledger entries
 */
export function chooseShort(candidates, ledger, { now = Date.now(), dailyMax = DAILY_MAX } = {}) {
  const bySlug = new Map(ledger.map((e) => [e.slug, e]));
  const renderedToday = ledger.filter((e) => e.render?.status === 'rendered' && now - Date.parse(e.render.at || 0) < 24 * HOUR).length;
  if (renderedToday >= dailyMax) return { slug: null, reason: `daily limit reached (${renderedToday}/${dailyMax} in 24h)` };
  if (ledger.some((e) => ledgerState(e, now) === 'busy')) return { slug: null, reason: 'another render is in progress' };
  const pool = candidates
    .filter((c) => c.eligibility.eligible)
    .map((c) => ({ ...c, state: ledgerState(bySlug.get(c.story.slug), now) }))
    .filter((c) => c.state === 'new' || c.state === 'retry')
    .sort((a, b) => (a.state === 'retry') !== (b.state === 'retry') ? (a.state === 'retry' ? -1 : 1)
      : b.eligibility.score - a.eligibility.score || String(a.story.slug).localeCompare(String(b.story.slug)));
  if (!pool.length) return { slug: null, reason: 'no eligible story without a Short' };
  return { slug: pool[0].story.slug, retry: pool[0].state === 'retry', score: pool[0].eligibility.score, reason: pool[0].state === 'retry' ? 'retrying a failed render' : 'highest-scoring eligible story' };
}

/**
 * Whether a rendered Short may be distributed. Every check is about the actual files:
 * @param {object} o
 * @param {object} o.report     report.json from the engine
 * @param {object} o.script     script.json from the engine
 * @param {object} o.story      the published story (for the verbatim re-check)
 * @param {object} o.probe      { width, height, videoCodec, audioCodec, duration } from ffprobe
 * @param {object} o.sizes      byte sizes of short.mp4, poster.jpg, captions.srt, script.json, plan.json, report.json
 * @param {string} [o.voice]    required narration provider (default 'piper')
 */
export function verifyShort({ report, script, story, probe, sizes, voice = 'piper' }) {
  const problems = [];
  if (report?.status !== 'rendered') problems.push(`engine status is "${report?.status}"`);
  if (report?.tts !== voice) problems.push(`narration is "${report?.tts}", not ${voice} (no silent or robotic fallback is published)`);
  if (probe?.width !== 1080 || probe?.height !== 1920) problems.push(`video is ${probe?.width}x${probe?.height}, not 1080x1920`);
  if (probe?.videoCodec !== 'h264') problems.push(`video codec is ${probe?.videoCodec}, not h264`);
  if (probe?.audioCodec !== 'aac') problems.push(`audio codec is ${probe?.audioCodec || 'missing'}, not aac`);
  const d = Number(probe?.duration);
  if (!(d >= 15 && d <= 60)) problems.push(`duration ${Number.isFinite(d) ? d.toFixed(1) : '?'}s is outside 15-60s`);
  const min = { 'short.mp4': 200_000, 'poster.jpg': 5_000, 'captions.srt': 50, 'script.json': 50, 'plan.json': 50, 'report.json': 50 };
  for (const [f, n] of Object.entries(min)) if (!((sizes?.[f] || 0) >= n)) problems.push(`${f} is missing or too small`);
  // No invented claims: every spoken line must still be verbatim text of the published article.
  if (!script?.lines?.length) problems.push('script has no lines');
  else for (const p of verifyScript(script, story)) problems.push(`script: ${p}`);
  return problems;
}
