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
  'Myanmar': ['myanmar','burma','burmese']
};

export const COUNTRIES = Object.freeze(
  Object.entries(WORLD_MAP_GROUPS).flatMap(([region, countries]) =>
    countries.map(country => ({ ...country, region }))
  )
);

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
