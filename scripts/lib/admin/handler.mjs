// HTTP layer of the Nuvellum admin (one Vercel Function, api/admin.js). Every action is authorised on
// its own: a valid session cookie for everything except login, plus same-origin + JSON + CSRF token
// for every state-changing request. Responses are JSON, never cached and never indexed.
import { authConfig, passwordMatches, createSession, verifySession, csrfToken, csrfMatches, sessionCookie, clearedCookie,
  readCookie, createThrottle, clientKey } from './auth.mjs';
import { createGitHub, GitHubError, BRANCH_RE, branchFor, assertBranch, assertWorkBranch, uploadPath, isIncoming,
  requiredWorkflowsFor, storySlugFromFiles } from './github.mjs';
import { buildArticle, checkArticle, publicationGates, publicationState, queueBucket, suggestSlug, INTENTS, IMAGE_PROVIDERS,
  IMAGE_KINDS, QUEUE_BUCKETS } from './editor.mjs';
import { checkUpload, checkImageUrl, MAX_IMAGE_BYTES } from './images.mjs';
import { renderPreview } from './render.mjs';
import { parseArticle, SECTIONS, TYPES, STATUSES, RISKS, WORLD_REGIONS, TITLE_MAX, DEK_MAX, SLUG_RE } from '../article-rules.mjs';
import { COUNTRIES } from '../../../src/lib/countries.js';

const MAX_BODY_BYTES = 4_500_000;
const GET_ACTIONS = new Set(['session', 'meta', 'list', 'queue', 'article', 'status']);
const POST_ACTIONS = new Set(['login', 'logout', 'check', 'save', 'merge', 'discard', 'review']);
const REVIEW_ACTIONS = new Set(['hold', 'release', 'sendback', 'reject']);
const REGION_LABELS = { 'north-america': 'North America', 'latin-america-caribbean': 'Latin America & Caribbean', 'europe-central-asia': 'Europe & Central Asia', 'middle-east-north-africa': 'Middle East & North Africa', 'sub-saharan-africa': 'Sub-Saharan Africa', 'south-asia': 'South Asia', 'east-asia': 'East Asia', 'southeast-asia-oceania': 'Southeast Asia & Oceania' };

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }

function respond(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manualSlug = (b) => (String(b).match(BRANCH_RE) || [])[1];
const parse = (text, name) => { try { return parseArticle(text, name); } catch { return null; } };
const prInfo = (pr) => (pr ? { number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged_at), headSha: pr.head?.sha,
  branch: pr.head?.ref, labels: (pr.labels || []).map((l) => l.name), updatedAt: pr.updated_at, newsroom: isIncoming(pr.head?.ref) } : null);

/**
 * createAdminHandler({ env, githubFactory, now, delay, log, throttle }) -> (Request) => Promise<Response>
 * githubFactory(token) defaults to the real client; tests inject a fake.
 */
export function createAdminHandler({ env = process.env, githubFactory = (token) => createGitHub({ token }), now = () => Date.now(), delay = sleep, log = console, throttle = createThrottle() } = {}) {
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action') || '';
      const method = request.method.toUpperCase();
      if (!(method === 'GET' && GET_ACTIONS.has(action)) && !(method === 'POST' && POST_ACTIONS.has(action))) throw new HttpError(404, 'Unknown admin action.');

      const cfg = authConfig(env);
      if (!cfg.ok) {
        log.error?.('[admin] disabled: ' + cfg.problems.join('; '));
        throw new HttpError(503, 'The admin is not configured on this deployment.');
      }

      let body = {};
      if (method === 'POST') {
        const origin = request.headers.get('origin');
        if (!origin || origin !== `${url.protocol}//${url.host}`) throw new HttpError(403, 'Cross-site request refused.');
        if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
        if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large.');
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large.');
        try { body = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'Malformed JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Malformed request.');
      }

      const session = verifySession(readCookie(request.headers.get('cookie')), cfg.secret, now());

      if (action === 'login') {
        const key = clientKey(request.headers);
        if (throttle.blocked(key, now())) { await delay(1500); throw new HttpError(429, 'Too many failed attempts. Wait 15 minutes and try again.'); }
        if (!passwordMatches(body.password, cfg.password)) {
          const failures = throttle.fail(key, now());
          await delay(throttle.delayFor(failures));
          throw new HttpError(401, 'Incorrect password.');
        }
        throttle.reset(key);
        const s = createSession(cfg.secret, now());
        return respond(200, { ok: true, csrf: csrfToken(cfg.secret, s.nonce), expires: s.expires }, { 'Set-Cookie': sessionCookie(s.token, s.expires, now()) });
      }
      if (action === 'session') {
        if (!session) return respond(200, { authenticated: false });
        return respond(200, { authenticated: true, csrf: csrfToken(cfg.secret, session.nonce), expires: session.expires });
      }
      if (!session) throw new HttpError(401, 'Your session has ended. Log in again.');
      if (method === 'POST' && !csrfMatches(request.headers.get('x-nuvellum-csrf'), cfg.secret, session.nonce)) throw new HttpError(403, 'Security token missing or expired. Reload the page.');
      if (action === 'logout') return respond(200, { ok: true }, { 'Set-Cookie': clearedCookie() });
      if (action === 'meta') return respond(200, meta());

      const gh = githubFactory(env.NUVELLUM_GITHUB_TOKEN);
      const at = new Date(now());
      switch (action) {
        case 'list': return respond(200, await list(gh));
        case 'queue': return respond(200, await queue(gh));
        case 'article': return respond(200, await loadArticle(gh, url.searchParams.get('slug'), url.searchParams.get('pr')));
        case 'status': return respond(200, await status(gh, url.searchParams.get('branch')));
        case 'check': return respond(200, await check(gh, body, at));
        case 'save': return respond(200, await save(gh, body, at));
        case 'merge': return respond(200, await merge(gh, body));
        case 'discard': return respond(200, await discard(gh, body));
        case 'review': return respond(200, await review(gh, body));
      }
      throw new HttpError(404, 'Unknown admin action.');
    } catch (err) {
      if (err instanceof HttpError) return respond(err.status, { error: err.message, ...(err.extra || {}) });
      if (err instanceof GitHubError) return respond(err.status, { error: err.message });
      log.error?.('[admin] unexpected error: ' + (err?.name || 'Error'));
      return respond(500, { error: 'Something went wrong. Nothing was published.' });
    }
  };
}

function meta() {
  return {
    sections: SECTIONS, types: TYPES, statuses: STATUSES, risks: RISKS, buckets: QUEUE_BUCKETS,
    regions: WORLD_REGIONS.map((id) => ({ id, label: REGION_LABELS[id] || id })),
    countries: COUNTRIES.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    imageProviders: IMAGE_PROVIDERS, imageKinds: IMAGE_KINDS,
    limits: { title: TITLE_MAX, dek: DEK_MAX, imageBytes: MAX_IMAGE_BYTES }
  };
}

function summary(name, sha, text) {
  const d = parse(text, name)?.data || {};
  return { slug: name.replace(/\.md$/, ''), sha, title: d.title || name, dek: d.dek || '', date: d.date || '', updated: d.updated || '',
    section: d.section || '', type: d.type || '', author: d.author || '', status: d.status || '', risk: d.risk || '', origin: d.origin || 'legacy',
    editorialReview: d.editorialReview || '', verification: d.verification || '', reviewedBy: d.reviewedBy || '', image: d.image || '' };
}

async function list(gh) {
  const [snapshot, branches, pulls] = await Promise.all([gh.snapshot('main'), gh.manualBranches(), gh.manualPulls('open')]);
  const articles = snapshot.articles.map((a) => summary(a.name, a.sha, a.text))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
  const work = [];
  for (const b of branches.slice(0, 30)) {
    const slug = manualSlug(b.branch);
    const pr = pulls.find((p) => p.head.ref === b.branch) || null;
    const file = await gh.readArticle(slug, b.branch);
    work.push({ ...(file ? summary(`${slug}.md`, file.sha, file.text) : { slug, title: slug }), branch: b.branch, pr: prInfo(pr),
      onMain: snapshot.articles.some((a) => a.name === `${slug}.md`) });
  }
  return { articles, work };
}

/** One PR as a Review Queue card: the story, its gates, its checks and its column. */
async function queueItem(gh, pr, mainStatusOf) {
  const files = await gh.pullFiles(pr.number);
  const slug = storySlugFromFiles(files);
  if (!slug) return { pr: prInfo(pr), bucket: 'Held / Rejected', state: 'Needs GitHub review (changes files outside one story)', title: pr.title, foreign: true };
  const ref = pr.merged_at ? pr.merge_commit_sha : pr.head.sha;
  const file = await gh.readArticle(slug, ref);
  const d = file ? parse(file.text, `${slug}.md`)?.data || {} : {};
  const gates = publicationGates(d);
  const runs = pr.state === 'open' ? await gh.workflowRuns(pr.head.sha) : [];
  const s = publicationState({ pr, runs, fileStatus: d.status || null, mainStatus: mainStatusOf(slug), gatesOk: gates.ok, required: requiredWorkflowsFor(pr.head.ref) });
  return { ...summary(`${slug}.md`, file?.sha || null, file?.text || ''), sourceUrls: Array.isArray(d.sourceUrls) ? d.sourceUrls : [],
    pr: prInfo(pr), gates, state: s.state, checks: s.checks, canMerge: s.canMerge,
    bucket: queueBucket({ state: s.state, pr, fileStatus: d.status, gatesOk: gates.ok }) };
}

async function queue(gh) {
  const [open, closed, snapshot] = await Promise.all([gh.editorialPulls('open'), gh.recentlyClosed(), gh.snapshot('main')]);
  const mainStatus = new Map(snapshot.articles.map((a) => [a.name.replace(/\.md$/, ''), parse(a.text, a.name)?.data?.status || null]));
  const mainStatusOf = (slug) => mainStatus.get(slug) ?? null;
  const items = [];
  for (const pr of open.slice(0, 40)) items.push(await queueItem(gh, pr, mainStatusOf));
  for (const pr of closed.slice(0, 20)) {
    const labels = (pr.labels || []).map((l) => l.name);
    if (!pr.merged_at && !labels.includes('rejected')) continue; // closed for other reasons (superseded, duplicates)
    items.push({ pr: prInfo(pr), title: pr.title.replace(/^(Editorial|Manual(?: update)?|Unpublish): /, ''), bucket: pr.merged_at ? 'Published' : 'Held / Rejected',
      state: pr.merged_at ? 'Merged' : 'Rejected', closedAt: pr.closed_at });
  }
  const columns = Object.fromEntries(QUEUE_BUCKETS.map((b) => [b, items.filter((i) => i.bucket === b)]));
  return { columns };
}

async function loadArticle(gh, slugParam, prParam) {
  let slug = String(slugParam || ''), work = null;
  if (prParam) {
    const pr = await gh.pull(Number(prParam));
    const files = await gh.pullFiles(pr.number);
    slug = storySlugFromFiles(files);
    if (!slug) throw new HttpError(409, 'This pull request changes files outside one story; review it on GitHub.');
    const file = await gh.readArticle(slug, pr.head.sha);
    if (!file) throw new HttpError(404, 'The story file is missing from this pull request.');
    const p = parse(file.text, `${slug}.md`);
    work = { branch: pr.head.ref, sha: file.sha, data: p?.data || {}, body: p?.body || '', pr: prInfo(pr) };
  }
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Invalid slug.');
  const main = await gh.readArticle(slug, 'main');
  if (!work) {
    const mine = (await gh.manualBranches()).filter((b) => manualSlug(b.branch) === slug).sort((a, b) => b.branch.localeCompare(a.branch));
    if (mine.length) {
      const file = await gh.readArticle(slug, mine[0].branch);
      const pr = await gh.pullForBranch(mine[0].branch);
      if (file) {
        const p = parse(file.text, `${slug}.md`);
        work = { branch: mine[0].branch, sha: file.sha, data: p?.data || {}, body: p?.body || '', pr: prInfo(pr) };
      }
    }
  }
  if (!main && !work) throw new HttpError(404, 'No such article.');
  const mp = main ? parse(main.text, `${slug}.md`) : null;
  return { slug, main: main ? { sha: main.sha, data: mp?.data || {}, body: mp?.body || '' } : null, work };
}

/** Resolve the image part of the form into { image, pendingUpload, upload, previewSrc, errors }. */
async function resolveImage(gh, slug, img, current) {
  const mode = String(img?.mode || 'none');
  const meta = {
    alt: img?.alt, caption: img?.caption, credit: img?.credit, license: img?.license, licenseUrl: img?.licenseUrl, sourcePage: img?.sourcePage,
    provider: IMAGE_PROVIDERS.includes(img?.provider) ? img.provider : 'manual',
    kind: IMAGE_KINDS.includes(img?.kind) ? img.kind : 'photo'
  };
  const errors = [];
  for (const [label, v] of [['licence URL', meta.licenseUrl], ['source page', meta.sourcePage]]) {
    if (String(v || '').trim() && !/^https:\/\/[^\s]+$/i.test(String(v).trim())) errors.push(`Image ${label} must be an https:// address.`);
  }
  if (mode === 'none') return { image: null, errors };
  if (mode === 'current') {
    if (!current) return { image: null, errors: [...errors, 'There is no current image to keep.'] };
    return { image: { ...meta, src: current }, previewSrc: current, errors };
  }
  if (mode === 'url') {
    const src = String(img?.url || '').trim();
    if (/^\/uploads\/articles\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(src)) {
      if (!(await gh.uploadExists(src))) errors.push('That repository image does not exist.');
      return { image: { ...meta, src }, previewSrc: src, errors };
    }
    const bad = checkImageUrl(src);
    if (bad) return { image: null, errors: [...errors, bad] };
    return { image: { ...meta, src }, previewSrc: src, errors };
  }
  if (mode === 'upload') {
    const u = checkUpload(img?.upload);
    if (!u.ok) return { image: null, errors: [...errors, ...u.errors] };
    const path = uploadPath(slug, u.ext);
    return { image: { ...meta, src: path.replace(/^public/, '') }, pendingUpload: path.replace(/^public/, ''), upload: { path, base64: u.base64 }, errors };
  }
  return { image: null, errors: [...errors, 'Unknown image option.'] };
}

/** Shared by check and save: build the article from the form and validate it against main. */
async function prepare(gh, body, now) {
  const intent = INTENTS.includes(body.intent) ? body.intent : 'draft';
  const form = body.form && typeof body.form === 'object' ? body.form : {};
  const branch = body.branch ? assertWorkBranch(String(body.branch)) : null;
  let slug = String(body.slug || form.slug || suggestSlug(form.title || '')).trim();
  let pr = null;
  if (branch && isIncoming(branch)) {
    // Newsroom story: the slug is the one article the PR adds; the editor cannot rename it.
    pr = await gh.pullForBranch(branch);
    if (!pr || pr.state !== 'open') throw new HttpError(409, 'That newsroom pull request is no longer open.');
    slug = storySlugFromFiles(await gh.pullFiles(pr.number)) || '';
    if (!slug) throw new HttpError(409, 'This pull request changes files outside one story; review it on GitHub.');
  }
  if (!SLUG_RE.test(slug) || slug.length > 90) throw new HttpError(422, 'Invalid slug.', { errors: ['Slug must be lowercase words joined by hyphens (a–z, 0–9), at most 90 characters.'] });
  if (branch && !isIncoming(branch) && manualSlug(branch) !== slug) throw new HttpError(400, 'The working branch belongs to another story.');
  const [snapshot, mainFile, branches] = await Promise.all([gh.snapshot('main'), gh.readArticle(slug, 'main'), gh.manualBranches()]);
  const mainData = mainFile ? parse(mainFile.text, `${slug}.md`)?.data || null : null;
  const workFile = branch ? await gh.readArticle(slug, branch) : null;
  const workData = workFile ? parse(workFile.text, `${slug}.md`)?.data || null : null;
  const img = await resolveImage(gh, slug, body.image, (workData || mainData)?.image || null);
  const newStory = body.isNew === true && !branch;
  const built = buildArticle(form, { existing: newStory ? null : mainData || workData, wasPublished: !newStory && mainData?.status === 'published', intent, image: img.image, now });
  const openSlugs = new Set(branches.filter((b) => b.branch !== branch).map((b) => manualSlug(b.branch)));
  // A story started with "New article" is new even if its slug happens to exist: it must never become an edit.
  const isNew = body.isNew === true ? !branch : !mainFile && !branch;
  const result = checkArticle({ slug, markdown: built.markdown, data: built.data, snapshot, isNew, pendingUpload: img.pendingUpload, intent, openSlugs });
  result.errors.unshift(...img.errors);
  return { intent, slug, branch, pr, snapshot, mainFile, mainData: isNew ? null : mainData, workFile, workData, img, built, result, isNew };
}

async function check(gh, body, now) {
  const p = await prepare(gh, body, now);
  return {
    slug: p.slug, suggestedSlug: suggestSlug(p.built.data.title || ''), readingTime: p.built.data.readingTime, words: p.result.words,
    errors: p.result.errors, warnings: p.result.warnings, gates: p.result.gates, isNew: p.isNew,
    // The subset that would stop even a draft from saving (the same list save() uses for intent 'draft'),
    // so the editor can stay quiet about publication requirements while the writer is drafting.
    draftBlockers: [...new Set(p.result.safetyErrors.concat(p.img.errors))],
    preview: renderPreview(p.built.data, p.built.body, { imageSrc: p.img.previewSrc || null, pendingUpload: Boolean(p.img.pendingUpload) })
  };
}

function withStatus(text, status, updated) {
  const end = text.indexOf('\n---', 3);
  let fm = text.slice(0, end);
  const rest = text.slice(end);
  fm = /^status: .*$/m.test(fm) ? fm.replace(/^status: .*$/m, `status: ${JSON.stringify(status)}`) : `${fm}\nstatus: ${JSON.stringify(status)}`;
  fm = /^updated: .*$/m.test(fm) ? fm.replace(/^updated: .*$/m, `updated: ${JSON.stringify(updated)}`) : fm.replace(/^(date: .*)$/m, `$1\nupdated: ${JSON.stringify(updated)}`);
  return fm + rest;
}

function prBody({ intent, data, gates, slug }) {
  const tick = (ok) => (ok ? '✓' : '✗');
  return [
    `Created from the Nuvellum admin dashboard (manual editorial path). Intent: **${intent}**.`,
    '',
    `- Story: \`src/content/articles/${slug}.md\``,
    `- Section / type: ${data.section} / ${data.type}; risk: ${data.risk || 'n/a'}; origin: ${data.origin || 'legacy'}`,
    ...gates.gates.map((g) => `- ${tick(g.ok)} ${g.label}${g.value ? ` (${g.value})` : ''}`),
    '',
    'The dashboard merges only after the required checks pass on this exact commit; branch protection enforces the same.'
  ].join('\n');
}

async function ensurePull(gh, branch, title, bodyText) {
  const existing = await gh.pullForBranch(branch);
  if (existing && existing.state === 'open') return existing;
  if (existing && existing.merged_at) throw new HttpError(409, 'This draft was already published. Open the story again to make a new edit.');
  return gh.openPull({ branch, title, body: bodyText });
}

async function save(gh, body, now) {
  const intent = INTENTS.includes(body.intent) ? body.intent : 'draft';
  const expected = body.expectedSha === null || body.expectedSha === undefined || body.expectedSha === '' ? null : String(body.expectedSha);
  if (expected !== null && !/^[0-9a-f]{40}$/.test(expected)) throw new HttpError(400, 'Invalid version marker.');

  if (intent === 'unpublish') {
    const slug = String(body.slug || '');
    if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Invalid slug.');
    if (body.confirm !== slug) throw new HttpError(400, 'Type the story slug to confirm unpublishing.');
    const main = await gh.readArticle(slug, 'main');
    const d = main ? parse(main.text, `${slug}.md`)?.data : null;
    if (!d || d.status !== 'published') throw new HttpError(409, 'Only a published story can be unpublished.');
    if (expected && expected !== main.sha) throw new HttpError(409, 'The story changed on the site since you opened it. Reload and try again.');
    const branch = branchFor(slug, now);
    const markdown = withStatus(main.text, 'draft', now.toISOString().slice(0, 10));
    const c = await gh.commit({ branch, slug, files: [{ path: `src/content/articles/${slug}.md`, content: markdown }], message: `manual: unpublish ${slug}`, expectedArticleSha: main.sha });
    const pr = await ensurePull(gh, branch, `Unpublish: ${d.title}`, prBody({ intent, data: d, gates: publicationGates(d), slug }));
    return { slug, branch, commit: c.commit, articleSha: c.articleSha, pr: prInfo(pr), state: 'PR created' };
  }

  const p = await prepare(gh, body, now);
  const newsroom = Boolean(p.branch && isIncoming(p.branch));
  if (newsroom && intent === 'draft') throw new HttpError(400, 'Newsroom stories are saved for review or approved for publication.');
  const blocking = intent === 'draft' ? p.result.safetyErrors.concat(p.img.errors) : p.result.errors;
  if (blocking.length) throw new HttpError(422, 'The story is not ready for this step.', { errors: blocking, warnings: p.result.warnings, gates: p.result.gates });

  // Stale-edit protection: the editor must name the version it started from.
  const baseSha = p.branch ? p.workFile?.sha || null : p.mainFile?.sha || null;
  if ((expected || null) !== baseSha) throw new HttpError(409, 'This story changed since you opened it. Reload it before saving.');
  const branch = p.branch || branchFor(p.slug, now);
  const files = [{ path: `src/content/articles/${p.slug}.md`, content: p.built.markdown }];
  if (p.img.upload) files.push({ path: p.img.upload.path, base64: p.img.upload.base64 });
  const message = newsroom ? `editor: ${intent} ${p.slug}` : `manual: ${intent} ${p.slug}`;
  const c = await gh.commit({ branch, slug: p.slug, files, message, expectedArticleSha: baseSha });

  let pr = null;
  if (newsroom) {
    pr = p.pr;
    if (intent === 'publish') { // approving a held or sent-back story releases it
      for (const label of ['hold', 'needs-human']) if ((pr.labels || []).some((l) => l.name === label)) await gh.setLabel(pr.number, label, false);
    }
  } else if (intent !== 'draft') {
    const verb = p.mainData?.status === 'published' ? 'Manual update' : 'Manual';
    pr = await ensurePull(gh, branch, `${verb}: ${p.built.data.title}`, prBody({ intent, data: p.built.data, gates: p.result.gates, slug: p.slug }));
  }
  return { slug: p.slug, branch, commit: c.commit, articleSha: c.articleSha, pr: prInfo(pr), state: pr ? 'Checks running' : 'Draft',
    warnings: p.result.warnings, gates: p.result.gates };
}

async function status(gh, branchParam) {
  const branch = assertWorkBranch(String(branchParam || ''));
  const pr = await gh.pullForBranch(branch);
  let slug = manualSlug(branch);
  if (!slug && pr) slug = storySlugFromFiles(await gh.pullFiles(pr.number));
  if (!slug) throw new HttpError(409, 'This pull request changes files outside one story; review it on GitHub.');
  const [head, main] = await Promise.all([gh.branchHead(branch), gh.readArticle(slug, 'main')]);
  const ref = pr?.merged_at ? pr.merge_commit_sha : (pr?.head?.sha || head);
  if (!ref) return { branch, slug, state: 'Discarded', checks: [], canMerge: false };
  const file = await gh.readArticle(slug, ref);
  const d = file ? parse(file.text, `${slug}.md`)?.data || {} : {};
  const mainStatus = main ? parse(main.text, `${slug}.md`)?.data?.status || null : null;
  const gates = publicationGates(d);
  const runs = pr && pr.state === 'open' ? await gh.workflowRuns(pr.head.sha) : [];
  const s = publicationState({ branchExists: Boolean(head), pr, runs, fileStatus: d.status || null, mainStatus, gatesOk: gates.ok, required: requiredWorkflowsFor(branch) });
  return { branch, slug, title: d.title || slug, headSha: pr?.head?.sha || head, fileStatus: d.status || null, mainStatus, gates, pr: prInfo(pr), ...s,
    bucket: queueBucket({ state: s.state, pr, fileStatus: d.status, gatesOk: gates.ok }) };
}

async function merge(gh, body) {
  const number = Number(body.number);
  const sha = String(body.sha || '');
  if (!Number.isInteger(number) || !/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, 'Invalid publication request.');
  const pr = await gh.pull(number);
  if (pr.state !== 'open' || pr.draft) throw new HttpError(409, 'This pull request is not open for publication.');
  if (pr.head.sha !== sha) throw new HttpError(409, 'New changes arrived after the checks you saw. Refresh the status first.');
  const prFiles = await gh.pullFiles(number);
  const slug = storySlugFromFiles(prFiles);
  if (!slug) throw new HttpError(409, 'This pull request changes files outside one story. It must be reviewed on GitHub.');
  if (!isIncoming(pr.head.ref) && manualSlug(pr.head.ref) !== slug) throw new HttpError(409, 'This pull request does not match its story.');
  // The story's own image may arrive in this same pull request.
  const upload = prFiles.find((f) => f.filename.startsWith('public/uploads/articles/'));
  const pendingUpload = upload ? upload.filename.replace(/^public/, '') : null;
  const [file, main, snapshot] = await Promise.all([gh.readArticle(slug, sha), gh.readArticle(slug, 'main'), gh.snapshot('main')]);
  if (!file) throw new HttpError(409, 'The story file is missing from this pull request.');
  const d = parse(file.text, `${slug}.md`)?.data;
  if (!d) throw new HttpError(422, 'The story file could not be read.');
  const mainStatus = main ? parse(main.text, `${slug}.md`)?.data?.status || null : null;
  const unpublish = d.status === 'draft' && mainStatus === 'published';
  if (d.status !== 'published' && !unpublish) throw new HttpError(409, `The story is "${d.status}", not ready to publish.`);
  // The contract, the gates and the checks are all re-evaluated here, on the exact commit being merged.
  const result = checkArticle({ slug, markdown: file.text, data: d, snapshot, isNew: false, pendingUpload, intent: unpublish ? 'draft' : 'publish' });
  if (result.errors.length) throw new HttpError(422, 'The story no longer passes validation.', { errors: result.errors });
  const gates = publicationGates(d);
  if (!unpublish && !gates.ok) throw new HttpError(422, 'Publication gates are not met.', { gates });
  const runs = await gh.workflowRuns(sha);
  const s = publicationState({ pr, runs, fileStatus: d.status, mainStatus, gatesOk: gates.ok, required: requiredWorkflowsFor(pr.head.ref) });
  if (!s.canMerge) throw new HttpError(409, `Not publishable yet: ${s.state}.`, { checks: s.checks });
  const label = unpublish ? 'Unpublish' : isIncoming(pr.head.ref) ? 'Editorial' : main ? 'Manual update' : 'Manual';
  const merged = await gh.merge({ number, sha, title: `${label}: ${d.title} (#${number})` });
  if (!isIncoming(pr.head.ref)) await gh.deleteBranch(pr.head.ref).catch(() => {});
  return { state: unpublish ? 'Unpublished' : 'Published', commit: merged?.sha || null, slug, note: 'Vercel deploys main automatically; the change is live when that deployment finishes.' };
}

async function discard(gh, body) {
  const branch = assertBranch(String(body.branch || ''));
  const pr = await gh.pullForBranch(branch);
  if (pr?.merged_at) throw new HttpError(409, 'This change is already published; unpublish the story instead.');
  if (pr && pr.state === 'open') await gh.closePull(pr.number);
  await gh.deleteBranch(branch);
  return { ok: true, branch };
}

/** Review decisions on an editorial PR: hold, release, send back for changes, reject. Recorded on the PR itself. */
async function review(gh, body) {
  const number = Number(body.number);
  const what = String(body.action || '');
  const note = String(body.note || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 2000);
  if (!Number.isInteger(number) || !REVIEW_ACTIONS.has(what)) throw new HttpError(400, 'Invalid review action.');
  const pr = await gh.pull(number);
  if (pr.state !== 'open') throw new HttpError(409, 'This pull request is already closed.');
  if ((what === 'sendback' || what === 'reject') && note.length < 3) throw new HttpError(400, 'Add a short note explaining the decision.');
  const quoted = note ? `\n\n> ${note.replace(/\n/g, '\n> ')}` : '';
  if (what === 'hold') {
    await gh.setLabel(number, 'hold', true);
    await gh.comment(number, `Held from the Nuvellum admin dashboard. Nothing will publish until it is released.${quoted}`);
  } else if (what === 'release') {
    await gh.setLabel(number, 'hold', false);
    await gh.setLabel(number, 'needs-human', false);
    await gh.comment(number, `Released from hold in the Nuvellum admin dashboard.${quoted}`);
  } else if (what === 'sendback') {
    await gh.setLabel(number, 'needs-human', true);
    await gh.comment(number, `Sent back for changes from the Nuvellum admin dashboard.${quoted}`);
  } else {
    await gh.setLabel(number, 'rejected', true);
    await gh.comment(number, `Rejected in the Nuvellum admin dashboard; the story will not be published.${quoted}`);
    await gh.closePull(number);
  }
  return { ok: true, number, action: what };
}
