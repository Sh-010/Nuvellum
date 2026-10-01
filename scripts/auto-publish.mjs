// Automated publication gate for incoming editorial PRs.
//
// Runs from the default branch (never from PR code). For each open
// incoming/** PR — or a single PR when PR_NUMBER / HEAD_BRANCH is set — it
// evaluates the publication policy in scripts/lib/editorial.mjs and, only if
// every rule passes, squash-merges the PR pinned to the evaluated head SHA.
//
// Safety switches:
// - Nothing is merged unless the repository variable NUVELLUM_AUTOPUBLISH is "on".
// - DRY_RUN=1 evaluates and reports without merging.
// - A PR labelled hold / do-not-publish / needs-human is never merged.
// - Hourly cadence: at most HOURLY_CAP (1) story is merged in any rolling hour, and at most
//   NUVELLUM_PUBLISH_DAILY_CAP (default 24) in any 24 hours (each is a production build; Vercel Hobby allows
//   100 a day). Further approved stories wait, open, and are reconsidered on the next sweep.
//
// After a merge it dispatches the social-card workflow for the published slugs: a GITHUB_TOKEN merge fires
// no push workflows, so nothing downstream would otherwise notice the new story.

import { evaluatePublication } from './lib/editorial.mjs';
import { dailyCap, remainingNow, HOURLY_CAP } from './lib/publication-chain.mjs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const enabled = String(process.env.NUVELLUM_AUTOPUBLISH || '').toLowerCase() === 'on';
const dryRun = process.env.DRY_RUN === '1' || !enabled;
const onlyPr = Number(process.env.PR_NUMBER || 0);
const onlyBranch = process.env.HEAD_BRANCH || '';
const deleteBranch = process.env.DELETE_BRANCH_AFTER_MERGE !== '0';
const cap = dailyCap(process.env.NUVELLUM_PUBLISH_DAILY_CAP);
const CARD_WORKFLOW = 'social-card-assets.yml';

if (!repo || (!token && enabled && process.env.DRY_RUN !== '1')) {
  console.error('Missing GITHUB_REPOSITORY, or GITHUB_TOKEN when merging is enabled.');
  process.exit(1);
}

const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const headers = {
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  'X-GitHub-Api-Version': '2022-11-28'
};

async function gh(path, init = {}) {
  const res = await fetch(api + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} for ${init.method || 'GET'} ${path}: ${body?.message || ''}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function candidatePrs() {
  if (onlyPr) return [await gh(`/repos/${repo}/pulls/${onlyPr}`)];
  const prs = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh(`/repos/${repo}/pulls?state=open&base=main&sort=created&direction=desc&per_page=100&page=${page}`);
    prs.push(...batch);
    if (batch.length < 100) break;
  }
  return prs.filter(pr => String(pr.head?.ref || '').startsWith('incoming/') && (!onlyBranch || pr.head.ref === onlyBranch));
}

async function evaluate(pr) {
  const sha = pr.head.sha;
  const files = await gh(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`);
  const articleFile = files.find(f => /^src\/content\/articles\/.+\.md$/.test(f.filename));
  let article = '';
  if (articleFile) {
    const payload = await gh(`/repos/${repo}/contents/${enc(articleFile.filename)}?ref=${sha}`);
    article = Buffer.from(payload.content || '', 'base64').toString('utf8');
  }
  const runs = (await gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`)).workflow_runs || [];
  return evaluatePublication({ pr, repo, files, article, runs });
}

const summary = [];
const merged = [];
if (!enabled) console.log('NUVELLUM_AUTOPUBLISH is not "on": evaluating only, nothing will be merged.');

// Publications already made count against the rolling-hour limit and the daily cap. If they cannot be
// counted, nothing is merged this run (fail closed; the next sweep tries again).
let allowance = 0;
try { allowance = remainingNow(await gh(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`), cap); }
catch (err) { console.warn(`Could not count recent publications (${err.message}); merging nothing this run.`); }

const candidates = await candidatePrs(); // newest first: the freshest approved story is published first
for (const [i, pr] of candidates.entries()) {
  // Limit reached: everything still open stays queued for the next sweep. Stop here instead of evaluating
  // the rest, so a growing queue cannot exhaust the GITHUB_TOKEN API budget.
  if (!dryRun && allowance <= 0) {
    const queued = candidates.length - i;
    console.log(`WAIT  ${queued} open incoming PR(s): publication limit reached (${HOURLY_CAP} per rolling hour, ${cap} per 24h); queued for the next sweep`);
    summary.push(`| ${queued} open | queued | ${HOURLY_CAP}/hour or ${cap}/24h limit reached |`);
    break;
  }
  const result = await evaluate(pr);
  const label = `PR #${pr.number} ${pr.head.ref} @ ${pr.head.sha.slice(0, 7)}`;
  if (!result.publish) {
    console.log(`HOLD  ${label}\n      - ${result.reasons.join('\n      - ')}`);
    summary.push(`| #${pr.number} | hold | ${result.reasons.join('<br>')} |`);
    continue;
  }
  if (dryRun) {
    console.log(`READY ${label} (dry run, not merged)`);
    summary.push(`| #${pr.number} | ready (dry run) | all rules passed |`);
    continue;
  }
  try {
    // Pinning `sha` makes GitHub refuse the merge if anything was pushed
    // after this evaluation.
    await gh(`/repos/${repo}/pulls/${pr.number}/merge`, {
      method: 'PUT',
      body: JSON.stringify({
        sha: pr.head.sha,
        merge_method: 'squash',
        commit_title: `publish: ${result.title || result.slug} (#${pr.number})`,
        commit_message: 'Automatically published by the Nuvellum publication gate after editorial clearance and all required repository checks passed.'
      })
    });
    console.log(`MERGED ${label}`);
    allowance -= 1;
    if (result.slug) merged.push(result.slug);
    summary.push(`| #${pr.number} | merged | all rules passed |`);
    if (deleteBranch) {
      try { await gh(`/repos/${repo}/git/refs/heads/${enc(pr.head.ref)}`, { method: 'DELETE' }); }
      catch (err) { console.warn(`Merged, but could not delete ${pr.head.ref}: ${err.message}`); }
    }
  } catch (err) {
    console.error(`FAILED to merge ${label}: ${err.message}`);
    summary.push(`| #${pr.number} | merge failed | ${err.message} |`);
    process.exitCode = 1;
  }
}

// Downstream of publication: branded social cards. A failure here never undoes the merge; the card
// workflow's own sweep also catches any story this dispatch misses.
if (merged.length) {
  try {
    await gh(`/repos/${repo}/actions/workflows/${CARD_WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { slugs: merged.join(' ') } }) });
    console.log(`Dispatched ${CARD_WORKFLOW} for ${merged.join(', ')}`);
  } catch (err) {
    console.warn(`::warning::Merged, but could not dispatch ${CARD_WORKFLOW}: ${err.message}`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY && summary.length) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Nuvellum publication gate${dryRun ? ' (evaluation only)' : ''}\n\n| PR | Decision | Reasons |\n| --- | --- | --- |\n${summary.join('\n')}\n`);
}
