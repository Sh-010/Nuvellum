// Editorial core of the admin: form -> article, validation against the shared contract, publication
// gates and publication state. Pure functions; all repository data is passed in.
import { articleErrors, parseArticle, serializeArticle, normalizeTitle, normalizeSource, RISKS,
  SLUG_RE, TITLE_MAX, DEK_MAX, HUMAN_LED_TYPES } from '../article-rules.mjs';
import { slugify, readingTime, wordCount } from '../newsroom.mjs';
import { VERIFICATION_REVIEWER } from '../editorial.mjs';
import { REQUIRED_WORKFLOWS } from './github.mjs';

export const INTENTS = Object.freeze(['draft', 'review', 'publish', 'unpublish']);
export const IMAGE_PROVIDERS = Object.freeze(['manual', 'wikimedia', 'nuvellum-illustration']);
export const IMAGE_KINDS = Object.freeze(['photo', 'illustration', 'map']);
const MAX_FIELD = 2000, MAX_BODY = 120000;

const str = (v, max = MAX_FIELD) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const oneLine = (v, max = MAX_FIELD) => str(v, max).replace(/\s*\n\s*/g, ' ');
const list = (v, max = 12) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((x) => oneLine(x, 120)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, max);
const today = (now) => now.toISOString().slice(0, 10);

/** Suggested slug for a title (same rule as the newsroom). */
export const suggestSlug = (title) => slugify(title);

/**
 * Build frontmatter + body from the editor form.
 *  existing: the article's current frontmatter on main (edits), or null for a new story.
 *  intent: draft | review | publish | unpublish
 *  image: { src, provider, kind, alt, caption, credit, license, licenseUrl, sourcePage } | null (text-led)
 */
export function buildArticle(form, { existing = null, wasPublished = existing?.status === 'published', intent = 'draft', image = null, now = new Date() } = {}) {
  const f = form || {};
  const data = {};
  data.title = oneLine(f.title, 400);
  data.dek = oneLine(f.dek, 800);
  data.section = oneLine(f.section, 40);
  data.type = oneLine(f.type, 40);
  data.author = oneLine(f.author, 120);
  data.tags = list(f.tags);
  data.regions = list(f.regions, 8);
  data.countries = list(f.countries, 20);
  data.sourceUrls = list(f.sourceUrls, 10);
  data.sourceNote = oneLine(f.sourceNote, 600);
  data.risk = oneLine(f.risk, 20);
  data.editorialReview = oneLine(f.editorialReview, 20) || undefined;
  data.verification = oneLine(f.verification, 20) || undefined;
  data.reviewedBy = oneLine(f.reviewedBy, 120);
  // Dashboard-created stories are manual; edits keep the story's origin (automation rules keep applying).
  data.origin = existing ? existing.origin : 'manual';
  if (existing && !data.sourceNote && existing.sourceNote) data.sourceNote = existing.sourceNote;

  const body = str(f.body, MAX_BODY);
  data.readingTime = readingTime(body);

  let publishedAt = oneLine(f.publishedAt, 40);
  let date = oneLine(f.date, 10);
  if (intent === 'publish' && !wasPublished && !publishedAt) publishedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (!date) date = publishedAt ? publishedAt.slice(0, 10) : today(now);
  data.date = date;
  if (publishedAt) data.publishedAt = publishedAt;
  // Correcting or withdrawing a live story is dated; the original publication date is kept.
  if (existing && wasPublished) data.updated = today(now);
  else if (existing?.updated) data.updated = existing.updated;

  data.status = intent === 'publish' ? 'published' : intent === 'unpublish' ? 'draft' : intent === 'review' ? 'review' : 'draft';

  if (image && image.src) {
    data.image = image.src;
    data.imageAlt = oneLine(image.alt, 300);
    data.imageProvider = oneLine(image.provider, 40) || undefined;
    data.imageKind = oneLine(image.kind, 20) || undefined;
    data.imageCaption = oneLine(image.caption, 400);
    data.imageCredit = oneLine(image.credit, 200);
    data.imageLicense = oneLine(image.license, 120);
    data.imageLicenseUrl = oneLine(image.licenseUrl, 500);
    data.imageSourcePage = oneLine(image.sourcePage, 500);
  }
  return { data, body, markdown: serializeArticle(data, body) };
}

/** The gates Publish must pass, shown in the UI and enforced again on the server before merging. */
export function publicationGates(data) {
  const sensitive = data.risk === 'sensitive';
  const gates = [
    { id: 'risk', label: 'Risk assessed (Low or Sensitive)', ok: RISKS.includes(data.risk) },
    { id: 'editorialReview', label: 'Editorial review: passed', ok: data.editorialReview === 'passed', value: data.editorialReview || 'not recorded' }
  ];
  if (sensitive) {
    gates.push({ id: 'verification', label: 'Verification: cleared (sensitive story)', ok: data.verification === 'cleared', value: data.verification || 'not recorded' });
    // Newsroom stories may carry the pipeline's own reviewer; stories cleared by hand must name the person.
    const reviewerOk = Boolean(data.reviewedBy) && (data.origin === 'automation' || data.reviewedBy !== VERIFICATION_REVIEWER);
    gates.push({ id: 'reviewedBy', label: 'Named reviewer who cleared verification (sensitive story)', ok: reviewerOk, value: data.reviewedBy || 'none' });
  }
  return { sensitive, humanLed: HUMAN_LED_TYPES.includes(data.type) || data.section === 'Opinion', gates, ok: gates.every((g) => g.ok) };
}

// Errors that make a draft unsafe to store at all (the rest are reported but a draft may still be saved).
const SAFETY_RE = /raw HTML|unsafe markup|link target|HTML is not allowed|invalid slug|generic house art|already used by a published or saved story|already being worked on/;

/**
 * Validate a built article against the repository contract as it stands on main.
 *  snapshot: { articles:[{name,text,sha}], uploads:Set, aiArt:Set } from main
 *  pendingUpload: the /uploads/articles/... path about to be committed with this save, if any
 */
export function checkArticle({ slug, markdown, data, snapshot, isNew, pendingUpload = null, intent = 'draft', openSlugs = new Set() }) {
  const errors = [], warnings = [];
  if (!SLUG_RE.test(slug) || slug.length > 90) errors.push('Slug must be lowercase words joined by hyphens (a–z, 0–9), at most 90 characters.');
  const name = `${slug}.md`;
  const registry = { titles: new Map(), sources: new Map() };
  const others = (snapshot?.articles || []).filter((a) => a.name !== name);
  for (const a of others) {
    try {
      const d = parseArticle(a.text, a.name).data;
      const t = normalizeTitle(d.title); if (t && !registry.titles.has(t)) registry.titles.set(t, a.name);
      for (const s of Array.isArray(d.sourceUrls) ? d.sourceUrls : []) { const k = normalizeSource(s); if (k && !registry.sources.has(k)) registry.sources.set(k, a.name); }
    } catch {}
  }
  if (isNew && (snapshot?.articles || []).some((a) => a.name === name)) errors.push(`The slug "${slug}" is already used by a published or saved story. Choose another.`);
  if (isNew && openSlugs.has(slug)) errors.push(`The slug "${slug}" is already being worked on in another dashboard draft.`);
  const ctx = {
    registry,
    aiArtExists: (s) => snapshot?.aiArt?.has(`${s}.svg`) ?? false,
    publicFileExists: (p) => p === pendingUpload || (snapshot?.uploads?.has(p.replace(/^\/uploads\/articles\//, '')) ?? false)
  };
  for (const e of articleErrors(markdown, name, ctx)) {
    const msg = e.startsWith(name + ': ') ? e.slice(name.length + 2) : e;
    if (/manual stor(y|ies) can only be published|sensitive manual story can only be published/.test(msg) && intent !== 'publish') continue; // gates apply at Publish
    errors.push(msg);
  }
  if (data.title && data.title.length > TITLE_MAX - 20) warnings.push(`Title is ${data.title.length}/${TITLE_MAX} characters.`);
  if (data.dek && data.dek.length > DEK_MAX - 40) warnings.push(`Dek is ${data.dek.length}/${DEK_MAX} characters.`);
  if (data.image && /^\/uploads\/articles\//.test(data.image) && data.image !== pendingUpload && !ctx.publicFileExists(data.image)) {
    errors.push(`Image ${data.image} is not in the repository.`);
  }
  if (data.image && data.imageProvider !== 'wikimedia' && !data.imageCredit && data.imageKind === 'photo') warnings.push('No photo credit recorded. Add the photographer or agency if known; never guess.');
  if (!data.image) warnings.push('No image: the story will be set text-led.');
  const gates = publicationGates(data);
  if (intent === 'publish' && !gates.ok) for (const g of gates.gates) if (!g.ok) errors.push(`Publication gate not met: ${g.label}.`);
  const safetyErrors = errors.filter((e) => SAFETY_RE.test(e));
  return { errors: [...new Set(errors)], warnings, gates, safetyErrors, words: wordCount(data && markdown ? markdown.slice(markdown.indexOf('\n---', 3) + 4) : '') };
}

/**
 * Publication state for the UI, derived from GitHub (never stored).
 *  pr: pull request or null; runs: workflow runs on the PR head; fileStatus: status in the PR head file;
 *  mainStatus: status of the story on main (null for a new story).
 */
export function publicationState({ branchExists = true, pr = null, runs = [], fileStatus = null, mainStatus = null, gatesOk = false, required = REQUIRED_WORKFLOWS }) {
  const labels = (pr?.labels || []).map((l) => String(l.name || l).toLowerCase());
  const held = labels.find((l) => HOLD_LABELS.includes(l));
  const checks = required.map((name) => {
    const latest = runs.filter((r) => r.name === name && r.conclusion !== 'action_required').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).pop();
    return { name, status: latest ? latest.status : 'queued', conclusion: latest?.conclusion || null, url: latest?.url || null };
  });
  if (pr?.merged_at) return { state: fileStatus === 'published' ? 'Published' : fileStatus === 'draft' && mainStatus !== null ? 'Unpublished' : 'Merged', checks, canMerge: false };
  if (pr && pr.state === 'closed') return { state: 'Closed', checks, canMerge: false };
  if (!pr) return { state: branchExists ? 'Draft' : 'New', checks: [], canMerge: false };
  if (held) return { state: held === 'needs-human' ? 'Sent back for changes' : held === 'rejected' ? 'Rejected' : 'On hold', checks, canMerge: false, held };
  const failed = checks.some((c) => c.status === 'completed' && c.conclusion !== 'success');
  const pending = checks.some((c) => c.status !== 'completed');
  if (failed) return { state: 'Checks failed', checks, canMerge: false };
  if (pending) return { state: runs.length ? 'Checks running' : 'PR created', checks, canMerge: false };
  const isUnpublish = fileStatus === 'draft' && mainStatus === 'published';
  if (fileStatus === 'published' && gatesOk) return { state: 'Ready to publish', checks, canMerge: true };
  if (isUnpublish) return { state: 'Ready to unpublish', checks, canMerge: true };
  if (fileStatus === 'published') return { state: 'Checks passed; gates not met', checks, canMerge: false };
  return { state: 'In review (checks passed)', checks, canMerge: false };
}

export const HOLD_LABELS = Object.freeze(['hold', 'do-not-publish', 'needs-human', 'rejected']);
export const QUEUE_BUCKETS = Object.freeze(['Pending Review', 'Checks Running', 'Ready to Publish', 'Published', 'Held / Rejected']);

/** Which Review Queue column a story belongs in. */
export function queueBucket({ state, pr, fileStatus, gatesOk }) {
  if (pr?.merged_at) return 'Published';
  if ((pr && pr.state === 'closed') || /On hold|Rejected|Sent back/.test(state)) return 'Held / Rejected';
  if (/^Ready to/.test(state)) return 'Ready to Publish';
  if ((state === 'Checks running' || state === 'PR created') && fileStatus === 'published' && gatesOk) return 'Checks Running';
  return 'Pending Review';
}
