// What happens around an automatic publication, kept pure so it can be tested:
//  - the daily publication cap that keeps unattended publishing inside the Vercel Hobby deployment budget
//    (every published story is one production build; the plan allows 100 deployments a day), and
//  - which stories still need branded social cards on the social-assets branch.

export const DEFAULT_DAILY_CAP = 24;
// Hourly cadence: at most one automatic publication in any rolling hour. Further approved stories stay open
// and are reconsidered on the next sweep (every gate run sweeps all open incoming PRs).
export const HOURLY_CAP = 1;
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

/** Automatic publications (merged incoming/** PRs) in the rolling hour before `now`. */
export function publishedInLastHour(pulls = [], now = Date.now()) {
  return pulls.filter((pr) => String(pr?.head?.ref || '').startsWith('incoming/') && pr.merged_at && now - Date.parse(pr.merged_at) < HOUR).length;
}

/** How many stories may be merged right now: the rolling-hour limit and the rolling daily cap both apply. */
export function remainingNow(pulls, cap, now = Date.now()) {
  return Math.min(remainingToday(pulls, cap, now), Math.max(0, HOURLY_CAP - publishedInLastHour(pulls, now)));
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
