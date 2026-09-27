import { WORLD_MAP_GROUPS } from './world-map-data.js';

const SPECIAL_ALIASES = {
  'United States of America': ['united states of america','united states','u.s.','u.s','us','america','american'],
  'United Kingdom': ['united kingdom','uk','u.k.','britain','british','england','scotland','wales'],
  'South Korea': ['south korea','republic of korea','korea','korean'],
  'North Korea': ['north korea','democratic people\'s republic of korea','dprk'],
  'Russia': ['russia','russian federation','russian'],
  'Czechia': ['czechia','czech republic','czech'],
  'Türkiye': ['türkiye','turkiye','turkey','turkish'],
  'Ivory Coast': ['ivory coast','côte d’ivoire','cote d ivoire'],
  'Democratic Republic of the Congo': ['democratic republic of the congo','dr congo','drc'],
  'Republic of the Congo': ['republic of the congo','congo-brazzaville'],
  'United Arab Emirates': ['united arab emirates','uae','emirati'],
  'Myanmar': ['myanmar','burma','burmese'],
  'Vatican City': ['vatican','vatican city','holy see'],
  'Federated States of Micronesia': ['micronesia','federated states of micronesia'],
  'Marshall Islands': ['marshall islands','marshall is'],
  'Northern Mariana Islands': ['northern mariana islands','n mariana is'],
  'U.S. Virgin Islands': ['u.s. virgin islands','us virgin islands','u s virgin is'],
  'British Indian Ocean Territory': ['british indian ocean territory','br indian ocean ter'],
  'Pitcairn Islands': ['pitcairn islands','pitcairn is'],
  'Cayman Islands': ['cayman islands','cayman is'],
  'British Virgin Islands': ['british virgin islands','british virgin is'],
  'Turks and Caicos Islands': ['turks and caicos islands','turks and caicos is'],
  'Saint Vincent and the Grenadines': ['saint vincent and the grenadines','st vin and gren'],
  'Saint Kitts and Nevis': ['saint kitts and nevis','st kitts and nevis'],
  'Cook Islands': ['cook islands','cook is'],
  'Saint Pierre and Miquelon': ['saint pierre and miquelon','st pierre and miquelon'],
  'Wallis and Futuna': ['wallis and futuna','wallis and futuna is'],
  'Saint Martin': ['saint martin','st martin'],
  'Saint Barthélemy': ['saint barthelemy','st barthelemy'],
  'Macau': ['macau','macao'],
  'Norfolk Island': ['norfolk island'],
  'Ashmore and Cartier Islands': ['ashmore and cartier islands','ashmore and cartier is'],
  'Antigua and Barbuda': ['antigua and barbuda','antigua and barb']
};

// Natural Earth 1:50m contains several sovereign microstates and island
// territories whose drawable polygon area is below the threshold used by the
// homepage map generator. Keep them as explicit point entities so the World
// Explorer can still locate, hover and click them. Antarctica and uninhabited
// Antarctic possessions remain intentionally outside the explorer viewport.
const POINT_ONLY_COUNTRIES = Object.freeze([
  { name:'Vatican City', lon:12.4345, lat:41.9017, region:'europe-central-asia' },
  { name:'Federated States of Micronesia', lon:150.5283, lat:7.4359, region:'southeast-asia-oceania' },
  { name:'Marshall Islands', lon:169.3007, lat:8.4845, region:'southeast-asia-oceania' },
  { name:'Northern Mariana Islands', lon:145.4937, lat:16.4588, region:'southeast-asia-oceania' },
  { name:'U.S. Virgin Islands', lon:-64.8006, lat:18.0429, region:'latin-america-caribbean' },
  { name:'American Samoa', lon:-170.6939, lat:-14.3084, region:'southeast-asia-oceania' },
  { name:'British Indian Ocean Territory', lon:72.4237, lat:-7.3279, region:'south-asia' },
  { name:'Saint Helena', lon:-10.0387, lat:-11.9431, region:'sub-saharan-africa' },
  { name:'Pitcairn Islands', lon:-128.3197, lat:-24.3677, region:'southeast-asia-oceania' },
  { name:'Anguilla', lon:-63.0708, lat:18.2209, region:'latin-america-caribbean' },
  { name:'Cayman Islands', lon:-80.5814, lat:19.5185, region:'latin-america-caribbean' },
  { name:'Bermuda', lon:-64.7664, lat:32.3233, region:'north-america' },
  { name:'British Virgin Islands', lon:-64.4838, lat:18.5759, region:'latin-america-caribbean' },
  { name:'Turks and Caicos Islands', lon:-71.9881, lat:21.8517, region:'latin-america-caribbean' },
  { name:'Montserrat', lon:-62.1870, lat:16.7461, region:'latin-america-caribbean' },
  { name:'Jersey', lon:-2.1240, lat:49.2181, region:'europe-central-asia' },
  { name:'Guernsey', lon:-2.5794, lat:49.4672, region:'europe-central-asia' },
  { name:'Tonga', lon:-174.6431, lat:-20.0085, region:'southeast-asia-oceania' },
  { name:'Seychelles', lon:55.4640, lat:-4.6718, region:'sub-saharan-africa' },
  { name:'San Marino', lon:12.4561, lat:43.9415, region:'europe-central-asia' },
  { name:'Saint Vincent and the Grenadines', lon:-61.2384, lat:13.0267, region:'latin-america-caribbean' },
  { name:'Saint Kitts and Nevis', lon:-62.6856, lat:17.2513, region:'latin-america-caribbean' },
  { name:'Niue', lon:-169.8713, lat:-19.0511, region:'southeast-asia-oceania' },
  { name:'Cook Islands', lon:-159.7894, lat:-21.2177, region:'southeast-asia-oceania' },
  { name:'Aruba', lon:-69.9811, lat:12.5189, region:'latin-america-caribbean' },
  { name:'Curaçao', lon:-68.9551, lat:12.2125, region:'latin-america-caribbean' },
  { name:'Nauru', lon:166.9319, lat:-0.5202, region:'southeast-asia-oceania' },
  { name:'Monaco', lon:7.4089, lat:43.7514, region:'europe-central-asia' },
  { name:'Malta', lon:14.3731, lat:35.9481, region:'europe-central-asia' },
  { name:'Maldives', lon:73.4551, lat:3.7382, region:'south-asia' },
  { name:'Liechtenstein', lon:9.5455, lat:47.1635, region:'europe-central-asia' },
  { name:'Kiribati', lon:0.1188, lat:-3.7665, region:'southeast-asia-oceania' },
  { name:'Grenada', lon:-61.6938, lat:12.1231, region:'latin-america-caribbean' },
  { name:'Saint Pierre and Miquelon', lon:-56.2614, lat:46.9257, region:'north-america' },
  { name:'Wallis and Futuna', lon:-177.1596, lat:-13.7737, region:'southeast-asia-oceania' },
  { name:'Saint Martin', lon:-63.0672, lat:18.0924, region:'latin-america-caribbean' },
  { name:'Saint Barthélemy', lon:-62.8386, lat:17.8988, region:'latin-america-caribbean' },
  { name:'Macau', lon:113.5127, lat:22.2206, region:'east-asia' },
  { name:'Barbados', lon:-59.5374, lat:13.1899, region:'latin-america-caribbean' },
  { name:'Indian Ocean Territory', lon:101.2744, lat:-11.3155, region:'southeast-asia-oceania' },
  { name:'Norfolk Island', lon:167.9489, lat:-29.0549, region:'southeast-asia-oceania' },
  { name:'Ashmore and Cartier Islands', lon:123.5838, lat:-12.4300, region:'southeast-asia-oceania' },
  { name:'Antigua and Barbuda', lon:-61.7856, lat:17.3563, region:'latin-america-caribbean' },
  { name:'Sint Maarten', lon:-63.0672, lat:18.0438, region:'latin-america-caribbean' }
].map(country => ({ ...country, d:'', pointOnly:true })));

const DRAWABLE_COUNTRIES = Object.entries(WORLD_MAP_GROUPS).flatMap(([region, countries]) =>
  countries.map(country => ({ ...country, region, pointOnly:false }))
);

export const COUNTRIES = Object.freeze([...DRAWABLE_COUNTRIES, ...POINT_ONLY_COUNTRIES]);

export function normalizeCountry(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function countrySlug(name) {
  return normalizeCountry(name).replace(/\s+/g, '-');
}

export function countryAliases(name) {
  const exact = SPECIAL_ALIASES[name] || [];
  return [...new Set([normalizeCountry(name), ...exact.map(normalizeCountry)].filter(Boolean))];
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
