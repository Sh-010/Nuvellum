// The Nuvellum article contract: vocabularies and per-article rules. The repository validator
// (scripts/validate-content.mjs) and the admin dashboard (scripts/lib/admin/) both use this module,
// so manual and automated stories are held to exactly the same rules.
import { validateSvg } from './svg-safety.mjs';
import { contentPolicyErrors, EDITORIAL_REVIEW_VALUES, VERIFICATION_VALUES, VERIFICATION_REVIEWER } from './editorial.mjs';
import { resolveCountry } from '../../src/lib/countries.js';

export { validateSvg };

// image is optional: a story without an acceptable image is set text-led. When present it needs alt text.
export const REQUIRED_FIELDS = Object.freeze(['title','dek','section','type','author','date','readingTime','status','tags']);
export const STATUSES = Object.freeze(['draft','review','published']);
export const SECTIONS = Object.freeze(['World','Business','Technology','Science','Crime','Sports','Culture','Film & TV','Anime','Gaming','Opinion']);
export const TYPES = Object.freeze(['News','Analysis','Opinion','Review','Explainer','Essay','Ideas']);
export const RISKS = Object.freeze(['low','sensitive']);
export const ORIGINS = Object.freeze(['manual','automation']);
export const WORLD_REGIONS = Object.freeze(['north-america','latin-america-caribbean','europe-central-asia','middle-east-north-africa','sub-saharan-africa','south-asia','east-asia','southeast-asia-oceania']);
export const HUMAN_LED_TYPES = Object.freeze(['Opinion','Essay','Ideas','Review']);
export const TITLE_MAX = 180;
export const DEK_MAX = 360;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const AI_IMAGE_RE = /^\/generated\/ai\/([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/;

const statuses = new Set(STATUSES);
const sections = new Set(SECTIONS);
const types = new Set(TYPES);
const risks = new Set(RISKS);
const origins = new Set(ORIGINS);
const worldRegions = new Set(WORLD_REGIONS);
const dangerous = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*form\b/i,
  /javascript\s*:/i,
  /\bon\w+\s*=/i
];

function parseValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try { return JSON.parse(trimmed); } catch { return trimmed; }
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1,-1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed;
}

/** Split an article into its flat frontmatter and body. Throws on a malformed file. */
export function parseArticle(src, file) {
  if (!src.startsWith('---')) throw new Error(`${file}: missing frontmatter opening delimiter`);
  const end = src.indexOf('\n---', 3);
  if (end < 0) throw new Error(`${file}: missing frontmatter closing delimiter`);
  const header = src.slice(3, end).trim();
  const body = src.slice(end + 4).trim();
  const data = {};
  for (const raw of header.split(/\r?\n/)) {
    const m = raw.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = parseValue(m[2]);
  }
  return { data, body };
}

export function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/g,' ').trim();
}

export function normalizeSource(value) {
  try {
    const u = new URL(String(value || '').trim());
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

/** Markdown link and image targets allowed in article bodies: web links, mail, site-relative paths and anchors. */
export const SAFE_LINK_RE = /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i;
export function unsafeLinkTargets(body) {
  const bad = [];
  for (const m of String(body).matchAll(/\]\(\s*<?([^)\s>]*)/g)) if (m[1] && !SAFE_LINK_RE.test(m[1])) bad.push(m[1]);
  for (const m of String(body).matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) if (!SAFE_LINK_RE.test(m[1])) bad.push(m[1]);
  return bad;
}

/**
 * Editorial gates for stories created in the admin dashboard (origin: "manual"). Automated stories are
 * gated by contentPolicyErrors(); articles without an origin predate both and are left as they are.
 */
export function manualPublicationErrors(data, name) {
  const errors = [];
  if (data.origin !== 'manual') return errors;
  if (!risks.has(data.risk)) errors.push(`${name}: manual stories require risk: low or sensitive`);
  if (data.editorialReview !== undefined && !EDITORIAL_REVIEW_VALUES.has(data.editorialReview)) errors.push(`${name}: editorialReview must be passed, failed or uncertain`);
  if (data.verification !== undefined && !VERIFICATION_VALUES.has(data.verification)) errors.push(`${name}: verification must be cleared, failed or uncertain`);
  if (data.status === 'published') {
    if (data.editorialReview !== 'passed') errors.push(`${name}: a manual story can only be published with editorialReview: "passed" (is "${data.editorialReview ?? 'missing'}")`);
    if (data.risk === 'sensitive') {
      if (data.verification !== 'cleared') errors.push(`${name}: a sensitive manual story can only be published with verification: "cleared" (is "${data.verification ?? 'missing'}")`);
      if (!String(data.reviewedBy || '').trim()) errors.push(`${name}: a sensitive manual story can only be published with a named reviewedBy`);
    }
  }
  if (String(data.reviewedBy || '').trim() === VERIFICATION_REVIEWER) errors.push(`${name}: reviewedBy "${VERIFICATION_REVIEWER}" is reserved for the automated pipeline; name the human reviewer`);
  return errors;
}

/**
 * Validate one article. `ctx.registry` carries titles and sources already seen (for duplicate checks
 * across the collection); `ctx.aiArtExists(slug)` and `ctx.publicFileExists(path)` report whether the
 * referenced local files exist, so callers without the repository on disk (the dashboard) can answer
 * from GitHub.
 */
export function articleErrors(src, name, ctx = {}) {
  const errors = [];
  const registry = ctx.registry || { titles: new Map(), sources: new Map() };
  const aiArtExists = ctx.aiArtExists || (() => true);
  const publicFileExists = ctx.publicFileExists || (() => true);
  try {
    const { data, body } = parseArticle(src, name);
    const slug = name.replace(/\.md$/, '');

    if (!SLUG_RE.test(slug)) errors.push(`${name}: invalid slug/filename`);
    for (const key of REQUIRED_FIELDS) if (data[key] === undefined || data[key] === '') errors.push(`${name}: missing required frontmatter field "${key}"`);

    if (data.status && !statuses.has(data.status)) errors.push(`${name}: status must be draft, review or published`);
    if (data.section && !sections.has(data.section)) errors.push(`${name}: unsupported section "${data.section}"`);
    if (data.type && !types.has(data.type)) errors.push(`${name}: unsupported type "${data.type}"`);
    if (data.origin && !origins.has(data.origin)) errors.push(`${name}: origin must be manual or automation`);
    if (data.risk && !risks.has(data.risk)) errors.push(`${name}: risk must be low or sensitive`);

    if (data.date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date + 'T00:00:00Z')))) errors.push(`${name}: date must be YYYY-MM-DD`);
    if (data.publishedAt !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(String(data.publishedAt)) || Number.isNaN(Date.parse(String(data.publishedAt))))) errors.push(`${name}: publishedAt must be an ISO 8601 timestamp with timezone`);
    else if (data.publishedAt && data.date && !String(data.publishedAt).startsWith(data.date) && Math.abs(Date.parse(data.publishedAt) - Date.parse(data.date + 'T12:00:00Z')) > 36 * 3600e3) errors.push(`${name}: publishedAt does not match date`);
    if (data.updated && (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated) || Number.isNaN(Date.parse(data.updated + 'T00:00:00Z')))) errors.push(`${name}: updated must be YYYY-MM-DD`);

    if (data.title && String(data.title).length > TITLE_MAX) errors.push(`${name}: title is over ${TITLE_MAX} characters`);
    if (data.dek && String(data.dek).length > DEK_MAX) errors.push(`${name}: dek is over ${DEK_MAX} characters`);
    if (!Array.isArray(data.tags) || data.tags.length === 0) errors.push(`${name}: tags must be a non-empty JSON-style array`);
    if (data.regions !== undefined) {
      if (!Array.isArray(data.regions)) errors.push(`${name}: regions must be a JSON-style array`);
      else {
        if (data.regions.length > 4) errors.push(`${name}: regions may contain at most 4 entries`);
        if (new Set(data.regions).size !== data.regions.length) errors.push(`${name}: regions must not contain duplicates`);
        for (const region of data.regions) if (!worldRegions.has(String(region))) errors.push(`${name}: unsupported region "${region}"`);
      }
    }
    if (data.countries !== undefined) {
      if (!Array.isArray(data.countries)) errors.push(`${name}: countries must be a JSON-style array`);
      else {
        if (data.countries.length > 12) errors.push(`${name}: countries may contain at most 12 entries`);
        const seenCountry = new Set();
        for (const country of data.countries) {
          const c = String(country).trim();
          if (c.length < 2 || c.length > 80) errors.push(`${name}: invalid country "${country}"`);
          // Names must be ones World Explorer can place; otherwise the story silently never
          // reaches its country desk. Aliases ("UK", "Turkey") resolve to the same entity.
          const entity = resolveCountry(c);
          if (!entity) errors.push(`${name}: unrecognised country "${country}" (use the World Explorer name, e.g. "United States", "Palestine")`);
          const key = entity ? entity.name : c.toLowerCase();
          if (seenCountry.has(key)) errors.push(`${name}: countries must not contain duplicates`);
          seenCountry.add(key);
        }
      }
    }

    for (const key of ['title','dek','section','type','author','imageAlt','reviewedBy','imageCaption','imageCredit','imageLicense']) {
      if (data[key] && /[<>]/.test(String(data[key]))) errors.push(`${name}: HTML is not allowed in ${key}`);
    }

    const imagePath = data.image ? String(data.image).replace(/[?#].*$/, '') : '';
    if (data.image && !String(data.imageAlt || '').trim()) errors.push(`${name}: image needs imageAlt`);
    if (data.image && /^\/uploads\/house\//.test(String(data.image))) errors.push(`${name}: generic house art does not depict the story; omit image so it is set text-led`);
    if (data.image) {
      const image = String(data.image);
      const aiImage = image.match(AI_IMAGE_RE);
      if (image.startsWith('/generated/')) {
        if (!aiImage) errors.push(`${name}: generated images must be /generated/ai/<slug>.svg`);
        else if (aiImage[1] !== slug) errors.push(`${name}: AI image must belong to this article (/generated/ai/${slug}.svg)`);
        else if (!aiArtExists(slug)) errors.push(`${name}: AI image file public/generated/ai/${slug}.svg is missing`);
      } else if (!/^(\/images\/|\/uploads\/|https:\/\/)/.test(image)) {
        errors.push(`${name}: image must use /images/, /uploads/, /generated/ai/ or https://`);
      }
      if (image.startsWith('/uploads/articles/') && data.origin === 'automation' && !publicFileExists(imagePath)) {
        errors.push(`${name}: local article image ${imagePath} is missing`);
      }
    }
    if (data.imageProvider === 'wikimedia') {
      if (data.imageKind !== 'photo') errors.push(`${name}: Wikimedia visuals must use imageKind: photo`);
      const expectedImagePrefix = `/uploads/articles/${slug}.`;
      if (!imagePath.startsWith(expectedImagePrefix) || !/\.(?:jpe?g|png|webp)$/i.test(imagePath)) {
        errors.push(`${name}: Wikimedia image must be /uploads/articles/${slug}.<jpg|png|webp>`);
      }
      for (const key of ['imageCaption','imageCredit','imageLicense','imageLicenseUrl','imageSourcePage']) {
        if (!String(data[key] || '').trim()) errors.push(`${name}: Wikimedia image is missing ${key}`);
      }
      if (data.origin === 'automation' && !/^File photo:/i.test(String(data.imageCaption || ''))) {
        errors.push(`${name}: automated Wikimedia caption must begin "File photo:"`);
      }
      if (data.imageSourcePage && !/^https:\/\/commons\.wikimedia\.org\//i.test(String(data.imageSourcePage))) {
        errors.push(`${name}: imageSourcePage must be a Wikimedia Commons page`);
      }
      if (data.imageLicenseUrl && !/^https:\/\//i.test(String(data.imageLicenseUrl))) {
        errors.push(`${name}: imageLicenseUrl must use https://`);
      }
    }
    if (!body) errors.push(`${name}: article body is empty`);
    if (/<\s*\/?\s*[A-Za-z][^>]*>/.test(body)) errors.push(`${name}: raw HTML is blocked in article bodies; use Markdown only`);
    for (const pattern of dangerous) if (pattern.test(src)) errors.push(`${name}: blocked unsafe markup or URL pattern: ${pattern}`);
    for (const target of unsafeLinkTargets(body)) errors.push(`${name}: link target "${target.slice(0, 60)}" is not allowed; use https://, mailto:, a /site path or #anchor`);

    const normalizedTitle = normalizeTitle(data.title);
    if (normalizedTitle) {
      if (registry.titles.has(normalizedTitle)) errors.push(`${name}: duplicate title also used by ${registry.titles.get(normalizedTitle)}`);
      else registry.titles.set(normalizedTitle, name);
    }

    if (data.sourceUrls !== undefined) {
      if (!Array.isArray(data.sourceUrls)) {
        errors.push(`${name}: sourceUrls must be a JSON-style array`);
      } else {
        for (const sourceUrl of data.sourceUrls) {
          if (!/^https:\/\//i.test(String(sourceUrl))) errors.push(`${name}: source URL must use https://`);
          const key = normalizeSource(sourceUrl);
          if (key) {
            if (registry.sources.has(key)) errors.push(`${name}: source URL already used by ${registry.sources.get(key)}`);
            else registry.sources.set(key, name);
          }
        }
      }
    }

    if (data.origin === 'automation') {
      if (data.section === 'Opinion' || HUMAN_LED_TYPES.includes(data.type)) errors.push(`${name}: automated intake cannot publish Opinion/Essay/Ideas/Review; those formats are human-led`);
      if (!Array.isArray(data.sourceUrls) || data.sourceUrls.length === 0) errors.push(`${name}: automated stories require at least one sourceUrls entry`);
      if (!data.risk) errors.push(`${name}: automated stories require risk: low or sensitive`);
      if (data.risk === 'sensitive' && data.status === 'published' && !String(data.reviewedBy || '').trim()) {
        errors.push(`${name}: sensitive automated stories cannot be published without reviewedBy`);
      }
      errors.push(...contentPolicyErrors(data, name));
    }
    errors.push(...manualPublicationErrors(data, name));
  } catch (err) {
    errors.push(err.message);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Serialization: the same flat frontmatter the newsroom writes (JSON-quoted scalars and arrays).
// ---------------------------------------------------------------------------
export const FIELD_ORDER = Object.freeze(['title','dek','section','type','author','date','publishedAt','updated','readingTime',
  'image','imageAlt','imageProvider','imageKind','imageCaption','imageCredit','imageLicense','imageLicenseUrl','imageSourcePage',
  'status','tags','regions','countries','sourceUrls','sourceNote','origin','risk','editorialReview','verification','reviewedBy']);

function fmValue(v) {
  if (Array.isArray(v)) return JSON.stringify(v.map(x => String(x)));
  return JSON.stringify(String(v ?? ''));
}

/** Serialize frontmatter + body. Unknown keys are dropped; empty strings and empty optional arrays are omitted. */
export function serializeArticle(data, body) {
  const keep = (k) => {
    const v = data[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0 || k === 'tags' || k === 'regions' || k === 'countries';
    return String(v).trim() !== '' || k === 'reviewedBy'; // the newsroom always writes reviewedBy, even empty
  };
  const fm = FIELD_ORDER.filter(keep).map(k => `${k}: ${fmValue(data[k])}`).join('\n');
  return `---\n${fm}\n---\n\n${String(body || '').replace(/\r\n/g, '\n').trim()}\n`;
}
