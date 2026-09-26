// Executes the generated n8n Code-node snippets in a sandbox that mimics n8n:
// $input.all() items in, [{ json }] out, and NO require()/import available.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { SENSITIVE_CRITERIA, EDITORIAL_CRITERIA } from '../scripts/lib/newsroom.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function runSnippet(file, items) {
  const code = readFileSync(join(root, 'n8n', 'snippets', file), 'utf8');
  const sandbox = { $input: { all: () => items.map(json => ({ json })) }, URL, TextEncoder, Buffer, console };
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){\n${code}\n})()`, sandbox, { timeout: 5000 })));
}

test('committed snippets are generated from the current libraries', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'build-n8n-snippets.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('snippets do not depend on require() or imports', () => {
  for (const f of ['normalize-candidates.js', 'parse-review.js', 'parse-verification.js', 'validate-svg.js', 'build-article.js']) {
    const code = readFileSync(join(root, 'n8n', 'snippets', f), 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /\brequire\(|^import |^export /m, f);
  }
});

test('normalize-candidates: skips missing URLs, live blogs and in-run duplicates; strips tracking', () => {
  const out = runSnippet('normalize-candidates.js', [
    { title: 'A', link: 'https://www.bbc.co.uk/news/articles/abc?at_medium=RSS&at_campaign=rss' },
    { title: 'A again', link: 'https://bbc.co.uk/news/articles/abc' },
    { title: 'No URL' },
    { title: 'Bad URL', link: 'not a url' },
    { title: 'Live', link: 'https://www.dw.com/en/germany-news/live-79441034?maca=en-rss' },
    { title: 'B', link: 'https://www.france24.com/en/x' }
  ]);
  assert.deepEqual(out.map(o => o.json.canonicalUrl), ['https://bbc.co.uk/news/articles/abc', 'https://france24.com/en/x']);
  assert.match(out[0].json.sourceHash, /^[0-9a-f]{8}$/);
});

test('parse-review / parse-verification: fail closed on garbage, clear on complete passes', () => {
  const pass = (list) => Object.fromEntries(list.map(c => [c, 'pass']));
  const r = runSnippet('parse-review.js', [
    { reviewText: JSON.stringify({ verdict: 'passed', risk: 'low', checks: pass(EDITORIAL_CRITERIA) }) },
    { reviewText: 'Sorry, I could not review this.' }
  ]);
  assert.equal(r[0].json.review.editorialReview, 'passed');
  assert.equal(r[1].json.review.editorialReview, 'uncertain');
  const v = runSnippet('parse-verification.js', [
    { verificationText: JSON.stringify({ verdict: 'cleared', checks: pass(SENSITIVE_CRITERIA) }) },
    { verificationText: JSON.stringify({ verdict: 'cleared', checks: { unsupported_factual_assertions: 'pass' } }) }
  ]);
  assert.equal(v[0].json.verification.verification, 'cleared');
  assert.equal(v[1].json.verification.verification, 'uncertain');
});

test('validate-svg: unsafe art is dropped so the section image is used', () => {
  const good = readFileSync(join(root, 'tests', 'fixtures', 'svg', 'real-pope-leo-xiv.svg'), 'utf8');
  const out = runSnippet('validate-svg.js', [
    { svg: good },
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' },
    { svg: '' }
  ]);
  assert.deepEqual(out.map(o => o.json.aiArt), [true, false, false]);
  assert.equal(out[1].json.svg, '');
});

test('build-article: produces a gate-compatible file inside n8n', () => {
  const [o] = runSnippet('build-article.js', [{
    title: 'Diesel tops £2 at hundreds of Scottish forecourts', dek: 'Rural drivers are paying most.', section: 'Business',
    date: '2026-09-25', publishedAt: '2026-09-25T08:00:00Z', bodyMarkdown: 'Diesel prices rose again this week. '.repeat(30),
    tags: ['Fuel'], sourceUrls: ['https://www.bbc.co.uk/news/articles/cr86xn04gxj9o?at_medium=RSS'], sourceOutlet: 'BBC',
    aiArt: false, sectionImage: '/images/business.svg', review: { editorialReview: 'passed', risk: 'low' }
  }]);
  assert.equal(o.json.article.status, 'published');
  assert.match(o.json.article.branch, /^incoming\/diesel-tops-2-at-hundreds-of-scottish-forecourts-[0-9a-f]{8}$/);
  assert.match(o.json.article.markdown, /editorialReview: "passed"/);
});
