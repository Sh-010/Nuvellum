// What happens around an automatic publication, kept pure so it can be tested:
//  - the daily publication cap that keeps unattended publishing inside the Vercel Hobby deployment budget
//    (every published story is one production build; the plan allows 100 deployments a day), and
//  - which stories still need branded social cards on the social-assets branch.

export const DEFAULT_DAILY_CAP = 24;
// Hourly cadence: one automatic publication per hourly slot. Another may merge once the previous merge is at
// least MIN_GAP_MINUTES old. Not a strict 60: the gate runs when each hourly newsroom push lands (a few minutes
// past the hour, with drift), so a strict rolling hour skipped every other slot.
export const HOURLY_CAP = 1;
export const MIN_GAP_MINUTES = 50;
const GAP = MIN_GAP_MINUTES * 60000;
const HOUR = 3600000;
const DAY = 86400000;

/** The cap from the repository variable; anything unusable falls back to the default, never "unlimited". */
export function dailyCap(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n : DEFAULT_DAILY_CAP;
}

/** Automatic publications (merged incoming/** PRs) in the 24 hours before `now`. */
export function publishedInLastDay(pulls = [], now = Date.now()) {
  return pulls.filter((pr) => String(pr?.head?.ref || '').startsWith('incoming/') && pr.merged_at && now - Date.parse(pr.merged_at) < DAY).length;
}

/** How many more stories may be merged within the daily cap (0 = hold until the window frees up). */
export function remainingToday(pulls, cap, now = Date.now()) {
  return Math.max(0, cap - publishedInLastDay(pulls, now));
}

/** Automatic publications (merged incoming/** PRs) within the minimum gap before `now`. */
export function publishedInLastHour(pulls = [], now = Date.now()) {
  return pulls.filter((pr) => String(pr?.head?.ref || '').startsWith('incoming/') && pr.merged_at && now - Date.parse(pr.merged_at) < GAP).length;
}

/** How many stories may be merged right now: the hourly-slot limit and the rolling daily cap both apply. */
export function remainingNow(pulls, cap, now = Date.now()) {
  return Math.min(remainingToday(pulls, cap, now), Math.max(0, HOURLY_CAP - publishedInLastHour(pulls, now)));
}

// Freshness: Nuvellum publishes the newest approved story first, so an ordinary news candidate that waits
// too long would never publish and only grow the queue. Time-sensitive candidates (News, or anything flagged
// breaking/developing) that have waited more than STALE_HOURS are closed as stale; their branch and article are
// kept. Long-life formats (Explainer, Analysis, Review, Essay, Opinion, Ideas) do not expire this way.
export const STALE_HOURS = 6;
const TIME_SENSITIVE_TYPES = new Set(['news', 'breaking', 'developing']);

/** Whether a candidate's article is time-sensitive news (from its frontmatter). */
export function isTimeSensitive(data = {}) {
  const tags = (Array.isArray(data.tags) ? data.tags : []).map((t) => String(t).toLowerCase());
  return TIME_SENSITIVE_TYPES.has(String(data.type || '').trim().toLowerCase())
    || data.breaking === true || data.developing === true
    || tags.includes('breaking') || tags.includes('developing')
    || /^(breaking|developing)$/i.test(String(data.status_label || ''));
}

/** The stale reason for an open candidate, or null if it may still publish. */
export function staleReason({ createdAt, data, now = Date.now() }) {
  const hours = (now - Date.parse(createdAt || '')) / HOUR;
  if (!Number.isFinite(hours) || hours <= STALE_HOURS || !isTimeSensitive(data)) return null;
  return `stale: ${String(data.type || 'News')} candidate waited ${Math.floor(hours)}h without publication (limit ${STALE_HOURS}h); newer news took priority`;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs the card workflow should render: those requested explicitly, plus any story published in the last
 * `hours` that has no card set on social-assets yet. The sweep makes the workflow self-healing: a dispatch
 * GitHub dropped (a newer pending run replaces an older one in the same concurrency group) is picked up by
 * the next run instead of leaving a story without cards.
 * @param {object} o
 * @param {string[]} o.requested       slugs from the dispatch input / request file
 * @param {{slug, data}[]} o.articles  published articles on main
 * @param {Set<string>} o.haveCards    slugs that already have cards/<slug>/manifest.json on social-assets
 * @returns {string[]}
 */
export function cardSlugs({ requested = [], articles = [], haveCards = new Set(), now = Date.now(), hours = 48, max = 6 }) {
  const out = [];
  const known = new Set(articles.map((a) => a.slug));
  for (const s of requested) if (SLUG.test(s) && known.has(s) && !out.includes(s)) out.push(s);
  const recent = articles
    .filter((a) => a.data?.status === 'published' && !haveCards.has(a.slug) && !out.includes(a.slug))
    .map((a) => ({ slug: a.slug, at: Date.parse(a.data.publishedAt || `${a.data.date}T12:00:00Z`) }))
    .filter((a) => Number.isFinite(a.at) && now - a.at < hours * 3600000)
    .sort((a, b) => b.at - a.at);
  for (const a of recent) { if (out.length >= max) break; out.push(a.slug); }
  return out;
}
