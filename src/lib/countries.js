import { WORLD_MAP_GROUPS } from './world-map-data.js';
import { interiorPoint, parseRings, viewToLonLat } from './atlas-geometry.js';
import { normalizeCountry } from './country-text.js';

export { normalizeCountry };

// Geography source for the World Explorer: Natural Earth 4.1.0 admin-0
// countries at 1:50m, redistributed as world-atlas@2.0.2 countries-50m.json
// (241 features). world-map-data.js is generated from it by
// scripts/tools/generate-world-map.mjs and also feeds the homepage World Desk,
// so it is read here but never rewritten for the explorer.
export const GEOGRAPHY_SOURCE = Object.freeze({
  dataset: 'Natural Earth admin-0 countries, 1:50m',
  version: '4.1.0',
  package: 'world-atlas@2.0.2 (countries-50m.json)',
  features: 241
});

// Natural Earth features deliberately left out of the explorer: the globe
// texture is clipped at 58°S, and these have no permanent population.
export const EXCLUDED_SOURCE_ENTITIES = Object.freeze([
  'Antarctica',
  'Fr. S. Antarctic Lands',
  'Heard I. and McDonald Is.'
]);

// Natural Earth abbreviates labels ("Dem. Rep. Congo"); the explorer, search and
// /country/<slug> routes use the full names.
const CANONICAL_NAMES = {
  'United States of America': 'United States',
  'S. Geo. and the Is.': 'South Georgia and the South Sandwich Islands',
  'Falkland Is.': 'Falkland Islands',
  'Dominican Rep.': 'Dominican Republic',
  'Faeroe Is.': 'Faroe Islands',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Macedonia': 'North Macedonia',
  'Åland': 'Åland Islands',
  'Turkey': 'Türkiye',
  'W. Sahara': 'Western Sahara',
  'N. Cyprus': 'Northern Cyprus',
  'eSwatini': 'Eswatini',
  'S. Sudan': 'South Sudan',
  'São Tomé and Principe': 'São Tomé and Príncipe',
  'Eq. Guinea': 'Equatorial Guinea',
  'Dem. Rep. Congo': 'Democratic Republic of the Congo',
  'Congo': 'Republic of the Congo',
  'Central African Rep.': 'Central African Republic',
  'Solomon Is.': 'Solomon Islands',
  'Fr. Polynesia': 'French Polynesia'
};

// Political status. Every drawable entity not listed here is a UN member state.
//   un-observer           UN General Assembly observer state
//   partially-recognized  state recognised by some UN members
//   de-facto              self-declared state without UN-member recognition
//   disputed-territory    area whose sovereignty is contested
//   dependency            territory, autonomous region, SAR or associated state
const DRAWABLE_STATUS = {
  'Greenland': { status: 'dependency', parent: 'Denmark' },
  'Faeroe Is.': { status: 'dependency', parent: 'Denmark' },
  'Puerto Rico': { status: 'dependency', parent: 'United States' },
  'Guam': { status: 'dependency', parent: 'United States' },
  'S. Geo. and the Is.': { status: 'dependency', parent: 'United Kingdom' },
  'Falkland Is.': { status: 'dependency', parent: 'United Kingdom' },
  'Isle of Man': { status: 'dependency', parent: 'United Kingdom' },
  'Åland': { status: 'dependency', parent: 'Finland' },
  'Hong Kong': { status: 'dependency', parent: 'China' },
  'Fr. Polynesia': { status: 'dependency', parent: 'France' },
  'New Caledonia': { status: 'dependency', parent: 'France' },
  'Palestine': { status: 'un-observer' },
  'Kosovo': { status: 'partially-recognized' },
  'Taiwan': { status: 'partially-recognized' },
  'W. Sahara': { status: 'disputed-territory' },
  'Siachen Glacier': { status: 'disputed-territory' },
  'N. Cyprus': { status: 'de-facto' },
  'Somaliland': { status: 'de-facto' }
};

// Entities with no drawable polygon at 1:50m (area below the generator's
// threshold) plus Tuvalu, which Natural Earth 4.1.0 omits at this scale. They
// are located at their capital or seat of government, and are selectable
// through invisible hit areas on the globe.
const POINT_ONLY_COUNTRIES = [
  { source:'Vatican', name:'Vatican City', lon:12.4534, lat:41.9029, region:'europe-central-asia', status:'un-observer' },
  { source:'Micronesia', name:'Federated States of Micronesia', lon:158.1590, lat:6.9170, region:'southeast-asia-oceania' },
  { source:'Marshall Is.', name:'Marshall Islands', lon:171.3803, lat:7.0897, region:'southeast-asia-oceania' },
  { source:'N. Mariana Is.', name:'Northern Mariana Islands', lon:145.7545, lat:15.2137, region:'southeast-asia-oceania', status:'dependency', parent:'United States' },
  { source:'U.S. Virgin Is.', name:'U.S. Virgin Islands', lon:-64.9307, lat:18.3419, region:'latin-america-caribbean', status:'dependency', parent:'United States' },
  { source:'American Samoa', name:'American Samoa', lon:-170.7020, lat:-14.2781, region:'southeast-asia-oceania', status:'dependency', parent:'United States' },
  { source:'Br. Indian Ocean Ter.', name:'British Indian Ocean Territory', lon:72.4110, lat:-7.3195, region:'south-asia', status:'dependency', parent:'United Kingdom' },
  { source:'Saint Helena', name:'Saint Helena, Ascension and Tristan da Cunha', lon:-5.7175, lat:-15.9244, region:'sub-saharan-africa', status:'dependency', parent:'United Kingdom' },
  { source:'Pitcairn Is.', name:'Pitcairn Islands', lon:-130.1015, lat:-25.0663, region:'southeast-asia-oceania', status:'dependency', parent:'United Kingdom' },
  { source:'Anguilla', name:'Anguilla', lon:-63.0578, lat:18.2170, region:'latin-america-caribbean', status:'dependency', parent:'United Kingdom' },
  { source:'Cayman Is.', name:'Cayman Islands', lon:-81.3857, lat:19.2869, region:'latin-america-caribbean', status:'dependency', parent:'United Kingdom' },
  { source:'Bermuda', name:'Bermuda', lon:-64.7818, lat:32.2949, region:'north-america', status:'dependency', parent:'United Kingdom' },
  { source:'British Virgin Is.', name:'British Virgin Islands', lon:-64.6185, lat:18.4207, region:'latin-america-caribbean', status:'dependency', parent:'United Kingdom' },
  { source:'Turks and Caicos Is.', name:'Turks and Caicos Islands', lon:-71.1419, lat:21.4612, region:'latin-america-caribbean', status:'dependency', parent:'United Kingdom' },
  { source:'Montserrat', name:'Montserrat', lon:-62.2106, lat:16.7925, region:'latin-america-caribbean', status:'dependency', parent:'United Kingdom' },
  { source:'Jersey', name:'Jersey', lon:-2.1049, lat:49.1858, region:'europe-central-asia', status:'dependency', parent:'United Kingdom' },
  { source:'Guernsey', name:'Guernsey', lon:-2.5367, lat:49.4557, region:'europe-central-asia', status:'dependency', parent:'United Kingdom' },
  { source:'Tonga', name:'Tonga', lon:-175.2018, lat:-21.1394, region:'southeast-asia-oceania' },
  { source:'Seychelles', name:'Seychelles', lon:55.4513, lat:-4.6191, region:'sub-saharan-africa' },
  { source:'San Marino', name:'San Marino', lon:12.4467, lat:43.9356, region:'europe-central-asia' },
  { source:'St. Vin. and Gren.', name:'Saint Vincent and the Grenadines', lon:-61.2248, lat:13.1587, region:'latin-america-caribbean' },
  { source:'St. Kitts and Nevis', name:'Saint Kitts and Nevis', lon:-62.7177, lat:17.3026, region:'latin-america-caribbean' },
  { source:'Niue', name:'Niue', lon:-169.9187, lat:-19.0595, region:'southeast-asia-oceania', status:'dependency', parent:'New Zealand' },
  { source:'Cook Is.', name:'Cook Islands', lon:-159.7777, lat:-21.2078, region:'southeast-asia-oceania', status:'dependency', parent:'New Zealand' },
  { source:'Aruba', name:'Aruba', lon:-70.0270, lat:12.5186, region:'latin-america-caribbean', status:'dependency', parent:'Netherlands' },
  { source:'Curaçao', name:'Curaçao', lon:-68.9335, lat:12.1091, region:'latin-america-caribbean', status:'dependency', parent:'Netherlands' },
  { source:'Nauru', name:'Nauru', lon:166.9209, lat:-0.5477, region:'southeast-asia-oceania' },
  { source:'Monaco', name:'Monaco', lon:7.4246, lat:43.7384, region:'europe-central-asia' },
  { source:'Malta', name:'Malta', lon:14.5146, lat:35.8989, region:'europe-central-asia' },
  { source:'Maldives', name:'Maldives', lon:73.5093, lat:4.1755, region:'south-asia' },
  { source:'Liechtenstein', name:'Liechtenstein', lon:9.5209, lat:47.1410, region:'europe-central-asia' },
  { source:'Kiribati', name:'Kiribati', lon:173.0176, lat:1.3291, region:'southeast-asia-oceania' },
  { source:'Grenada', name:'Grenada', lon:-61.7486, lat:12.0561, region:'latin-america-caribbean' },
  { source:'St. Pierre and Miquelon', name:'Saint Pierre and Miquelon', lon:-56.1773, lat:46.7811, region:'north-america', status:'dependency', parent:'France' },
  { source:'Wallis and Futuna Is.', name:'Wallis and Futuna', lon:-176.1745, lat:-13.2825, region:'southeast-asia-oceania', status:'dependency', parent:'France' },
  { source:'St-Martin', name:'Saint Martin', lon:-63.0822, lat:18.0671, region:'latin-america-caribbean', status:'dependency', parent:'France' },
  { source:'St-Barthélemy', name:'Saint Barthélemy', lon:-62.8508, lat:17.8962, region:'latin-america-caribbean', status:'dependency', parent:'France' },
  { source:'Macao', name:'Macau', lon:113.5439, lat:22.1987, region:'east-asia', status:'dependency', parent:'China' },
  { source:'Barbados', name:'Barbados', lon:-59.6167, lat:13.0969, region:'latin-america-caribbean' },
  { source:'Indian Ocean Ter.', name:'Australian Indian Ocean Territories', lon:105.6781, lat:-10.4217, region:'southeast-asia-oceania', status:'dependency', parent:'Australia' },
  { source:'Norfolk Island', name:'Norfolk Island', lon:167.9547, lat:-29.0564, region:'southeast-asia-oceania', status:'dependency', parent:'Australia' },
  { source:'Ashmore and Cartier Is.', name:'Ashmore and Cartier Islands', lon:122.9833, lat:-12.2417, region:'southeast-asia-oceania', status:'dependency', parent:'Australia' },
  { source:'Antigua and Barb.', name:'Antigua and Barbuda', lon:-61.8456, lat:17.1274, region:'latin-america-caribbean' },
  { source:'Sint Maarten', name:'Sint Maarten', lon:-63.0458, lat:18.0260, region:'latin-america-caribbean', status:'dependency', parent:'Netherlands' },
  { source:null, name:'Tuvalu', lon:179.1942, lat:-8.5211, region:'southeast-asia-oceania' }
];

// Alternative names used for article matching and for the explorer's search.
const SPECIAL_ALIASES = {
  'United States': ['united states of america','united states','u.s.','u.s','america','american'],
  'United Kingdom': ['united kingdom','uk','u.k.','britain','british','england','scotland','wales'],
  'South Korea': ['south korea','republic of korea','korea','korean'],
  'North Korea': ['north korea','democratic people\'s republic of korea','dprk'],
  'Russia': ['russia','russian federation','russian'],
  'Czechia': ['czechia','czech republic','czech'],
  'Türkiye': ['türkiye','turkiye','turkey','turkish'],
  'Côte d\'Ivoire': ['côte d’ivoire','cote d ivoire','ivory coast'],
  'Democratic Republic of the Congo': ['democratic republic of the congo','dr congo','drc','congo-kinshasa'],
  'Republic of the Congo': ['republic of the congo','congo-brazzaville'],
  'United Arab Emirates': ['united arab emirates','uae','emirati'],
  'Myanmar': ['myanmar','burma','burmese'],
  'Vatican City': ['vatican','vatican city','holy see'],
  'Federated States of Micronesia': ['micronesia','federated states of micronesia'],
  'Eswatini': ['eswatini','swaziland'],
  'North Macedonia': ['north macedonia'],
  'Cabo Verde': ['cabo verde','cape verde'],
  'Timor-Leste': ['timor-leste','east timor'],
  'Macau': ['macau','macao'],
  'Saint Helena, Ascension and Tristan da Cunha': ['saint helena','st helena'],
  'Australian Indian Ocean Territories': ['christmas island','cocos keeling islands','cocos islands'],
  'Falkland Islands': ['falkland islands','falklands','islas malvinas'],
  'Faroe Islands': ['faroe islands','faroes','faeroe islands']
};

function withAnchor(country) {
  if (country.pointOnly) return country;
  const point = interiorPoint(parseRings(country.d));
  const { lon, lat } = viewToLonLat(point.x, point.y);
  return { ...country, lon: Math.round(lon * 1e4) / 1e4, lat: Math.round(lat * 1e4) / 1e4 };
}

const DRAWABLE_COUNTRIES = Object.entries(WORLD_MAP_GROUPS).flatMap(([region, countries]) =>
  countries.map(country => ({
    name: CANONICAL_NAMES[country.name] || country.name,
    source: country.name,
    region,
    status: 'un-member',
    ...DRAWABLE_STATUS[country.name],
    d: country.d,
    pointOnly: false
  }))
);

export const COUNTRIES = Object.freeze([
  ...DRAWABLE_COUNTRIES,
  ...POINT_ONLY_COUNTRIES.map(country => ({ status: 'un-member', ...country, d: '', pointOnly: true }))
].map(withAnchor));

export function countrySlug(name) {
  return normalizeCountry(name).replace(/\s+/g, '-');
}

export function countryAliases(name) {
  const exact = SPECIAL_ALIASES[name] || [];
  return [...new Set([normalizeCountry(name), ...exact.map(normalizeCountry)].filter(Boolean))];
}

// Search accepts everything article matching does, plus Natural Earth's own
// label ("Dem. Rep. Congo", "Turkey") so older links and habits still resolve.
export function countrySearchTerms(country) {
  return [...new Set([...countryAliases(country.name), normalizeCountry(country.source)].filter(Boolean))];
}

function containsAlias(text, alias) {
  if (!alias) return false;
  const escaped = alias.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i').test(text);
}

export function articleMatchesCountry(article, countryName) {
  const aliases = countryAliases(countryName);
  const explicit = Array.isArray(article?.countries) ? article.countries.map(normalizeCountry) : [];
  if (explicit.length) return explicit.some(value => aliases.includes(value));

  if (normalizeCountry(article?.section) !== 'world') return false;
  const haystack = normalizeCountry([
    article?.title,
    article?.dek,
    ...(Array.isArray(article?.tags) ? article.tags : [])
  ].filter(Boolean).join(' '));
  return aliases.some(alias => containsAlias(haystack, alias));
}

export function storiesForCountry(articles, countryName) {
  return (articles || []).filter(article => articleMatchesCountry(article, countryName));
}

export function countryBySlug(slug) {
  const needle = String(slug || '');
  return COUNTRIES.find(country => countrySlug(country.name) === needle) || null;
}
