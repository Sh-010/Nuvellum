import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, regionBySlug, regionsForArticle, storiesByRegion } from '../src/lib/geography.js';

test('World Desk taxonomy is stable and unique', () => {
  assert.equal(REGIONS.length, 8);
  assert.equal(new Set(REGIONS.map(r => r.slug)).size, REGIONS.length);
  assert.equal(regionBySlug('east-asia')?.label, 'East Asia');
});

test('explicit region metadata wins over keyword inference', () => {
  const article = { title: 'Japan and France discuss technology', regions: ['north-america'] };
  assert.deepEqual(regionsForArticle(article), ['north-america']);
});

test('explicit country metadata can span multiple desks', () => {
  const article = { title: 'Australia hold off late South Africa comeback', countries: ['Australia','South Africa'] };
  assert.deepEqual(regionsForArticle(article).sort(), ['southeast-asia-oceania','sub-saharan-africa'].sort());
});

test('existing World stories can be classified conservatively without new frontmatter', () => {
  assert.deepEqual(regionsForArticle({ section: 'World', title: 'Swiss voters set to reject tighter neutrality rules', tags: [] }), ['europe-central-asia']);
  assert.deepEqual(regionsForArticle({ section: 'World', title: 'Ten climbers missing after avalanche hits Himalayan base camp', dek: 'The expedition was near Nepal.', tags: [] }), ['south-asia']);
  assert.deepEqual(regionsForArticle({ section: 'World', title: 'Japan unveils a new economic package', tags: [] }), ['east-asia']);
});

test('non-World headlines do not create false geographic desks from titles alone', () => {
  assert.deepEqual(regionsForArticle({ section: 'Film & TV', title: "Hayley Kiyoko wants to make a lesbian 'Pirates of the Caribbean'", tags: [] }), []);
});

test('storiesByRegion keeps unclassified stories out of geographic desks', () => {
  const map = storiesByRegion([
    { section: 'World', title: 'Japan changes policy' },
    { title: 'An abstract technology story', tags: ['AI'] }
  ]);
  assert.equal(map.get('east-asia').length, 1);
  assert.equal([...map.values()].flat().length, 1);
});
