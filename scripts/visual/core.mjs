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


// Editorial art-direction scoring. This is deliberately independent from legal/license QA:
// a candidate can be legally usable and still look cheap, generic, or visually weak.
const GENERIC_STOCK_RE = /\b(handshake|laptop|keyboard|generic office|business meeting|stock photo|smiling business|call center|abstract network|glowing ai face|robot hand)\b/i;
const PREMIUM_HINT_RE = /\b(architecture|cityscape|institution|parliament|cathedral|museum|factory|port|harbor|laboratory|observatory|stadium|portrait|sculpture|painting|landscape|night|dusk|dramatic light|cinematic|editorial)\b/i;

function visualTerms(value) {
  const stop = new Set(['the','and','for','with','from','this','that','into','over','amid','after','before','may','new','says','say','latest','story']);
  return new Set(String(value || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w)));
}

export function semanticVisualScore(candidate, brief = {}) {
  const wanted = visualTerms([brief?.title, brief?.dek, ...(brief?.entities || [])].filter(Boolean).join(' '));
  const seen = visualTerms([candidate?.title, candidate?.description].filter(Boolean).join(' '));
  if (!wanted.size || !seen.size) return 0;
  let hits = 0;
  for (const term of wanted) if (seen.has(term)) hits++;
  return Math.min(30, hits * 6);
}

export function editorialVisualScore(candidate, brief = {}) {
  const text = [
    candidate?.title,
    candidate?.description,
    brief?.title,
    ...(brief?.entities || [])
  ].filter(Boolean).join(' ');

  let score = 50;
  const width = Number(candidate?.width || 0);
  const height = Number(candidate?.height || 0);
  const ratio = width && height ? width / height : 0;

  // Composition / crop suitability for Nuvellum's wide editorial cards.
  if (ratio >= 1.35 && ratio <= 2.05) score += 12;
  else if (ratio >= 1.15 && ratio <= 2.35) score += 5;
  else if (ratio) score -= 8;

  if (width >= 1800) score += 8;
  else if (width >= 1400) score += 4;

  // Editorial presence: reward subjects that read as place, institution, craft, or atmosphere.
  if (PREMIUM_HINT_RE.test(text)) score += 12;
  if (GENERIC_STOCK_RE.test(text)) score -= 22;

  // Documentary images with useful descriptive context are preferable to bare file dumps.
  if (String(candidate?.description || '').trim().length >= 40) score += 6;

  // Commons' own curation signals are useful quality hints, not proof of relevance.
  const badges = Array.isArray(candidate?.badges) ? candidate.badges : [];
  if (badges.includes('featured')) score += 10;
  if (badges.includes('quality')) score += 6;
  if (badges.includes('valued')) score += 4;

  // Relevance is scored separately from aesthetics so a gorgeous but unrelated image cannot win.
  score += semanticVisualScore(candidate, brief);

  // Prefer photographs unless the brief explicitly calls for illustration/map treatment.
  const mime = String(candidate?.mime || '').toLowerCase();
  if (brief?.mode === 'photo' && /^image\/(jpeg|jpg|png|webp)$/.test(mime)) score += 8;

  // Keep the result bounded and easy to reason about.
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function rankVisualCandidates(candidates, brief) {
  return [...(candidates || [])]
    .map(candidate => {
      const editorialScore = editorialVisualScore(candidate, brief);
      const semanticScore = semanticVisualScore(candidate, brief);
      return {
        ...candidate,
        semanticScore,
        editorialScore,
        selectionConfidence: Math.max(0, Math.min(100, Math.round(editorialScore * .72 + semanticScore * .93)))
      };
    })
    .sort((a,b) => b.selectionConfidence - a.selectionConfidence || b.editorialScore - a.editorialScore);
}

export function selectBestVisual(candidates, brief, { minConfidence = 58 } = {}) {
  const ranked = rankVisualCandidates(
    (candidates || []).filter(candidate => visualCandidateProblems(candidate).length === 0),
    brief
  );
  const best = ranked[0] || null;
  return {
    best: best && best.selectionConfidence >= minConfidence ? best : null,
    ranked,
    needsReview: !best || best.selectionConfidence < minConfidence || brief?.mode === 'map-review'
  };
}
