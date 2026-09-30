// The admin's only route to GitHub. Every write is confined to one repository, to the admin's own
// manual/<slug>-<stamp> branches or existing newsroom incoming/** branches, and to a story's own
// Markdown file and uploaded image. GitHub error bodies never leave this module: callers get a status
// and a short, safe message.
export const REPO = 'Sh-010/Nuvellum';
export const BASE_BRANCH = 'main';
export const ARTICLES_DIR = 'src/content/articles';
export const UPLOADS_DIR = 'public/uploads/articles';
export const AI_ART_DIR = 'public/generated/ai';
export const BRANCH_PREFIX = 'manual/';
export const BRANCH_RE = /^manual\/([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{14})$/;
// Newsroom branches (created by n8n). The admin may review, edit, label, close and merge their PRs, but never creates them.
export const INCOMING_RE = /^incoming\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
export const REVIEW_LABELS = Object.freeze(['hold', 'needs-human', 'rejected']);
const ARTICLE_FILE_RE = /^src\/content\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const UPLOAD_FILE_RE = /^public\/uploads\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\.(jpg|png|webp)$/;
// Workflows whose runs must be green on the PR head before the dashboard offers to merge. GitHub's
// branch protection enforces its own required checks on merge regardless.
export const REQUIRED_WORKFLOWS = Object.freeze(['Build Nuvellum', 'Security checks', 'CodeQL', 'Editorial duplicate guard']);
// Newsroom PRs also run the licensed-image pass; the auto-publish gate requires it too.
export const REQUIRED_WORKFLOWS_INCOMING = Object.freeze([...REQUIRED_WORKFLOWS, 'Acquire editorial visual']);
export const requiredWorkflowsFor = (branch) => (INCOMING_RE.test(String(branch)) ? REQUIRED_WORKFLOWS_INCOMING : REQUIRED_WORKFLOWS);
export const isIncoming = (branch) => INCOMING_RE.test(String(branch || ''));
const isWorkBranch = (b) => typeof b === 'string' && b.length <= 120 && (BRANCH_RE.test(b) || INCOMING_RE.test(b));

export class GitHubError extends Error {
  constructor(status, safeMessage) { super(safeMessage); this.status = status; }
}

export function branchFor(slug, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const branch = `${BRANCH_PREFIX}${String(slug).slice(0, 80).replace(/-+$/, '')}-${stamp}`;
  assertBranch(branch);
  return branch;
}

/** A dashboard branch (manual/...). */
export function assertBranch(branch) {
  if (typeof branch !== 'string' || branch.length > 120 || !BRANCH_RE.test(branch)) throw new GitHubError(400, 'Invalid working branch.');
  return branch;
}

/** A branch the admin may commit to: its own manual/... branches or an existing newsroom incoming/... branch. */
export function assertWorkBranch(branch) {
  if (!isWorkBranch(branch)) throw new GitHubError(400, 'Invalid working branch.');
  return branch;
}

export function articlePath(slug) {
  const p = `${ARTICLES_DIR}/${slug}.md`;
  if (!ARTICLE_FILE_RE.test(p)) throw new GitHubError(400, 'Invalid article slug.');
  return p;
}

export function uploadPath(slug, ext) {
  const p = `${UPLOADS_DIR}/${slug}.${ext}`;
  if (!UPLOAD_FILE_RE.test(p)) throw new GitHubError(400, 'Invalid image path.');
  return p;
}

/** Only the article file and its own image may ever be written, and both must belong to `slug`. */
export function assertWritablePaths(paths, slug) {
  for (const p of paths) {
    const a = p.match(ARTICLE_FILE_RE), u = p.match(UPLOAD_FILE_RE);
    if (!(a && a[1] === slug) && !(u && u[1] === slug)) throw new GitHubError(400, 'Refusing to write outside the article and its image.');
  }
}

/** The single story a PR adds or changes, from its file list (null if it touches anything else). */
export function storySlugFromFiles(files) {
  const articles = files.map((f) => f.filename.match(ARTICLE_FILE_RE)).filter(Boolean);
  if (articles.length !== 1) return null;
  const slug = articles[0][1];
  const ok = files.every((f) => f.status !== 'removed' && f.status !== 'renamed' && (
    f.filename === `${ARTICLES_DIR}/${slug}.md` || UPLOAD_FILE_RE.test(f.filename) && f.filename.match(UPLOAD_FILE_RE)[1] === slug ||
    f.filename === `${AI_ART_DIR}/${slug}.svg`));
  return ok ? slug : null;
}

const HUMAN = {
  401: 'GitHub rejected the admin credential. Check NUVELLUM_GITHUB_TOKEN.',
  403: 'GitHub refused this action for the admin credential (permissions or branch protection).',
  404: 'Not found on GitHub.',
  405: 'GitHub will not merge this pull request yet (required checks or conflicts).',
  409: 'The repository changed while you were editing. Reload the article and try again.',
  422: 'GitHub rejected the change as invalid or out of date. Reload and try again.'
};

export function createGitHub({ token, fetchImpl = globalThis.fetch, log = console } = {}) {
  if (!token) throw new GitHubError(503, 'Admin is not connected to GitHub (NUVELLUM_GITHUB_TOKEN is not set).');
  const api = 'https://api.github.com';
  // Fine-grained tokens report their expiry on every response ("2026-12-29 12:00:00 UTC"); the desk shows a
  // warning before it lapses, because an expired token silently stops publishing from /admin.
  let tokenExpiresAt = null;

  async function call(method, path, body, { allow404 = false } = {}) {
    let res;
    try {
      res = await fetchImpl(api + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'nuvellum-admin',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new GitHubError(502, 'Could not reach GitHub. Try again in a moment.');
    }
    const exp = Date.parse(String(res.headers?.get?.('github-authentication-token-expiration') || '').replace(' UTC', 'Z').replace(' ', 'T'));
    if (exp) tokenExpiresAt = new Date(exp).toISOString();
    if (allow404 && res.status === 404) return null;
    if (res.status === 204) return {};
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
    if (!res.ok) {
      // Internal detail stays in the function log; the browser only ever sees HUMAN[status].
      log.error?.(`[admin] GitHub ${method} ${path.replace(/\?.*$/, '')} -> ${res.status}`);
      throw new GitHubError(res.status >= 500 ? 502 : res.status, HUMAN[res.status] || 'GitHub could not complete this action.');
    }
    return json;
  }
  const repo = `/repos/${REPO}`;

  async function graphql(query, variables) {
    const out = await call('POST', '/graphql', { query, variables });
    if (!out || out.errors) {
      log.error?.('[admin] GitHub GraphQL error');
      throw new GitHubError(502, 'GitHub could not list the articles.');
    }
    return out.data;
  }

  return {
    /** ISO expiry of the token, once any response has reported it (null for tokens without an expiry). */
    tokenExpiry: () => tokenExpiresAt,
    /** All article files (text + blob sha) and the names of local images/AI art on a ref, in one query. */
    async snapshot(ref = BASE_BRANCH) {
      const [owner, name] = REPO.split('/');
      const q = `query($owner:String!,$name:String!,$a:String!,$u:String!,$g:String!){repository(owner:$owner,name:$name){
        a:object(expression:$a){...on Tree{entries{name oid object{...on Blob{text}}}}}
        u:object(expression:$u){...on Tree{entries{name}}}
        g:object(expression:$g){...on Tree{entries{name}}}}}`;
      const d = await graphql(q, { owner, name, a: `${ref}:${ARTICLES_DIR}`, u: `${ref}:${UPLOADS_DIR}`, g: `${ref}:${AI_ART_DIR}` });
      const r = d?.repository || {};
      return {
        articles: (r.a?.entries || []).filter(e => /\.md$/.test(e.name)).map(e => ({ name: e.name, sha: e.oid, text: e.object?.text ?? '' })),
        uploads: new Set((r.u?.entries || []).map(e => e.name)),
        aiArt: new Set((r.g?.entries || []).map(e => e.name))
      };
    },

    /** An article file on a ref (branch name or commit sha) with its blob sha, or null. */
    async readArticle(slug, ref = BASE_BRANCH) {
      const out = await call('GET', `${repo}/contents/${articlePath(slug)}?ref=${encodeURIComponent(ref)}`, null, { allow404: true });
      if (!out) return null;
      return { sha: out.sha, text: Buffer.from(out.content || '', 'base64').toString('utf8') };
    },

    async uploadExists(path, ref = BASE_BRANCH) {
      if (!/^\/uploads\/articles\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(path)) return false;
      const out = await call('GET', `${repo}/contents/public${path}?ref=${encodeURIComponent(ref)}`, null, { allow404: true });
      return Boolean(out && out.type === 'file');
    },

    async branchHead(branch) {
      const out = await call('GET', `${repo}/git/ref/heads/${branch === BASE_BRANCH ? BASE_BRANCH : assertWorkBranch(branch)}`, null, { allow404: true });
      return out?.object?.sha || null;
    },

    async manualBranches() {
      const out = await call('GET', `${repo}/git/matching-refs/heads/manual`, null, { allow404: true });
      return (out || []).map(r => ({ branch: r.ref.replace(/^refs\/heads\//, ''), sha: r.object?.sha }))
        .filter(r => BRANCH_RE.test(r.branch));
    },

    /** Open (or recently closed) PRs from dashboard and newsroom branches in this repository. */
    async editorialPulls(state = 'open') {
      const out = await call('GET', `${repo}/pulls?state=${state}&base=${BASE_BRANCH}&per_page=100&sort=updated&direction=desc`);
      return (out || []).filter(p => p.head?.repo?.full_name === REPO && isWorkBranch(p.head?.ref || ''));
    },

    async recentlyClosed() {
      return (await this.editorialPulls('closed')).slice(0, 30);
    },

    async manualPulls(state = 'open') {
      return (await this.editorialPulls(state)).filter(p => BRANCH_RE.test(p.head.ref));
    },

    async pullForBranch(branch) {
      assertWorkBranch(branch);
      const out = await call('GET', `${repo}/pulls?state=all&head=${encodeURIComponent(REPO.split('/')[0] + ':' + branch)}&per_page=5`);
      return (out || []).find(p => p.head?.ref === branch) || null;
    },

    async pull(number) {
      if (!Number.isInteger(number) || number < 1) throw new GitHubError(400, 'Invalid pull request.');
      const pr = await call('GET', `${repo}/pulls/${number}`);
      if (pr?.head?.repo?.full_name !== REPO || !isWorkBranch(pr?.head?.ref || '') || pr?.base?.ref !== BASE_BRANCH) throw new GitHubError(403, 'Not an editorial pull request.');
      return pr;
    },

    async pullFiles(number) {
      return (await call('GET', `${repo}/pulls/${number}/files?per_page=100`)) || [];
    },

    async workflowRuns(sha) {
      if (!/^[0-9a-f]{40}$/.test(String(sha))) throw new GitHubError(400, 'Invalid commit.');
      const out = await call('GET', `${repo}/actions/runs?head_sha=${sha}&per_page=100`);
      return (out?.workflow_runs || []).map(r => ({ name: r.name, status: r.status, conclusion: r.conclusion, event: r.event, created_at: r.created_at, url: r.html_url }));
    },

    /**
     * One atomic commit on a work branch. `expectedArticleSha` is the article blob sha the editor loaded
     * (null for a new article); if the file has moved on since, nothing is written (409). The ref update
     * is a fast-forward only, so a concurrent push also fails instead of being overwritten.
     */
    async commit({ branch, slug, files, message, expectedArticleSha }) {
      assertWorkBranch(branch);
      assertWritablePaths(files.map(f => f.path), slug);
      const existing = await this.branchHead(branch);
      if (!existing && !BRANCH_RE.test(branch)) throw new GitHubError(404, 'That newsroom branch no longer exists.');
      // Editor commits on newsroom branches are marked so the licensed-image pass leaves the editor's visual decision alone.
      if (INCOMING_RE.test(branch) && !/^editor: /.test(message)) throw new GitHubError(400, 'Editor commits on newsroom branches must be marked.');
      const parent = existing || await this.branchHead(BASE_BRANCH);
      if (!parent) throw new GitHubError(502, 'Could not read the main branch.');
      const current = await call('GET', `${repo}/contents/${articlePath(slug)}?ref=${parent}`, null, { allow404: true });
      if ((current?.sha || null) !== (expectedArticleSha || null)) throw new GitHubError(409, HUMAN[409]);
      const parentCommit = await call('GET', `${repo}/git/commits/${parent}`);
      const tree = [];
      for (const f of files) {
        const blob = await call('POST', `${repo}/git/blobs`, f.base64 !== undefined ? { content: f.base64, encoding: 'base64' } : { content: f.content, encoding: 'utf-8' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await call('POST', `${repo}/git/trees`, { base_tree: parentCommit.tree.sha, tree });
      const commit = await call('POST', `${repo}/git/commits`, { message, tree: newTree.sha, parents: [parent] });
      if (existing) await call('PATCH', `${repo}/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
      else await call('POST', `${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
      const articleFile = files.find(f => f.path === articlePath(slug));
      const blobSha = articleFile ? tree.find(t => t.path === articleFile.path).sha : current?.sha || null;
      return { commit: commit.sha, articleSha: blobSha };
    },

    async openPull({ branch, title, body }) {
      assertBranch(branch); // the admin opens PRs only for its own branches; the newsroom opens its own
      return call('POST', `${repo}/pulls`, { head: branch, base: BASE_BRANCH, title: String(title).slice(0, 240), body: String(body).slice(0, 60000), maintainer_can_modify: false });
    },

    /** Squash-merge only if the head is still the commit that was checked. GitHub enforces branch protection. */
    async merge({ number, sha, title }) {
      const pr = await this.pull(number);
      if (pr.head.sha !== sha) throw new GitHubError(409, HUMAN[409]);
      return call('PUT', `${repo}/pulls/${number}/merge`, { merge_method: 'squash', sha, commit_title: String(title).slice(0, 240) });
    },

    async closePull(number) {
      await this.pull(number);
      return call('PATCH', `${repo}/pulls/${number}`, { state: 'closed' });
    },

    async setLabel(number, label, on) {
      if (!REVIEW_LABELS.includes(label)) throw new GitHubError(400, 'Unknown review label.');
      await this.pull(number);
      if (on) return call('POST', `${repo}/issues/${number}/labels`, { labels: [label] });
      return call('DELETE', `${repo}/issues/${number}/labels/${encodeURIComponent(label)}`, null, { allow404: true });
    },

    async comment(number, text) {
      await this.pull(number);
      return call('POST', `${repo}/issues/${number}/comments`, { body: String(text).slice(0, 4000) });
    },

    async deleteBranch(branch) {
      assertBranch(branch); // newsroom branches are left to the repository's own cleanup workflow
      return call('DELETE', `${repo}/git/refs/heads/${branch}`, null, { allow404: true });
    }
  };
}
