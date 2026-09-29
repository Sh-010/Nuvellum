import test from 'node:test';
import assert from 'node:assert/strict';
import { adsTxt } from '../scripts/write-ads-txt.mjs';
import { mediaKitFacts } from '../scripts/media-kit.mjs';

test('ads.txt is written only for a real AdSense publisher ID', () => {
  assert.equal(adsTxt('pub-1234567890123456'), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  for (const bad of ['', undefined, 'pub-123', 'ca-pub-1234567890123456', 'pub-1234567890123456\nevil.com, x, DIRECT', 'google.com, pub-1234567890123456']) assert.equal(adsTxt(bad), '', String(bad));
});

test('media-kit facts come only from published stories and never estimate an audience', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const e = (status, section, type, date, words, image = '') => ({ data: { status, section, type, date, image }, body: 'w '.repeat(words) });
  const f = mediaKitFacts([e('published', 'World', 'News', '2026-09-29', 300, '/uploads/articles/a.jpg'), e('published', 'World', 'Analysis', '2026-08-01', 500), e('draft', 'Opinion', 'Essay', '2026-09-29', 95)], now);
  assert.equal(f.publishedStories, 2);
  assert.equal(f.publishedLast7Days, 1);
  assert.deepEqual(f.sections, { World: 2 });
  assert.deepEqual(f.visuals, { 'licensed photo': 1, 'text-led': 1 });
  assert.match(f.audience, /not yet measured/);
  assert.ok(!Object.keys(f).some((k) => /views|users|reach|impressions|subscribers/i.test(k)), 'no audience figures in the facts');
});
