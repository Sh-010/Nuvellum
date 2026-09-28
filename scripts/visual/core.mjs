// Nuvellum Visual Engine v1: deterministic policy, brief construction and candidate QA.
// No network calls live here so the rules are testable in CI.

const PLACEHOLDER_RE = /^\/images\/(world|business|technology|sports|culture|film|anime|gaming)\.svg$/i;
const AUTOMATION_SVG_RE = /^\/generated\/ai\/.+\.svg$/i;

export const ALLOWED_LICENSES = Object.freeze([
  'public domain',
  'cc0',
  'cc by 4.0',
  'cc by 3.0',
  'cc by 2.0',
  'cc by-sa 4.0',
  'cc by-sa 3.0',
  'cc by-sa 2.0'
]);

export function normalizeLicense(value) {
  return String(value || '')
    .replace(/creative commons/ig, 'cc')
    .replace(/attribution-sharealike/ig, 'by-sa')
    .replace(/attribution/ig, 'by')
    .replace(/zero/ig, '0')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function licenseAllowed(value) {
  const n = normalizeLicense(value);
  return ALLOWED_LICENSES.some(allowed => n === allowed || n.startsWith(allowed + ' '));
}

export function hasRealVisual(article) {
  const image = String(article?.image || '');
  return Boolean(image && !PLACEHOLDER_RE.test(image) && !AUTOMATION_SVG_RE.test(image));
}

const ABSTRACT_RE = /\b(infrastructure|sovereignty|power|capital|economy|markets?|supply chains?|artificial intelligence|ai|internet|digital|culture|media|information|policy|strategy|geopolitics?)\b/i;
const MAP_RE = /\b(border|territor|route|corridor|strait|frontline|invasion|conflict|war|trade route|shipping|migration|earthquake|storm|flood|wildfire|volcano)\b/i;

export function chooseVisualMode(article) {
  if (hasRealVisual(article)) return 'existing';

  const section = String(article?.section || '').toLowerCase();
  const type = String(article?.type || '').toLowerCase();
  const text = [article?.title, article?.dek, ...(article?.tags || [])].filter(Boolean).join(' ');
  const countries = Array.isArray(article?.countries) ? article.countries : [];
  const geoMaterial = countries.length > 0 || (Array.isArray(article?.regions) && article.regions.length > 0);

  // Maps are useful only when geography is materially part of the story. They still require
  // editorial review before publication, especially for borders/disputed territories.
  if (geoMaterial && MAP_RE.test(text)) return 'map-review';

  if (['opinion','essay','ideas','analysis'].includes(type)) return 'illustration';
  if (ABSTRACT_RE.test(text) && ['technology','business','science','world'].includes(section)) return 'illustration';

  if (['film & tv','anime','gaming','culture','sports'].includes(section)) return 'photo';
  if (type === 'news') return 'photo';

  return 'photo-or-illustration';
}

function compact(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function buildVisualBrief(article) {
  const countries = Array.isArray(article?.countries) ? article.countries : [];
  const tags = Array.isArray(article?.tags) ? article.tags : [];
  const mode = chooseVisualMode(article);
  const named = [...countries, ...tags].filter(Boolean).slice(0, 8);

  const photoQuery = [
    compact(article?.title, 110),
    countries.slice(0, 2).join(' '),
    tags.slice(0, 3).join(' ')
  ].filter(Boolean).join(' ').trim();

  return {
    slug: article?.slug || '',
    mode,
    title: compact(article?.title, 180),
    dek: compact(article?.dek, 260),
    section: article?.section || '',
    type: article?.type || '',
    risk: article?.risk || 'low',
    countries,
    regions: Array.isArray(article?.regions) ? article.regions : [],
    entities: named,
    photoQuery,
    artDirection: mode === 'illustration'
      ? 'Nuvellum editorial illustration: restrained old-money newspaper palette, dark wine/ivory/black, no embedded headline text, no logos, no photorealistic fabrication presented as documentary evidence.'
      : mode === 'map-review'
        ? 'Geographic context graphic only. Use verified country/region metadata; disputed boundaries require explicit editorial review. No decorative political claims.'
        : 'Prefer a documentary/editorial image directly relevant to the named subject, place or event. Avoid generic stock imagery and misleading file photos.'
  };
}

function hostname(value) {
  try { return new URL(String(value)).hostname.toLowerCase(); } catch { return ''; }
}

export function visualCandidateProblems(candidate) {
  const p = [];
  if (!candidate || typeof candidate !== 'object') return ['candidate is missing'];
  if (!/^https:\/\//i.test(String(candidate.url || ''))) p.push('image URL must be https');
  if (!/^https:\/\//i.test(String(candidate.sourcePage || ''))) p.push('source page URL must be https');
  if (!licenseAllowed(candidate.license)) p.push(`license is not on the allowlist: ${candidate.license || 'missing'}`);
  if (!String(candidate.credit || '').trim()) p.push('credit is missing');
  if (!String(candidate.title || '').trim()) p.push('file title is missing');

  const width = Number(candidate.width || 0), height = Number(candidate.height || 0);
  if (width < 1200) p.push(`image width ${width || 'missing'} is below 1200px`);
  if (height < 600) p.push(`image height ${height || 'missing'} is below 600px`);
  if (width && height) {
    const ratio = width / height;
    if (ratio < 1.1 || ratio > 2.6) p.push(`aspect ratio ${ratio.toFixed(2)} is unsuitable for lead-story use`);
  }

  const host = hostname(candidate.url);
  if (candidate.provider === 'wikimedia' && host !== 'upload.wikimedia.org') p.push('Wikimedia candidate must use upload.wikimedia.org');
  if (/\.svg(?:\?|$)/i.test(String(candidate.url || ''))) p.push('remote SVG files are not accepted as documentary images');

  return p;
}

export function candidateUsable(candidate) {
  return visualCandidateProblems(candidate).length === 0;
}
