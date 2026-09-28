import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './lib/editorial.mjs';
import { summarizeArticles, staleHours } from './lib/observability.mjs';
import { articlesDir } from './lib/paths.mjs';

const entries = readdirSync(articlesDir)
  .filter(name => name.endsWith('.md'))
  .map(name => {
    const slug = name.replace(/\.md$/, '');
    const src = readFileSync(join(articlesDir, name), 'utf8');
    return { slug, data: parseFrontmatter(src) || {} };
  });

const content = summarizeArticles(entries);
const repo = process.env.GITHUB_REPOSITORY || '';
const token = process.env.GITHUB_TOKEN || '';
const autopublish = String(process.env.NUVELLUM_AUTOPUBLISH || '').toLowerCase() === 'on';
const warnings = [];
const errors = [];
const github = { workflows: {}, incomingPrs: [], deploymentChecks: [] };

async function api(path) {
  if (!repo || !token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

if (repo && token) {
  try {
    const runs = await api('/actions/runs?branch=main&per_page=100');
    const core = ['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard'];
    for (const name of core) {
      const run = (runs?.workflow_runs || []).find(r => r.name === name);
      if (!run) {
        warnings.push(`No recent main run found for ${name}`);
        continue;
      }
      github.workflows[name] = {
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        url: run.html_url
      };
      if (run.status === 'completed' && !['success','neutral','skipped'].includes(run.conclusion)) {
        errors.push(`${name} latest main run concluded ${run.conclusion}`);
      }
    }

    const pulls = await api('/pulls?state=open&per_page=100');
    github.incomingPrs = (pulls || [])
      .filter(pr => String(pr.head?.ref || '').startsWith('incoming/'))
      .map(pr => ({
        number: pr.number,
        ref: pr.head.ref,
        createdAt: pr.created_at,
        labels: (pr.labels || []).map(x => x.name),
        url: pr.html_url
      }));

    if (autopublish) {
      const held = new Set(['hold','do-not-publish','needs-human']);
      for (const pr of github.incomingPrs) {
        if (pr.labels.some(x => held.has(String(x).toLowerCase()))) continue;
        const age = (Date.now() - Date.parse(pr.createdAt)) / 3600000;
        if (age > 24) errors.push(`Incoming PR #${pr.number} has been open ${Math.round(age)}h while autopublish is on`);
      }
    }

    const ref = await api('/git/ref/heads/main');
    const sha = ref?.object?.sha;
    if (sha) {
      const checks = await api(`/commits/${sha}/check-runs?per_page=100`);
      github.deploymentChecks = (checks?.check_runs || [])
        .filter(x => /vercel|deploy/i.test(String(x.name || '')))
        .map(x => ({ name:x.name, status:x.status, conclusion:x.conclusion, url:x.html_url }));
      for (const check of github.deploymentChecks) {
        if (check.status === 'completed' && !['success','neutral','skipped'].includes(check.conclusion)) {
          errors.push(`Deployment check "${check.name}" concluded ${check.conclusion}`);
        }
      }
    }
  } catch (err) {
    warnings.push(`GitHub health lookup failed: ${err.message}`);
  }
}

const age = staleHours(content.latestAutomatedAt);
if (autopublish && age !== null && age > 48) {
  warnings.push(`No automated publication for ${Math.round(age)}h while autopublish is on`);
}

const top = (obj, n=5) => Object.entries(obj || {}).slice(0,n).map(([k,v]) => `${k}: ${v}`).join(', ') || 'none';
const lines = [
  '# Nuvellum newsroom health',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Autopublish: ${autopublish ? 'on' : 'off'}`,
  '',
  '## Publishing',
  `- Published articles: ${content.publishedTotal}`,
  `- Automated articles: ${content.automatedTotal}`,
  `- Automated output: ${content.published24h} / 24h, ${content.published7d} / 7d, ${content.published30d} / 30d`,
  `- Latest automated article: ${content.latestAutomatedAt || 'none'}${content.latestAutomatedSlug ? ` (\`${content.latestAutomatedSlug}\`)` : ''}`,
  `- Sections: ${top(content.sections, 12)}`,
  `- Risk mix: ${top(content.risks, 8)}`,
  `- Visual modes: ${top(content.imageModes, 8)}`,
  `- Source hosts: ${top(content.sourceHosts, 10)}`,
  '',
  '## GitHub / deployment',
  ...Object.entries(github.workflows).map(([name, run]) => `- ${name}: ${run.status}/${run.conclusion || '—'}`),
  `- Open incoming PRs: ${github.incomingPrs.length}`,
  `- Deployment checks on main: ${github.deploymentChecks.length ? github.deploymentChecks.map(x => `${x.name}=${x.status}/${x.conclusion || '—'}`).join(', ') : 'none reported'}`,
  '',
  '## Alerts',
  ...(errors.length ? errors.map(x => `- ERROR: ${x}`) : ['- No hard failures detected.']),
  ...warnings.map(x => `- WARNING: ${x}`),
  ''
];

const markdown = lines.join('\n');
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');

for (const warning of warnings) console.log(`::warning::${warning}`);
for (const error of errors) console.log(`::error::${error}`);

if (errors.length) process.exitCode = 1;
