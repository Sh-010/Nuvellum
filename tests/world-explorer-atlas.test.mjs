import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, EXCLUDED_SOURCE_ENTITIES, GEOGRAPHY_SOURCE, countryBySlug, countrySearchTerms, countrySlug, normalizeCountry } from '../src/lib/countries.js';
import { REGIONS } from '../src/lib/geography.js';
import { SMALL_TARGET_PIXELS, lonLatToUv, parseRings, rasterizeIdMap, uvToPixel, uvToSphere } from '../src/lib/atlas-geometry.js';

// Same ids the World Explorer page assigns (index + 1).
const entities = COUNTRIES.map((country, index) => ({ ...country, id: index + 1, rings: parseRings(country.d) }));
const { ids, counts } = rasterizeIdMap(entities);

const UN_MEMBERS = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia',
  'Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Republic of the Congo','Costa Rica',
  'Côte d\'Ivoire','Croatia','Cuba','Cyprus','Czechia','Democratic Republic of the Congo','North Korea','Denmark','Djibouti','Dominica',
  'Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji',
  'Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala',
  'Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran',
  'Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati',
  'Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania',
  'Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius',
  'Mexico','Federated States of Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia',
  'Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Macedonia','Norway','Oman',
  'Pakistan','Palau','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar',
  'South Korea','Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','São Tomé and Príncipe',
  'Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia',
  'South Africa','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Tajikistan',
  'Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Türkiye','Turkmenistan','Tuvalu','Uganda',
  'Ukraine','United Arab Emirates','United Kingdom','Tanzania','United States','Uruguay','Uzbekistan','Vanuatu','Venezuela','Vietnam',
  'Yemen','Zambia','Zimbabwe'
];

test('every entity has a unique canonical name and slug, a valid region and status', () => {
  const regionSlugs = new Set(REGIONS.map(region => region.slug));
  const names = new Set(COUNTRIES.map(country => country.name));
  const statuses = new Set(['un-member', 'un-observer', 'partially-recognized', 'de-facto', 'disputed-territory', 'dependency']);
  assert.equal(names.size, COUNTRIES.length, 'duplicate names');
  assert.equal(new Set(COUNTRIES.map(country => normalizeCountry(country.name))).size, COUNTRIES.length, 'names collide after normalisation');
  assert.equal(new Set(COUNTRIES.map(country => countrySlug(country.name))).size, COUNTRIES.length, 'duplicate slugs');
  for (const country of COUNTRIES) {
    assert.ok(regionSlugs.has(country.region), `${country.name}: region ${country.region}`);
    assert.ok(statuses.has(country.status), `${country.name}: status ${country.status}`);
    assert.doesNotMatch(country.name, /(^|\s)[A-Za-z]+\.(\s|$)/, `${country.name}: abbreviated name`);
    if (country.status === 'dependency') assert.ok(names.has(country.parent), `${country.name}: parent ${country.parent}`);
  }
});

test('the atlas covers all 193 UN member states and both observer states', () => {
  assert.equal(UN_MEMBERS.length, 193);
  const byName = new Map(COUNTRIES.map(country => [country.name, country]));
  for (const name of UN_MEMBERS) assert.equal(byName.get(name)?.status, 'un-member', `${name} missing or misclassified`);
  assert.equal(COUNTRIES.filter(country => country.status === 'un-member').length, 193);
  assert.deepEqual(COUNTRIES.filter(country => country.status === 'un-observer').map(country => country.name).sort(), ['Palestine', 'Vatican City']);
});

test('every Natural Earth feature is drawn, point-only or deliberately excluded', () => {
  const sources = COUNTRIES.map(country => country.source).filter(Boolean);
  assert.equal(new Set(sources).size, sources.length, 'a Natural Earth feature is used twice');
  assert.equal(sources.length + EXCLUDED_SOURCE_ENTITIES.length, GEOGRAPHY_SOURCE.features);
  assert.deepEqual(COUNTRIES.filter(country => !country.source).map(country => country.name), ['Tuvalu']);
});

test('every entity has finite coordinates and either a polygon or an intentional point', () => {
  for (const country of entities) {
    assert.ok(Number.isFinite(country.lon) && Math.abs(country.lon) <= 180, `${country.name}: lon`);
    assert.ok(Number.isFinite(country.lat) && country.lat <= 84 && country.lat >= -58, `${country.name}: lat`);
    if (country.pointOnly) assert.equal(country.rings.length, 0, `${country.name}: point-only entity has a shape`);
    else assert.ok(country.rings.length > 0, `${country.name}: drawable entity has no polygon`);
  }
});

test('every entity owns hit-map pixels and its anchor resolves to itself', () => {
  for (const country of entities) {
    assert.ok(counts[country.id] >= 1, `${country.name}: no hit-map pixel`);
    const { u, v } = lonLatToUv(country.lon, country.lat);
    const anchor = uvToPixel(u, v);
    if (!country.pointOnly) {
      assert.equal(ids[anchor.index], country.id, `${country.name}: anchor pixel belongs to ${entities[ids[anchor.index] - 1]?.name || 'the sea'}`);
      continue;
    }
    // Point-only entities are stamped at (or, when two share a texel, next to) their anchor.
    let owned = false;
    for (let dy = -4; dy <= 4 && !owned; dy++) {
      for (let dx = -4; dx <= 4; dx++) if (ids[(anchor.y + dy) * 2048 + anchor.x + dx] === country.id) { owned = true; break; }
    }
    assert.ok(owned, `${country.name}: no owned pixel near its anchor`);
    assert.ok(counts[country.id] < SMALL_TARGET_PIXELS, `${country.name}: point-only entity must get an invisible hit area`);
  }
});

test('hit-map pixels lie inside the polygon they are attributed to', () => {
  // The scanline fill must agree with an independent even-odd point-in-polygon
  // test at every sampled pixel centre, for every drawable entity. (Pixels later
  // stamped for sub-pixel islands and anchors are covered by the test above.)
  const plain = rasterizeIdMap(entities, 2048, 1024, { stamp: false }).ids;
  const scale = 2048 / 1000, offsetY = 6 / 180 * 1024;
  const inside = (rings, x, y) => {
    let hit = false;
    for (const ring of rings) {
      for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
        const yi = ring[i + 1], yj = ring[j + 1];
        if ((yi > y) !== (yj > y) && x < (ring[j] - ring[i]) * (y - yi) / (yj - yi) + ring[i]) hit = !hit;
      }
    }
    return hit;
  };
  const checked = new Uint32Array(entities.length + 1);
  const outside = new Uint32Array(entities.length + 1);
  for (let index = 0; index < plain.length; index += 3) {
    const id = plain[index];
    if (!id || entities[id - 1].pointOnly) continue;
    const x = ((index % 2048) + 0.5) / scale, y = (Math.floor(index / 2048) + 0.5 - offsetY) / scale;
    checked[id]++;
    if (!inside(entities[id - 1].rings, x, y)) outside[id]++;
  }
  for (const country of entities) {
    if (country.pointOnly) continue;
    assert.equal(outside[country.id], 0, `${country.name}: ${outside[country.id]}/${checked[country.id]} pixels outside its polygon`);
  }
});

test('every entity has a route, is searchable by name and resolves back to itself', () => {
  for (const country of COUNTRIES) {
    assert.equal(countryBySlug(countrySlug(country.name)), country);
    assert.ok(countrySearchTerms(country).includes(normalizeCountry(country.name)));
  }
  assert.equal(countryBySlug('democratic-republic-of-the-congo')?.source, 'Dem. Rep. Congo');
  assert.ok(countrySearchTerms(countryBySlug('turkiye')).includes('turkey'));
});

test('globe uv mapping matches Three.js SphereGeometry and the Locate orientation', () => {
  // lon 0 faces +x, lon 90°E faces -z, north pole is +y.
  const check = (lon, lat, expected) => {
    const { u, v } = lonLatToUv(lon, lat);
    const p = uvToSphere(u, v);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(p[axis] - expected[axis]) < 1e-9, `${lon},${lat} ${axis}`);
  };
  check(0, 0, { x: 1, y: 0, z: 0 });
  check(90, 0, { x: 0, y: 0, z: -1 });
  check(-90, 0, { x: 0, y: 0, z: 1 });
  check(0, 90, { x: 0, y: 1, z: 0 });
});

test('point-only coordinates are the stated capitals and fixed known errors stay fixed', () => {
  const at = name => COUNTRIES.find(country => country.name === name);
  assert.ok(at('Kiribati').lon > 170, 'Kiribati must be in the central Pacific, not the Gulf of Guinea');
  assert.ok(Math.abs(at('Saint Helena, Ascension and Tristan da Cunha').lon + 5.72) < 0.1);
  assert.ok(at('Tuvalu').pointOnly && at('Tuvalu').lon > 179);
});
