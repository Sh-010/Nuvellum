import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeIssue, describeIssues } from '../src/lib/admin-messages.js';
import { articleErrors } from '../scripts/lib/article-rules.mjs';
import { checkArticle } from '../scripts/lib/admin/editor.mjs';

const JARGON = /frontmatter|JSON-style|imageAlt|reviewedBy|publishedAt|sourceUrls|editorialReview|imageLicenseUrl|imageSourcePage|imageKind|YYYY|\.md\b|slug\/filename|ISO 8601/i;

test('missing dek points to the Dek field in editorial language', () => {
  const d = describeIssue('missing required frontmatter field "dek"');
  assert.equal(d.text, 'Add a dek before publishing.');
  assert.equal(d.field, 'f-dek');
  assert.equal(d.group, null, 'the dek is always visible');
  assert.equal(describeIssue('my-story.md: missing required frontmatter field "dek"').text, 'Add a dek before publishing.', 'file prefix removed');
});

test('missing tags points to Tags and opens Classification', () => {
  const d = describeIssue('tags must be a non-empty JSON-style array');
  assert.equal(d.text, 'Add at least one tag.');
  assert.equal(d.field, 'tag-in');
  assert.equal(d.group, 'g-class');
  assert.equal(describeIssue('missing required frontmatter field "tags"').text, 'Add at least one tag.');
  assert.equal(describeIssues(['missing required frontmatter field "tags"', 'tags must be a non-empty JSON-style array']).length, 1, 'the same instruction is shown once');
});

test('every message the validator can raise for a broken manual story reads as editorial language', () => {
  const src = `---
title: "<b>T</b>"
section: "Weather"
type: "Rant"
author: ""
date: "29/09/2026"
publishedAt: "yesterday"
updated: "soon"
readingTime: "1 min"
status: "live"
tags: []
regions: ["mars","mars","a","b","c"]
countries: ["Atlantis","Atlantis"]
origin: "manual"
risk: "maybe"
editorialReview: "sure"
verification: "ok"
reviewedBy: "Nuvellum Verification Pipeline"
image: "ftp://x/y.png"
sourceUrls: ["http://insecure.example"]
imageLicenseUrl: "http://licence"
---

<script>alert(1)</script> [x](javascript:alert(1))
`;
  const raw = articleErrors(src, 'broken-story.md', { registry: { titles: new Map(), sources: new Map() }, aiArtExists: () => false, publicFileExists: () => false });
  assert.ok(raw.length >= 12, `validator produced ${raw.length} messages`);
  const out = describeIssues(raw);
  for (const d of out) assert.doesNotMatch(d.text, JARGON, `still technical: "${d.text}" (from "${d.raw}")`);
  const fields = new Set(out.map((d) => d.field));
  for (const f of ['f-section', 'f-type', 'f-date', 'f-published', 'tag-in', 'regions', 'country-in', 'risk', 'f-review', 'f-verify', 'f-reviewer', 'f-body', 'f-sources'])
    assert.ok(fields.has(f), `an issue points at ${f}`);
});

test('publication gates, slugs, images and uploads get plain instructions with a target field', () => {
  const cases = {
    'Publication gate not met: Risk assessed (Low or Sensitive).': ['Before publishing: choose a risk level.', 'risk'],
    'Publication gate not met: Editorial review: passed.': ['Before publishing: record editorial review as Passed.', 'f-review'],
    'Publication gate not met: Verification: cleared (sensitive story).': [/verification as Cleared/, 'f-verify'],
    'Publication gate not met: Named reviewer who cleared verification (sensitive story).': [/name the person/, 'f-reviewer'],
    'x.md: image needs imageAlt': ['Add alt text that describes the image.', 'f-alt'],
    'x.md: raw HTML is blocked in article bodies; use Markdown only': [/Remove the HTML/, 'f-body'],
    'x.md: link target "javascript:alert(1)" is not allowed; use https://, mailto:, a /site path or #anchor': [/Links must start with https:\/\//, 'f-body'],
    'x.md: duplicate title also used by other-story.md': ['This story already exists.', 'f-title'],
    'The slug "taken" is already used by a published or saved story. Choose another.': ['This story already exists.', 'f-title'],
    'The image is 320px wide; use at least 600px so it is sharp on the article page.': [/320px/, 'f-file']
  };
  for (const [raw, [text, field]] of Object.entries(cases)) {
    const d = describeIssue(raw);
    if (text instanceof RegExp) assert.match(d.text, text, raw); else assert.equal(d.text, text, raw);
    assert.equal(d.field, field, raw);
    assert.doesNotMatch(d.text, JARGON, raw);
  }
  assert.equal(describeIssue('x.md: image needs imageAlt').group, 'g-image');
});

test('warnings stay non-blocking: a text-led story passes every gate and only warns', () => {
  const md = `---
title: "A clear headline"
dek: "A clear dek."
section: "Science"
type: "Essay"
author: "Sam Shehab"
date: "2026-09-29"
readingTime: "1 min read"
status: "published"
tags: ["science"]
origin: "manual"
risk: "low"
editorialReview: "passed"
---

A paragraph of text.
`;
  const data = { title: 'A clear headline', dek: 'A clear dek.', section: 'Science', type: 'Essay', origin: 'manual', risk: 'low', editorialReview: 'passed', status: 'published' };
  const r = checkArticle({ slug: 'a-clear-headline', markdown: md, data, snapshot: { articles: [], uploads: new Set(), aiArt: new Set() }, isNew: true, intent: 'publish' });
  assert.deepEqual(r.errors, [], 'nothing blocks publication');
  assert.ok(r.warnings.includes('No image: the story will be set text-led.'));
  const w = describeIssue('No image: the story will be set text-led.');
  assert.match(w.text, /text-led/);
  assert.doesNotMatch(w.text, /must|before publishing/i, 'the warning does not read as a blocker');
});

test('the validator and the gate check never show the same gate twice', () => {
  const both = describeIssues([
    'x.md: a manual story can only be published with editorialReview: "passed" (is "missing")',
    'Publication gate not met: Editorial review: passed.',
    'x.md: a sensitive manual story can only be published with verification: "cleared" (is "missing")',
    'Publication gate not met: Verification: cleared (sensitive story).',
    'x.md: a sensitive manual story can only be published with a named reviewedBy',
    'Publication gate not met: Named reviewer who cleared verification (sensitive story).'
  ]);
  assert.deepEqual(both.map((d) => d.field), ['f-review', 'f-verify', 'f-reviewer']);
});

test('image address messages point at the Image URL field', () => {
  const d = describeIssue('Image URL must use https://.');
  assert.equal(d.text, 'The image address must use https://.');
  assert.equal(d.field, 'f-imgurl'); assert.equal(d.group, 'g-image');
  assert.equal(describeIssue('SVG images are not accepted.').group, 'g-image');
});

test('unknown messages fall back to the original sentence, tidied, never dropped', () => {
  const d = describeIssue('x.md: something new the validator says');
  assert.equal(d.text, 'Something new the validator says.');
  assert.equal(d.field, null);
});

test('the editor renders translated issues, marks and opens fields for blockers only, and clears them on edit', () => {
  const page = readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  assert.match(page, /import \{ describeIssues \} from '\.\.\/lib\/admin-messages\.js'/);
  assert.match(page, /const issues = describeIssues\(items\)/);
  assert.match(page, /if \(id === 'errors'\) markIssues\(issues\)/, 'only blockers mark fields and open groups');
  assert.match(page, /onclick: \(\) => goToField\(it\)/, 'clicking an issue goes to its field');
  assert.match(page, /\$\('view-editor'\)\.addEventListener\('input', \(ev\) => clearIssueFrom\(ev\.target\)\)/, 'editing a field clears its blocker at once');
  assert.match(page, /Worth a look · won’t block/);
  assert.match(page, /Must fix before publishing/);
});

test('duplicates name the existing story and offer a distinct web address for address clashes', () => {
  const title = describeIssue('new-story.md: duplicate title also used by other-story.md');
  assert.equal(title.existing, 'other-story'); assert.equal(title.distinct, false);
  const slug = describeIssue('The slug "other-story" is already used by a published or saved story. Choose another.');
  assert.deepEqual([slug.text, slug.field, slug.existing, slug.distinct], ['This story already exists.', 'f-title', 'other-story', true]);
  const draft = describeIssue('The slug "desk-draft" is already being worked on in another dashboard draft.');
  assert.deepEqual([draft.existing, draft.distinct], ['desk-draft', true]);
  // A reused headline usually clashes on web address too: one note, offering both remedies.
  const both = describeIssues(['The slug "other-story" is already used by a published or saved story. Choose another.', 'new.md: duplicate title also used by other-story.md']);
  assert.equal(both.length, 1); assert.equal(both[0].existing, 'other-story'); assert.equal(both[0].distinct, true);
});

test('a story is never a duplicate of itself; a different story with the same headline is', () => {
  const md = (title) => `---\ntitle: "${title}"\ndek: "D"\nsection: "World"\ntype: "News"\nauthor: "A"\ndate: "2026-09-29"\nreadingTime: "1 min"\nstatus: "published"\ntags: ["t"]\norigin: "manual"\nrisk: "low"\neditorialReview: "passed"\n---\n\nBody.\n`;
  const snapshot = { articles: [{ name: 'existing-story.md', text: md('Existing Story'), sha: 'a' }], uploads: new Set(), aiArt: new Set() };
  const data = { title: 'Existing Story', origin: 'manual', risk: 'low', editorialReview: 'passed' };
  const self = checkArticle({ slug: 'existing-story', markdown: md('Existing Story'), data, snapshot, isNew: false, intent: 'publish' });
  assert.ok(!self.errors.some((e) => /duplicate title|already used/.test(e)), `editing itself: ${self.errors}`);
  const other = checkArticle({ slug: 'existing-story-2', markdown: md('Existing Story'), data, snapshot, isNew: true, intent: 'draft' });
  assert.ok(other.errors.some((e) => /duplicate title also used by existing-story\.md/.test(e)));
  const clash = checkArticle({ slug: 'existing-story', markdown: md('Something else'), data: { ...data, title: 'Something else' }, snapshot, isNew: true, intent: 'draft' });
  assert.ok(clash.safetyErrors.some((e) => /already used by a published or saved story/.test(e)), 'a new story can never be saved over an existing one, not even as a draft');
});

test('the editor offers Open existing article and a distinct web address, and keeps new addresses distinct', () => {
  const page = readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  assert.match(page, /text: 'Open existing article', onclick: \(\) => openExisting\(it\.existing\)/);
  assert.match(page, /text: 'Create as a different story', onclick: \(\) => createAsDifferent\(it\.existing\)/);
  assert.match(page, /if \(!S\.strict && !quietOk\(it\)\) continue;/, 'while drafting only draft-blocking problems and duplicates are marked');
  assert.match(page, /if \(intent !== 'draft'\) goStrict\(\);/, 'submitting or publishing brings the requirements forward');
  assert.match(page, /clearLocal\(recoveryKey\(\), recoveryKey\(r\.slug\)\)/, 'a successful save clears the local copy');
  assert.doesNotMatch(page, /localStorage\.setItem\([^)]*(csrf|password|token)/i, 'nothing session-related is stored locally');
  assert.match(page, /\$\('f-slug'\)\.value = distinctSlug\(slugify\(\$\('f-title'\)\.value\)\)/, 'auto web address skips taken ones');
  assert.match(page, /const isSelf = it\.existing === S\.ed\?\.slug/, 'never offers to open the story being edited');
});
