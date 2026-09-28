import { licenseAllowed, visualCandidateProblems, rankVisualCandidates } from './core.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function pick(meta, key) {
  const v = meta?.[key]?.value;
  return v == null ? '' : stripHtml(v);
}

export function normalizeCommonsPage(page) {
  const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  if (!info) return null;
  const meta = info.extmetadata || {};
  const license = pick(meta, 'LicenseShortName') || pick(meta, 'UsageTerms');
  const credit = pick(meta, 'Artist') || pick(meta, 'Credit') || 'Unknown creator';
  const sourcePage = page.canonicalurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/ /g, '_'))}`;

  const categoryText = (page?.categories || []).map(c => String(c?.title || '')).join(' ').toLowerCase();
  const badges = [];
  if (/featured picture/.test(categoryText)) badges.push('featured');
  if (/quality image/.test(categoryText)) badges.push('quality');
  if (/valued image/.test(categoryText)) badges.push('valued');

  return {
    provider: 'wikimedia',
    title: String(page.title || '').replace(/^File:/, ''),
    description: pick(meta, 'ImageDescription'),
    badges,
    credit,
    license,
    licenseUrl: pick(meta, 'LicenseUrl'),
    sourcePage,
    url: info.thumburl || info.url || '',
    originalUrl: info.url || '',
    width: Number(info.thumbwidth || info.width || 0),
    height: Number(info.thumbheight || info.height || 0),
    mime: info.mime || ''
  };
}

export async function searchWikimedia(query, { limit = 12, width = 1600, brief = null, fetchImpl = fetch } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: q,
    gsrlimit: String(Math.max(1, Math.min(30, limit))),
    prop: 'imageinfo|info|categories',
    inprop: 'url',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(width),
    cllimit: 'max'
  });

  const res = await fetchImpl(`${API}?${params}`, { headers: { 'user-agent': 'Nuvellum-Visual-Engine/1.0' } });
  if (!res.ok) throw new Error(`Wikimedia API returned ${res.status}`);
  const data = await res.json();

  const pages = Object.values(data?.query?.pages || {});
  const candidates = pages
    .map(normalizeCommonsPage)
    .filter(Boolean)
    .filter(candidate => licenseAllowed(candidate.license))
    .map(candidate => ({ ...candidate, problems: visualCandidateProblems(candidate) }));

  return rankVisualCandidates(
    candidates.filter(candidate => candidate.problems.length === 0),
    brief || { mode: 'photo', title: q, entities: [] }
  );
}
