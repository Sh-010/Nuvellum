import { newStoryQualityProblems } from './newsroom.mjs';

// Shared editorial rules used by the content validator, the duplicate guard
// and the auto-publish gate, so the policy is defined in exactly one place.

export const VERIFICATION_REVIEWER = 'Nuvellum Verification Pipeline';
export const EDITORIAL_REVIEW_VALUES = new Set(['passed', 'failed', 'uncertain']);
export const VERIFICATION_VALUES = new Set(['cleared', 'failed', 'uncertain']);
export const HUMAN_LED_TYPES = new Set(['Opinion', 'Essay', 'Ideas', 'Review']);

// Workflow names (the `name:` field) that must all be green on the exact
// head commit before an incoming story may be merged automatically.
export const REQUIRED_CHECKS = ['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard'];
export const HOLD_LABELS = new Set(['hold', 'do-not-publish', 'needs-human']);

export const ARTICLE_PATH_RE = /^src\/content\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const AI_ART_PATH_RE = /^public\/generated\/ai\/([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/;

function parseValue(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/** Parse the flat Nuvellum frontmatter format. Returns null when absent. */
export function parseFrontmatter(src) {
  const text = String(src ?? '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const data = {};
  for (const line of text.slice(3, end).trim().split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2]);
  }
  return data;
}

export function normalizeSource(value) {
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

export function articleSources(markdown) {
  const data = parseFrontmatter(markdown) || {};
  const list = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return new Set(list.map(normalizeSource).filter(Boolean));
}

/**
 * Content-level publication policy, enforced by the repository validator on
 * every article (existing ones included). It only restricts values that are
 * present, so articles published before these fields existed stay valid.
 */
export function contentPolicyErrors(data, name) {
  const errors = [];
  if (data.origin !== 'automation') return errors;

  if (data.editorialReview !== undefined && !EDITORIAL_REVIEW_VALUES.has(data.editorialReview)) {
    errors.push(`${name}: editorialReview must be passed, failed or uncertain`);
  }
  if (data.verification !== undefined && !VERIFICATION_VALUES.has(data.verification)) {
    errors.push(`${name}: verification must be cleared, failed or uncertain`);
  }
  if (data.status === 'published') {
    if (data.editorialReview === 'failed' || data.editorialReview === 'uncertain') {
      errors.push(`${name}: a story whose editorial review is "${data.editorialReview}" cannot be published`);
    }
    if (data.verification === 'failed' || data.verification === 'uncertain') {
      errors.push(`${name}: a story whose verification is "${data.verification}" cannot be published`);
    }
  }
  if (String(data.reviewedBy || '').trim() === VERIFICATION_REVIEWER && data.verification !== 'cleared') {
    errors.push(`${name}: reviewedBy "${VERIFICATION_REVIEWER}" requires verification: "cleared"`);
  }
  return errors;
}

/**
 * Decide whether an incoming editorial PR may be merged automatically.
 * Pure function: every input is data fetched by the caller.
 *
 * @param {object} input
 * @param {object} input.pr       GitHub pull request object
 * @param {string} input.repo     "owner/name"
 * @param {Array}  input.files    PR files [{filename, status}]
 * @param {string} input.article  Markdown of the article at the PR head
 * @param {Array}  input.runs     workflow runs for the PR head SHA [{name, status, conclusion, created_at}]
 * @returns {{publish: boolean, reasons: string[], slug?: string, title?: string}}
 */
export function evaluatePublication({ pr, repo, files, article, runs }) {
  const reasons = [];
  const fail = (r) => { reasons.push(r); };

  // --- The pull request itself -------------------------------------------
  if (!pr || pr.state !== 'open') fail('PR is not open');
  if (pr?.draft) fail('PR is a draft');
  if (pr?.base?.ref !== 'main') fail('PR does not target main');
  if (!String(pr?.head?.ref || '').startsWith('incoming/')) fail('head branch is not incoming/**');
  if (pr?.head?.repo?.full_name !== repo) fail('head branch is not in this repository');
  const labels = (pr?.labels || []).map(l => String(l.name || l).toLowerCase());
  const hold = labels.find(l => HOLD_LABELS.has(l));
  if (hold) fail(`PR carries the "${hold}" label`);

  // --- Changed files: exactly one new article, optionally its own AI art --
  const articleFiles = (files || []).filter(f => ARTICLE_PATH_RE.test(f.filename));
  let slug;
  if (articleFiles.length !== 1) {
    fail(`expected exactly one article file, found ${articleFiles.length}`);
  } else {
    slug = articleFiles[0].filename.match(ARTICLE_PATH_RE)[1];
    if (articleFiles[0].status !== 'added') fail('automation may only add new articles, not modify existing ones');
  }
  for (const f of files || []) {
    if (ARTICLE_PATH_RE.test(f.filename)) continue;
    const art = f.filename.match(AI_ART_PATH_RE);
    if (art && slug && art[1] === slug && f.status === 'added') continue;
    fail(`file outside the automated publishing scope: ${f.filename} (${f.status})`);
  }

  // --- Editorial clearance recorded in the article -----------------------
  const data = parseFrontmatter(article);
  if (!data) {
    fail('article frontmatter could not be parsed');
  } else {
    if (data.origin !== 'automation') fail('origin is not automation');
    if (data.status !== 'published') fail(`status is "${data.status}", not "published"`);
    if (data.editorialReview !== 'passed') fail(`editorialReview is "${data.editorialReview ?? 'missing'}", not "passed"`);
    if (data.section === 'Opinion' || HUMAN_LED_TYPES.has(data.type)) fail('Opinion/Essay/Ideas/Review are human-led formats');

    if (data.risk === 'low') {
      if (data.verification !== undefined && data.verification !== 'cleared') fail(`verification is "${data.verification}"`);
    } else if (data.risk === 'sensitive') {
      if (data.verification !== 'cleared') fail(`sensitive story verification is "${data.verification ?? 'missing'}", not "cleared"`);
      if (String(data.reviewedBy || '').trim() !== VERIFICATION_REVIEWER) fail(`sensitive story reviewedBy is not "${VERIFICATION_REVIEWER}"`);
    } else {
      fail(`risk is "${data.risk ?? 'missing'}"`);
    }

    const text = String(article);
    const body = text.slice(text.indexOf('\n---', 3) + 4);
    const hasAiArt = (files || []).some(f => AI_ART_PATH_RE.test(f.filename));
    for (const q of newStoryQualityProblems(data, body, { slug, branch: pr?.head?.ref, hasAiArt })) fail(`quality: ${q}`);
  }

  // --- Repository checks on this exact commit ----------------------------
  // GitHub parks pull_request runs on bot-opened PRs as "action_required"
  // (awaiting approval). They never ran, so they neither pass nor block; the
  // push-triggered run on the same commit is the one that counts.
  for (const name of REQUIRED_CHECKS) {
    const latest = (runs || [])
      .filter(r => r.name === name && r.conclusion !== 'action_required')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .pop();
    if (!latest) fail(`required check "${name}" has not run on ${pr?.head?.sha?.slice(0, 7) ?? 'head'}`);
    else if (latest.status !== 'completed') fail(`required check "${name}" is ${latest.status}`);
    else if (latest.conclusion !== 'success') fail(`required check "${name}" concluded ${latest.conclusion}`);
  }

  return { publish: reasons.length === 0, reasons, slug, title: data?.title };
}

/**
 * Given this branch's sources and other in-flight branches, decide which
 * duplicates this branch must yield to. The oldest branch for a source wins;
 * ties break on branch name so exactly one branch survives.
 */
export function duplicateConflicts(self, others) {
  const conflicts = [];
  for (const other of others) {
    const overlap = [...self.sources].filter(s => other.sources.has(s));
    if (!overlap.length) continue;
    const otherFirst = String(other.firstCommitAt || '');
    const selfFirst = String(self.firstCommitAt || '');
    const otherIsOlder = otherFirst < selfFirst || (otherFirst === selfFirst && other.ref < self.ref);
    if (otherIsOlder) conflicts.push({ ref: other.ref, pr: other.pr, sources: overlap });
  }
  return conflicts;
}
