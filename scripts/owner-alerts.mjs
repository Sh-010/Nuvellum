// Owner alerts (see scripts/lib/alerts.mjs). Runs at the end of the observability workflow.
// Delivery: one GitHub issue per condition, labelled ops-alert and @-mentioning the owner (GitHub emails
// them), and, when the secret TELEGRAM_ALERT_CHAT_ID is set, a Telegram message from the existing bot.
// New alerts and resolutions are announced; a lasting alert is reminded at most once a day.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_REPOSITORY_OWNER, NUVELLUM_AUTOPUBLISH, SMOKE_OUTCOME,
//      LEDGER_DIR (a checkout of the social-ledger branch), TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID,
//      DRY_RUN=1 (print, change nothing).
import { readdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './lib/editorial.mjs';
import { summarizeArticles } from './lib/observability.mjs';
import { articlesDir } from './lib/paths.mjs';
import { evaluateAlerts, alertActions, MARKER } from './lib/alerts.mjs';

const repo = process.env.GITHUB_REPOSITORY || '';
const token = process.env.GITHUB_TOKEN || '';
const owner = process.env.GITHUB_REPOSITORY_OWNER || repo.split('/')[0] || '';
const dryRun = process.env.DRY_RUN === '1';
const now = Date.now();

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${init.method || 'GET'} ${path}`);
  return res.status === 204 ? null : res.json();
}
const attempt = async (fn) => { try { return await fn(); } catch (err) { console.warn(`::warning::${err.message}`); return null; } };

const readJsonDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => { try { return JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { return null; } }).filter(Boolean) : []);
const ledgerDir = process.env.LEDGER_DIR || '';
const haveLedger = ledgerDir && existsSync(ledgerDir);

const articles = readdirSync(articlesDir).filter((n) => n.endsWith('.md')).map((n) => ({ slug: n.slice(0, -3), data: parseFrontmatter(readFileSync(join(articlesDir, n), 'utf8')) || {} }));

let deploy = null;
if (repo && token) {
  deploy = await attempt(async () => {
    const commits = await gh('/commits?sha=main&per_page=15');
    for (const c of commits) {
      const statuses = await gh(`/commits/${c.sha}/statuses?per_page=50`);
      const v = statuses.find((x) => x.context === 'Vercel');
      if (!v || v.state === 'pending' || /ignored|cancel+ed|skipped/i.test(v.description || '')) continue;
      return { sha: c.sha, state: v.state, description: v.description || '', createdAt: v.created_at };
    }
    return false; // nothing decisive in recent history: no alert, but known
  });
}

// Newest automatic publication: with the hourly cadence, queued PRs only matter when the gate stops merging.
const closed = repo && token ? await attempt(() => gh('/pulls?state=closed&sort=updated&direction=desc&per_page=50')) : null;
const lastAutoMergeAt = closed ? (closed.filter((p) => String(p.head?.ref || '').startsWith('incoming/') && p.merged_at).map((p) => p.merged_at).sort().pop() || null) : undefined;

const evaluation = evaluateAlerts({
  lastAutoMergeAt,
  now,
  autopublish: String(process.env.NUVELLUM_AUTOPUBLISH || '').toLowerCase() === 'on',
  runs: repo && token ? (await attempt(() => gh('/actions/runs?branch=main&per_page=100')))?.workflow_runs ?? null : null,
  pulls: repo && token ? await attempt(() => gh('/pulls?state=open&per_page=100')) : null,
  latestAutomatedAt: summarizeArticles(articles).latestAutomatedAt || null,
  smoke: process.env.SMOKE_OUTCOME || null,
  deploy,
  social: haveLedger ? readJsonDir(join(ledgerDir, 'ledger')) : null,
  shorts: haveLedger ? readJsonDir(join(ledgerDir, 'shorts')) : null
});

const openIssues = repo && token ? await attempt(() => gh('/issues?state=open&labels=ops-alert&per_page=100')) : [];
if (openIssues === null) { console.log('Could not read open alert issues; not changing anything this run.'); process.exit(0); }
const actions = alertActions(evaluation, openIssues, now);

async function telegram(text) {
  const bot = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!bot || !chat || dryRun) return;
  await attempt(async () => {
    const res = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }) });
    if (!res.ok) throw new Error(`Telegram alert HTTP ${res.status}`);
  });
}

const runUrl = process.env.GITHUB_RUN_ID ? `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
const issueBody = (a) => `${MARKER(a.key)}\n@${owner} — Nuvellum needs attention.\n\n${a.body}\n\n${runUrl ? `Detected by ${runUrl}. ` : ''}This issue closes itself when the condition clears.`;
const log = [];

if (actions.open.length && !dryRun) await attempt(() => gh('/labels', { method: 'POST', body: JSON.stringify({ name: 'ops-alert', color: 'b60205', description: 'Automated owner alert from observability' }) }));
for (const a of actions.open) {
  log.push(`OPEN    ${a.key}: ${a.title}`);
  if (dryRun) continue;
  const issue = await attempt(() => gh('/issues', { method: 'POST', body: JSON.stringify({ title: `Alert: ${a.title}`, body: issueBody(a), labels: ['ops-alert'] }) }));
  await telegram(`⚠ Nuvellum: ${a.title}\n\n${a.body.replace(/\*\*/g, '')}${issue?.html_url ? `\n\n${issue.html_url}` : ''}`);
}
for (const { issue, alert } of actions.remind) {
  log.push(`REMIND  ${alert.key} (#${issue.number})`);
  if (dryRun) continue;
  await attempt(() => gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `@${owner} Still happening.\n\n${alert.body}` }) }));
  await telegram(`⚠ Still open — Nuvellum: ${alert.title}\n${issue.html_url}`);
}
for (const issue of actions.resolve) {
  log.push(`RESOLVE #${issue.number} ${issue.title}`);
  if (dryRun) continue;
  await attempt(() => gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: 'Resolved: the condition cleared on its own.' }) }));
  await attempt(() => gh(`/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) }));
  await telegram(`✓ Resolved — Nuvellum: ${issue.title.replace(/^Alert: /, '')}`);
}

const summary = [`### Owner alerts${dryRun ? ' (dry run)' : ''}`, '', `Firing: ${evaluation.alerts.length ? evaluation.alerts.map((a) => a.key).join(', ') : 'none'}`, `Unavailable data: ${evaluation.unknown.join(', ') || 'none'}`, '', ...(log.length ? log.map((l) => `- ${l}`) : ['- No change.'])].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
