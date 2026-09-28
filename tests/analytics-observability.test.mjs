import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSnippet, injectAnalytics, validGa4Id } from '../scripts/lib/analytics.mjs';
import { imageMode, sourceHost, summarizeArticles } from '../scripts/lib/observability.mjs';

test('GA4 measurement IDs are validated before injection', () => {
  assert.equal(validGa4Id('G-ABC123XYZ'), 'G-ABC123XYZ');
  assert.equal(validGa4Id('bad-id'), '');
  assert.equal(analyticsSnippet('bad-id'), '');
});

test('analytics injection is idempotent and avoids query strings in explicit page fields', () => {
  const html = '<html><head><title>x</title></head><body></body></html>';
  const once = injectAnalytics(html, 'G-ABC123XYZ');
  const twice = injectAnalytics(once, 'G-ABC123XYZ');
  assert.match(once, /id="nuvellum-analytics"/);
  assert.match(once, /location\.origin \+ location\.pathname/);
  assert.equal(once, twice);
});

test('image modes distinguish real photos, AI art and intentional text-led stories', () => {
  assert.equal(imageMode({}), 'text-led');
  assert.equal(imageMode({ image:'/uploads/house/gaming.svg' }), 'text-led');
  assert.equal(imageMode({ image:'/uploads/articles/a.webp', imageKind:'photo' }), 'photo');
  assert.equal(imageMode({ image:'/generated/ai/a.svg' }), 'ai-illustration');
});

test('newsroom summary counts windows, sections, source hosts and visual modes', () => {
  const now = Date.parse('2026-09-28T20:00:00Z');
  const entries = [
    { slug:'a', data:{ status:'published', origin:'automation', publishedAt:'2026-09-28T19:00:00Z', section:'World', risk:'low', image:'/uploads/articles/a.webp', imageKind:'photo', sourceUrls:['https://www.reuters.com/a'] } },
    { slug:'b', data:{ status:'published', origin:'automation', publishedAt:'2026-09-24T19:00:00Z', section:'Gaming', risk:'sensitive', sourceUrls:['https://www.polygon.com/b'] } },
    { slug:'c', data:{ status:'published', origin:'human', date:'2026-09-01', section:'Opinion' } }
  ];
  const s = summarizeArticles(entries, now);
  assert.equal(s.publishedTotal, 3);
  assert.equal(s.automatedTotal, 2);
  assert.equal(s.published24h, 1);
  assert.equal(s.published7d, 2);
  assert.equal(s.sections.World, 1);
  assert.equal(s.sections.Gaming, 1);
  assert.equal(s.imageModes.photo, 1);
  assert.equal(s.imageModes['text-led'], 1);
  assert.equal(s.sourceHosts['reuters.com'], 1);
  assert.equal(sourceHost('https://www.polygon.com/a?x=1'), 'polygon.com');
});
