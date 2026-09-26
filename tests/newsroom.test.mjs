import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalSourceUrl, trackingParams, isAggregatePage, sha256Hex, slugify, branchName, BRANCH_RE,
  readingTime, wordCount, looksTitleCase, parseVerification, parseEditorialReview, SENSITIVE_CRITERIA, EDITORIAL_CRITERIA
} from '../scripts/lib/newsroom.mjs';

test('canonicalSourceUrl strips tracking, fragments, www and trailing slashes', () => {
  assert.equal(canonicalSourceUrl('https://www.BBC.co.uk/news/articles/x/?at_medium=RSS&at_campaign=rss#top'), 'https://bbc.co.uk/news/articles/x');
  assert.equal(canonicalSourceUrl('http://example.com/a?id=5&utm_source=x'), 'https://example.com/a?id=5');
  assert.equal(canonicalSourceUrl('https://www.dw.com/en/x/a-1?maca=en-rss-en-all-1573-rdf'), 'https://dw.com/en/x/a-1');
  assert.throws(() => canonicalSourceUrl('javascript:alert(1)'));
  assert.throws(() => canonicalSourceUrl('not a url'));
  assert.deepEqual(trackingParams('https://x.com/a?utm_source=1&id=2&fbclid=3'), ['utm_source', 'fbclid']);
});

test('isAggregatePage catches live blogs, video and galleries but not normal articles', () => {
  for (const u of ['https://www.dw.com/en/germany-news-eu-ministers/live-79441034', 'https://www.bbc.co.uk/news/live/world-123', 'https://www.bbc.co.uk/news/av/world-1', 'https://www.theguardian.com/world/live/2026/sep/26/x', 'https://x.com/video/abc']) assert.ok(isAggregatePage(u), u);
  for (const u of ['https://www.bbc.co.uk/news/articles/cqgmrr9ekr7ko', 'https://www.aljazeera.com/news/2026/9/25/houthi-attack', 'https://www.france24.com/en/pope-leo-xiv-visits-france', 'https://deliveryservice.example/lively-market']) assert.ok(!isAggregatePage(u), u);
});

test('pure-JS sha256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'https://bbc.co.uk/news/articles/x', 'ü'.repeat(200), 'x'.repeat(64), 'y'.repeat(55)]) {
    assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'));
  }
});

test('branchName is deterministic per canonical source and matches the gate pattern', () => {
  const a = branchName('iran-reopens-strait', 'https://www.bbc.co.uk/news/articles/x?at_medium=RSS');
  const b = branchName('iran-reopens-strait', 'https://bbc.co.uk/news/articles/x/');
  assert.equal(a, b);
  assert.match(a, BRANCH_RE);
  assert.match(branchName('a'.repeat(120), 'https://x.com/1'), BRANCH_RE);
});

test('slugify handles accents, apostrophes and length', () => {
  assert.equal(slugify("Anime’s global audience — no longer niche"), 'animes-global-audience-no-longer-niche');
  assert.equal(slugify('Café Zürich'), 'cafe-zurich');
  assert.ok(slugify('word '.repeat(50)).length <= 90);
});

test('readingTime is derived from the body, never padded', () => {
  assert.equal(readingTime('word '.repeat(10)), '1 min');
  assert.equal(readingTime('word '.repeat(660)), '3 min');
  assert.equal(wordCount('## Heading\n\nTwo words.'), 3);
});

test('looksTitleCase: real Nuvellum headlines', () => {
  const titleCase = [
    'Pope Leo XIV Visits France, Meeting Migrants and Marginalised Communities',
    'EU Ministers Meet in Munich for Migration Talks as Germany Weighs Olympic Bids',
    "One Year On, AI Actress Tilly Norwood Does Not Have an Agent: 'We Don't Need It'",
    'Fuel Costs Create Recruitment Hurdles for Jersey Meal Delivery Service'
  ];
  const sentence = [
    'India and Pakistan trade accusations at UN General Assembly',
    'Iran says Strait of Hormuz could reopen within seven days if US accepts terms',
    'Police say Tasia Fortune was dead before her body was staged hanging from a tree',
    "Zelensky says Russia is widening attacks on Ukraine's data and internet infrastructure",
    'White House leaves CNN off Air Force One trip to Tennessee',
    'Diesel tops £2 at hundreds of Scottish forecourts',
    'OpenAI says agents acted improperly across dozens of institutions',
    'Renewed fighting in Tigray raises fears of wider conflict in Ethiopia'
  ];
  for (const t of titleCase) assert.ok(looksTitleCase(t), t);
  for (const t of sentence) assert.ok(!looksTitleCase(t), t);
});

const allPass = (list) => Object.fromEntries(list.map(c => [c, 'pass']));

test('parseVerification clears only an explicit, complete, passing verdict', () => {
  assert.equal(parseVerification({ verdict: 'cleared', checks: allPass(SENSITIVE_CRITERIA) }).verification, 'cleared');
  assert.equal(parseVerification('```json\n' + JSON.stringify({ verdict: 'cleared', checks: allPass(SENSITIVE_CRITERIA) }) + '\n```').verification, 'cleared');
});

test('parseVerification fails closed', () => {
  const partial = allPass(SENSITIVE_CRITERIA); delete partial.partisan_advocacy;
  const failing = { ...allPass(SENSITIVE_CRITERIA), inferred_motive_intent_guilt_or_causation: 'fail' };
  assert.equal(parseVerification({ verdict: 'cleared', checks: partial }).verification, 'uncertain');
  assert.equal(parseVerification({ verdict: 'cleared', checks: failing }).verification, 'failed');
  assert.equal(parseVerification({ verdict: 'failed', checks: allPass(SENSITIVE_CRITERIA) }).verification, 'failed');
  assert.equal(parseVerification({ verdict: 'maybe', checks: allPass(SENSITIVE_CRITERIA) }).verification, 'uncertain');
  assert.equal(parseVerification('').verification, 'uncertain');
  assert.equal(parseVerification('I think it is fine').verification, 'uncertain');
  assert.equal(parseVerification('{"verdict":"cleared"').verification, 'uncertain');
  assert.equal(parseVerification({ verdict: 'cleared', checks: { ...allPass(SENSITIVE_CRITERIA), partisan_advocacy: 'n/a' } }).verification, 'uncertain');
});

test('parseEditorialReview requires every criterion and a valid risk', () => {
  assert.deepEqual(parseEditorialReview({ verdict: 'passed', risk: 'low', checks: allPass(EDITORIAL_CRITERIA) }), { editorialReview: 'passed', risk: 'low', problems: [] });
  assert.equal(parseEditorialReview({ verdict: 'passed', risk: 'medium', checks: allPass(EDITORIAL_CRITERIA) }).editorialReview, 'uncertain');
  assert.equal(parseEditorialReview({ verdict: 'passed', risk: 'low', checks: { ...allPass(EDITORIAL_CRITERIA), single_story_not_clustered: 'fail' } }).editorialReview, 'failed');
  assert.equal(parseEditorialReview('timeout').editorialReview, 'uncertain');
});
