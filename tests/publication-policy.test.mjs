import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePublication, contentPolicyErrors, duplicateConflicts, normalizeSource,
  REQUIRED_CHECKS, VERIFICATION_REVIEWER
} from '../scripts/lib/editorial.mjs';

const REPO = 'Sh-010/Nuvellum';
const SLUG = 'a-new-story';

function md(fields = {}) {
  const base = {
    title: 'A new story', dek: 'Standfirst', section: 'World', type: 'News',
    status: 'published', origin: 'automation', risk: 'low', editorialReview: 'passed',
    sourceUrls: ['https://example.com/a'], ...fields
  };
  const fm = Object.entries(base).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? JSON.stringify(v) : JSON.stringify(String(v))}`).join('\n');
  return `---\n${fm}\n---\n\nBody.\n`;
}

const sensitiveCleared = { risk: 'sensitive', verification: 'cleared', reviewedBy: VERIFICATION_REVIEWER };

function input(over = {}) {
  const sha = 'abc1234def';
  return {
    repo: REPO,
    pr: {
      state: 'open', draft: false, labels: [],
      base: { ref: 'main' },
      head: { ref: `incoming/${SLUG}-1a2b3c4d`, sha, repo: { full_name: REPO } },
      ...(over.pr || {})
    },
    files: over.files || [
      { filename: `src/content/articles/${SLUG}.md`, status: 'added' },
      { filename: `public/generated/ai/${SLUG}.svg`, status: 'added' }
    ],
    article: over.article ?? md(over.fields),
    runs: over.runs || REQUIRED_CHECKS.map(name => ({ name, status: 'completed', conclusion: 'success', created_at: '2026-09-26T10:00:00Z' }))
  };
}

const ok = (i) => { const r = evaluatePublication(i); assert.equal(r.publish, true, r.reasons.join('; ')); };
const no = (i, re) => { const r = evaluatePublication(i); assert.equal(r.publish, false); if (re) assert.match(r.reasons.join('\n'), re); };

// ---- Low-risk ----------------------------------------------------------
test('low-risk: publishes after editorial review passed and all checks green', () => ok(input()));
test('low-risk: publishes without AI art', () => ok(input({ files: [{ filename: `src/content/articles/${SLUG}.md`, status: 'added' }] })));
test('low-risk: blocked without editorial review', () => no(input({ fields: { editorialReview: undefined } }), /editorialReview/));
test('low-risk: blocked when editorial review failed', () => no(input({ fields: { editorialReview: 'failed' } }), /editorialReview/));
test('low-risk: blocked when status is review', () => no(input({ fields: { status: 'review' } }), /status/));
test('low-risk: blocked if a verification ran and did not clear', () => no(input({ fields: { verification: 'uncertain' } }), /verification/));

// ---- Sensitive ---------------------------------------------------------
test('sensitive: publishes only when verification cleared by the pipeline', () => ok(input({ fields: sensitiveCleared })));
test('sensitive: blocked when verification failed', () => no(input({ fields: { ...sensitiveCleared, verification: 'failed' } }), /verification/));
test('sensitive: blocked when verification uncertain', () => no(input({ fields: { ...sensitiveCleared, verification: 'uncertain' } }), /verification/));
test('sensitive: blocked when verification missing', () => no(input({ fields: { risk: 'sensitive', reviewedBy: VERIFICATION_REVIEWER } }), /verification/));
test('sensitive: blocked when reviewer is not the verification pipeline', () => no(input({ fields: { ...sensitiveCleared, reviewedBy: 'Someone' } }), /reviewedBy/));
test('sensitive: blocked when status is still review', () => no(input({ fields: { ...sensitiveCleared, status: 'review' } }), /status/));
test('unknown risk is blocked', () => no(input({ fields: { risk: undefined } }), /risk/));

// ---- Checks ------------------------------------------------------------
test('blocked while a required check is still running', () => {
  const runs = REQUIRED_CHECKS.map(name => ({ name, status: name === 'CodeQL' ? 'in_progress' : 'completed', conclusion: name === 'CodeQL' ? null : 'success', created_at: 't1' }));
  no(input({ runs }), /CodeQL/);
});
test('blocked when a required check failed', () => {
  const runs = REQUIRED_CHECKS.map(name => ({ name, status: 'completed', conclusion: name === 'Build Nuvellum' ? 'failure' : 'success', created_at: 't1' }));
  no(input({ runs }), /Build Nuvellum/);
});
test('blocked when a required check never ran', () => no(input({ runs: [] }), /has not run/));
test('uses the latest run of each check (a re-run fixing a failure counts)', () => {
  const runs = [
    ...REQUIRED_CHECKS.map(name => ({ name, status: 'completed', conclusion: 'success', created_at: '2026-09-26T10:05:00Z' })),
    { name: 'Security checks', status: 'completed', conclusion: 'failure', created_at: '2026-09-26T10:00:00Z' }
  ];
  ok(input({ runs }));
});
test('a newer failing run overrides an older success', () => {
  const runs = [
    ...REQUIRED_CHECKS.map(name => ({ name, status: 'completed', conclusion: 'success', created_at: '2026-09-26T10:00:00Z' })),
    { name: 'Security checks', status: 'completed', conclusion: 'cancelled', created_at: '2026-09-26T10:05:00Z' }
  ];
  no(input({ runs }), /cancelled/);
});

// ---- Scope and PR shape ------------------------------------------------
test('blocked when the PR modifies an existing (published) article', () => no(input({ files: [{ filename: `src/content/articles/${SLUG}.md`, status: 'modified' }] }), /not modify/));
test('blocked when the PR touches files outside articles/AI art', () => no(input({ files: [
  { filename: `src/content/articles/${SLUG}.md`, status: 'added' },
  { filename: '.github/workflows/build.yml', status: 'modified' }
] }), /outside the automated publishing scope/));
test("blocked when AI art belongs to another slug", () => no(input({ files: [
  { filename: `src/content/articles/${SLUG}.md`, status: 'added' },
  { filename: 'public/generated/ai/other.svg', status: 'added' }
] }), /outside/));
test('blocked with two articles', () => no(input({ files: [
  { filename: `src/content/articles/${SLUG}.md`, status: 'added' },
  { filename: 'src/content/articles/second.md', status: 'added' }
] }), /exactly one article/));
test('blocked for non-incoming branches', () => no(input({ pr: { head: { ref: 'feature/x', sha: 's', repo: { full_name: REPO } } } }), /incoming/));
test('blocked for forks', () => no(input({ pr: { head: { ref: 'incoming/x', sha: 's', repo: { full_name: 'evil/fork' } } } }), /not in this repository/));
test('blocked for drafts, closed PRs and other bases', () => {
  no(input({ pr: { draft: true } }), /draft/);
  no(input({ pr: { state: 'closed' } }), /not open/);
  no(input({ pr: { base: { ref: 'dev' } } }), /main/);
});
test('hold label stops publication', () => no(input({ pr: { labels: [{ name: 'hold' }] } }), /hold/));
test('human-led formats never auto-publish', () => {
  no(input({ fields: { type: 'Opinion' } }), /human-led/);
  no(input({ fields: { section: 'Opinion', type: 'Analysis' } }), /human-led/);
});
test('manual-origin articles never auto-publish', () => no(input({ fields: { origin: 'manual' } }), /origin/));
test('unparseable article is blocked', () => no(input({ article: 'no frontmatter' }), /parsed/));

// ---- Content policy (validator) ----------------------------------------
test('content policy: existing published articles without new fields remain valid', () => {
  assert.deepEqual(contentPolicyErrors({ origin: 'automation', risk: 'sensitive', status: 'published', reviewedBy: 'Sam Shehab' }, 'x'), []);
  assert.deepEqual(contentPolicyErrors({ origin: 'automation', risk: 'low', status: 'published', reviewedBy: '' }, 'x'), []);
});
test('content policy: failed/uncertain stories cannot be published', () => {
  for (const f of [{ verification: 'failed' }, { verification: 'uncertain' }, { editorialReview: 'failed' }, { editorialReview: 'uncertain' }]) {
    assert.ok(contentPolicyErrors({ origin: 'automation', status: 'published', ...f }, 'x').length, JSON.stringify(f));
  }
});
test('content policy: failed stories may exist as review/draft', () => {
  assert.deepEqual(contentPolicyErrors({ origin: 'automation', status: 'review', verification: 'failed' }, 'x'), []);
});
test('content policy: pipeline reviewer requires explicit clearance', () => {
  assert.ok(contentPolicyErrors({ origin: 'automation', status: 'published', reviewedBy: VERIFICATION_REVIEWER }, 'x').length);
  assert.deepEqual(contentPolicyErrors({ origin: 'automation', status: 'published', reviewedBy: VERIFICATION_REVIEWER, verification: 'cleared' }, 'x'), []);
});
test('content policy: rejects unknown values', () => {
  assert.ok(contentPolicyErrors({ origin: 'automation', verification: 'yes' }, 'x').length);
  assert.ok(contentPolicyErrors({ origin: 'automation', editorialReview: 'ok' }, 'x').length);
});

// ---- Duplicate guard ---------------------------------------------------
test('normalizeSource ignores tracking params, fragments, www and trailing slashes', () => {
  assert.equal(normalizeSource('https://www.BBC.co.uk/news/x/?at_medium=RSS#top'), normalizeSource('https://bbc.co.uk/news/x'));
});
test('duplicates: the older branch wins, the newer one yields', () => {
  const src = new Set(['https://bbc.co.uk/news/x']);
  const older = { ref: 'incoming/a', firstCommitAt: '2026-09-26T09:00:00Z', sources: src };
  const newer = { ref: 'incoming/b', firstCommitAt: '2026-09-26T10:00:00Z', sources: src };
  assert.equal(duplicateConflicts(newer, [older]).length, 1);
  assert.equal(duplicateConflicts(older, [newer]).length, 0);
});
test('duplicates: identical timestamps break ties deterministically', () => {
  const src = new Set(['https://x.com/a']);
  const a = { ref: 'incoming/a', firstCommitAt: 't', sources: src };
  const b = { ref: 'incoming/b', firstCommitAt: 't', sources: src };
  assert.equal(duplicateConflicts(a, [b]).length + duplicateConflicts(b, [a]).length, 1);
});
test('duplicates: different sources do not conflict', () => {
  const a = { ref: 'incoming/a', firstCommitAt: '1', sources: new Set(['https://x.com/a']) };
  const b = { ref: 'incoming/b', firstCommitAt: '0', sources: new Set(['https://x.com/b']) };
  assert.equal(duplicateConflicts(a, [b]).length, 0);
});
