import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, articleMatchesCountry, countryBySlug, countrySlug, storiesForCountry } from '../src/lib/countries.js';

test('country atlas exposes real named countries and stable slugs', () => {
  assert.ok(COUNTRIES.length >= 180);
  assert.equal(countrySlug('United States of America'), 'united-states-of-america');
  assert.equal(countryBySlug('switzerland')?.name, 'Switzerland');
});

test('World stories can be matched conservatively to countries', () => {
  assert.equal(articleMatchesCountry({ section:'World', title:'Swiss voters debate neutrality', dek:'Voters in Switzerland head to the polls.' }, 'Switzerland'), true);
  assert.equal(articleMatchesCountry({ section:'World', title:'Floods strike Nepal and India', dek:'' }, 'Nepal'), true);
  assert.equal(articleMatchesCountry({ section:'World', title:'Floods strike Nepal and India', dek:'' }, 'India'), true);
});

test('non-World titles do not create inferred country coverage', () => {
  assert.equal(articleMatchesCountry({ section:'Film & TV', title:'A film called Australia' }, 'Australia'), false);
});

test('explicit countries remain authoritative', () => {
  const article = { section:'World', title:'A story about Europe', countries:['France'] };
  assert.equal(articleMatchesCountry(article, 'France'), true);
  assert.equal(articleMatchesCountry(article, 'Germany'), false);
});

test('storiesForCountry returns only matching stories', () => {
  const items = [
    { section:'World', title:'France changes policy' },
    { section:'World', title:'Japan changes policy' },
    { section:'Culture', title:'France on screen' }
  ];
  assert.deepEqual(storiesForCountry(items, 'France'), [items[0]]);
});
