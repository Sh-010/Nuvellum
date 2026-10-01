// Owner alerts: which conditions genuinely need the owner, and how each one is announced. Pure: the caller
// (scripts/owner-alerts.mjs) fetches the data and delivers the result. Nothing here sends "all is well";
// an alert is raised when a condition starts, reminded at most once a day while it lasts, and closed when
// it clears.

const HOUR = 3600000;

/** Workflows whose repeated failure needs a person. Two consecutive failed runs = an alert. */
export const WATCHED_WORKFLOWS = [
  'Auto-publish verified editorial stories',
  'Social publish',
  'Publish social card assets',
  'Shorts autopilot',
  'Send Nuvellum Brief'
];
export const STUCK_PR_HOURS = 6;
export const NEWSROOM_STALL_HOURS = 12;
export const RECENT_HOURS = 36;
export const REMIND_HOURS = 24;

const AUTH_RE = /HTTP 40[13]\b|unauthori[sz]ed|invalid[_ ]?token|expired|OAuthException|forbidden|bot was kicked|not enough rights/i;

/**
 * @param {object} s
 * @param {number} s.now
 * @param {boolean} s.autopublish
 * @param {Array|null} s.runs          workflow runs on main, newest first ({name, status, conclusion, html_url, created_at}); null = unavailable
 * @param {Array|null} s.pulls         open PRs; null = unavailable
 * @param {string|null} s.latestAutomatedAt  publishedAt of the newest automated story on main
 * @param {string|null} s.smoke        outcome of the production smoke step ('success' | 'failure' | ...)
 * @param {object|null} s.deploy       newest decisive Vercel status on main: {sha, state, description, createdAt}; null = unknown
 * @param {Array|null} s.social        social ledger entries; null = unavailable
 * @param {Array|null} s.shorts        short ledger entries; null = unavailable
 * @returns {{ alerts: {key, title, body}[], unknown: string[] }}  unknown: key prefixes whose data was unavailable
 */
export function evaluateAlerts(s) {
  const alerts = [];
  const unknown = [];
  const add = (key, title, body) => alerts.push({ key, title, body });
  const age = (iso) => (iso ? (s.now - Date.parse(iso)) / HOUR : Infinity);

  if (s.smoke === 'failure') add('production-smoke', 'Production smoke test failing', 'The live-site smoke test failed on www.nuvellum.news (routes, sitemap, RSS, robots, article pages or images). Open the observability run for the failing check.');

  if (s.runs === null) unknown.push('workflow:');
  else {
    for (const name of WATCHED_WORKFLOWS) {
      const done = s.runs.filter((r) => r.name === name && r.status === 'completed' && !['cancelled', 'skipped'].includes(r.conclusion));
      if (done.length >= 2 && done[0].conclusion === 'failure' && done[1].conclusion === 'failure') {
        add(`workflow:${name}`, `"${name}" keeps failing`, `The last two runs of **${name}** failed. Latest: ${done[0].html_url}`);
      }
    }
    const build = s.runs.find((r) => r.name === 'Build Nuvellum' && r.status === 'completed' && r.conclusion !== 'cancelled');
    if (build && build.conclusion === 'failure') add('workflow:Build Nuvellum', 'Build failing on main', `The latest **Build Nuvellum** run on main failed, so new stories cannot deploy. ${build.html_url}`);
  }

  if (s.pulls === null) unknown.push('stuck-incoming', 'newsroom-stalled');
  else {
    const held = new Set(['hold', 'do-not-publish', 'needs-human']);
    const incoming = s.pulls.filter((p) => String(p.head?.ref || '').startsWith('incoming/'));
    if (s.autopublish) {
      const stuck = incoming.filter((p) => !(p.labels || []).some((l) => held.has(String(l.name || l).toLowerCase())) && age(p.created_at) > STUCK_PR_HOURS);
      if (stuck.length) add('stuck-incoming', `${stuck.length} newsroom PR(s) not publishing`, `These incoming PRs have been open more than ${STUCK_PR_HOURS}h without a hold label, so the publication gate keeps declining them (a failed check or rule, or the daily cap). The gate run's summary lists the reasons.\n\n${stuck.map((p) => `- #${p.number} ${p.title || p.head.ref} (${Math.round(age(p.created_at))}h)`).join('\n')}`);
      const newest = Math.min(age(s.latestAutomatedAt), ...incoming.map((p) => age(p.created_at)));
      if (newest > NEWSROOM_STALL_HOURS) add('newsroom-stalled', `Newsroom silent for ${Number.isFinite(newest) ? Math.round(newest) + 'h' : 'a long time'}`, `No new automated story or incoming PR for more than ${NEWSROOM_STALL_HOURS}h. The n8n workflow "Nuvellum v6.5" (8hXx6NuZuJU9dRR1) may be inactive, failing (credentials, Gemini quota, GitHub token) or finding only duplicates. Check its executions in n8n.`);
    }
  }

  if (s.deploy === null) unknown.push('deploy');
  else if (s.deploy && s.deploy.state === 'failure' && age(s.deploy.createdAt) > 2) {
    add('deploy', 'Production deployment failing', `Vercel reported "${s.deploy.description}" for main ${String(s.deploy.sha).slice(0, 7)}. Published stories may not be live yet. A rate limit clears by itself within 24 hours; anything else needs a look at the Vercel dashboard.`);
  }

  if (s.social === null) unknown.push('social-failed', 'credentials:');
  else {
    const failed = [];
    const auth = new Map();
    for (const e of s.social) for (const [platform, p] of Object.entries(e.platforms || {})) {
      if (age(p.updatedAt) > RECENT_HOURS) continue;
      const err = String(p.error || p.reason || '');
      if ((p.status === 'failed' || p.status === 'queued') && AUTH_RE.test(err)) auth.set(platform, err);
      else if (p.status === 'failed') failed.push(`- ${platform}: ${e.slug} — ${err.slice(0, 160)}`);
    }
    for (const [platform, err] of auth) add(`credentials:${platform}`, `${platform} credentials rejected`, `The ${platform} API rejected Nuvellum's credentials (${err.slice(0, 160)}). The token has probably expired or lost its permissions; renew it in GitHub → Settings → Secrets and variables → Actions. Posting to ${platform} is paused; other platforms continue.`);
    if (failed.length) add('social-failed', `Social posts failed (${failed.length})`, `These posts gave up after retries. They will not be retried automatically.\n\n${failed.slice(0, 15).join('\n')}`);
  }

  if (s.shorts === null) unknown.push('shorts-failing');
  else {
    const bad = s.shorts.filter((e) => age(e.updatedAt) <= RECENT_HOURS && (e.render?.status === 'failed' || (e.render?.failures || 0) >= 2));
    if (bad.length) add('shorts-failing', 'Short rendering failing', `Automatic Shorts failed to render or verify:\n\n${bad.slice(0, 10).map((e) => `- ${e.slug}: ${String(e.render?.error || 'unknown').slice(0, 160)}`).join('\n')}`);
  }

  return { alerts, unknown };
}

export const MARKER = (key) => `<!-- nuvellum-alert:${key} -->`;
export const keyOf = (body) => (String(body || '').match(/<!-- nuvellum-alert:(.+?) -->/) || [])[1] || null;

/**
 * Turn current alerts + open alert issues into actions.
 * @param {{alerts, unknown}} evaluation
 * @param {{number, body, updated_at}[]} openIssues  open issues labelled ops-alert
 * @returns {{ open: alert[], remind: {issue, alert}[], resolve: issue[] }}
 */
export function alertActions({ alerts, unknown }, openIssues, now = Date.now()) {
  const byKey = new Map(openIssues.map((i) => [keyOf(i.body), i]).filter(([k]) => k));
  const open = [], remind = [], resolve = [];
  for (const a of alerts) {
    const issue = byKey.get(a.key);
    if (!issue) open.push(a);
    else if ((now - Date.parse(issue.updated_at)) / HOUR >= REMIND_HOURS) remind.push({ issue, alert: a });
  }
  const firing = new Set(alerts.map((a) => a.key));
  for (const [key, issue] of byKey) {
    if (firing.has(key)) continue;
    if (unknown.some((u) => key === u || key.startsWith(u))) continue; // no data this run: keep it open
    resolve.push(issue);
  }
  return { open, remind, resolve };
}
