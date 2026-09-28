import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, articleMatchesCountry, countryBySlug, countrySearchTerms, countrySlug, resolveCountry, storiesForCountry } from '../src/lib/countries.js';

test('country atlas exposes real named countries and stable slugs', () => {
  assert.equal(COUNTRIES.length, 239);
  assert.equal(countrySlug('United States of America'), 'united-states-of-america');
  assert.equal(countryBySlug('switzerland')?.name, 'Switzerland');
  assert.equal(countryBySlug('vatican-city')?.pointOnly, true);
  assert.equal(countryBySlug('san-marino')?.pointOnly, true);
  assert.equal(countryBySlug('nauru')?.pointOnly, true);
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

test('country metadata resolves through World Explorer names, aliases and Natural Earth labels', () => {
  const owner = new Map();
  for (const c of COUNTRIES) for (const term of countrySearchTerms(c)) {
    assert.ok(!owner.has(term) || owner.get(term) === c.name, `"${term}" resolves to both ${owner.get(term)} and ${c.name}`);
    owner.set(term, c.name);
  }
  assert.equal(resolveCountry('UK')?.name, 'United Kingdom');
  assert.equal(resolveCountry('Turkey')?.name, 'Türkiye');
  assert.equal(resolveCountry('Dem. Rep. Congo')?.name, 'Democratic Republic of the Congo');
  assert.equal(resolveCountry('Côte d’Ivoire')?.name, "Côte d'Ivoire");
  for (const unknown of ['US', 'USA', 'Gaza', 'Bosnia', 'The Netherlands', 'Atlantis']) assert.equal(resolveCountry(unknown), null, unknown);
});

test('an explicit countries array is authoritative, including []', () => {
  const story = { section: 'World', title: 'Iran and Israel trade strikes as Pakistan urges calm' };
  assert.equal(articleMatchesCountry(story, 'Iran'), true, 'legacy stories keep headline inference');
  assert.equal(articleMatchesCountry({ ...story, countries: [] }, 'Iran'), false);
  assert.equal(articleMatchesCountry({ ...story, countries: ['UK'] }, 'United Kingdom'), true);
  assert.equal(articleMatchesCountry({ ...story, countries: ['UK'] }, 'Iran'), false);
});
