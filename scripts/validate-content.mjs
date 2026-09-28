import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { validateSvg } from './lib/svg-safety.mjs';
import { contentPolicyErrors } from './lib/editorial.mjs';
import { resolveCountry } from '../src/lib/countries.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const dir = join(root, 'src', 'content', 'articles');
const aiArtDir = join(root, 'public', 'generated', 'ai');
const AI_IMAGE_RE = /^\/generated\/ai\/([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/;

const required = ['title','dek','section','type','author','date','readingTime','image','imageAlt','status','tags'];
const statuses = new Set(['draft','review','published']);
const sections = new Set(['World','Business','Technology','Science','Crime','Sports','Culture','Film & TV','Anime','Gaming','Opinion']);
const types = new Set(['News','Analysis','Opinion','Review','Explainer','Essay','Ideas']);
const risks = new Set(['low','sensitive']);
const origins = new Set(['manual','automation']);
const worldRegions = new Set(['north-america','latin-america-caribbean','europe-central-asia','middle-east-north-africa','sub-saharan-africa','south-asia','east-asia','southeast-asia-oceania']);
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

function parse(src, file) {
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

function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/g,' ').trim();
}

const errors = [];
const seenTitles = new Map();
const seenSources = new Map();

function normalizeSource(value) {
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

for (const name of readdirSync(dir).filter(x => x.endsWith('.md')).sort()) {
  const path = join(dir, name);
  const src = readFileSync(path, 'utf8');
  try {
    const { data, body } = parse(src, name);
    const slug = basename(name, '.md');

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`${name}: invalid slug/filename`);
    for (const key of required) if (data[key] === undefined || data[key] === '') errors.push(`${name}: missing required frontmatter field "${key}"`);

    if (data.status && !statuses.has(data.status)) errors.push(`${name}: status must be draft, review or published`);
    if (data.section && !sections.has(data.section)) errors.push(`${name}: unsupported section "${data.section}"`);
    if (data.type && !types.has(data.type)) errors.push(`${name}: unsupported type "${data.type}"`);
    if (data.origin && !origins.has(data.origin)) errors.push(`${name}: origin must be manual or automation`);
    if (data.risk && !risks.has(data.risk)) errors.push(`${name}: risk must be low or sensitive`);

    if (data.date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date + 'T00:00:00Z')))) errors.push(`${name}: date must be YYYY-MM-DD`);
    if (data.publishedAt !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(String(data.publishedAt)) || Number.isNaN(Date.parse(String(data.publishedAt))))) errors.push(`${name}: publishedAt must be an ISO 8601 timestamp with timezone`);
    else if (data.publishedAt && data.date && !String(data.publishedAt).startsWith(data.date) && Math.abs(Date.parse(data.publishedAt) - Date.parse(data.date + 'T12:00:00Z')) > 36 * 3600e3) errors.push(`${name}: publishedAt does not match date`);
    if (data.updated && (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated) || Number.isNaN(Date.parse(data.updated + 'T00:00:00Z')))) errors.push(`${name}: updated must be YYYY-MM-DD`);

    if (data.title && String(data.title).length > 180) errors.push(`${name}: title is over 180 characters`);
    if (data.dek && String(data.dek).length > 360) errors.push(`${name}: dek is over 360 characters`);
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

    if (data.image) {
      const image = String(data.image);
      const aiImage = image.match(AI_IMAGE_RE);
      if (image.startsWith('/generated/')) {
        if (!aiImage) errors.push(`${name}: generated images must be /generated/ai/<slug>.svg`);
        else if (aiImage[1] !== slug) errors.push(`${name}: AI image must belong to this article (/generated/ai/${slug}.svg)`);
        else if (!existsSync(join(aiArtDir, `${slug}.svg`))) errors.push(`${name}: AI image file public/generated/ai/${slug}.svg is missing`);
      } else if (!/^(\/images\/|\/uploads\/|https:\/\/)/.test(image)) {
        errors.push(`${name}: image must use /images/, /uploads/, /generated/ai/ or https://`);
      }
      if (image.startsWith('/uploads/articles/') && data.origin === 'automation' && !existsSync(join(root, 'public', image))) {
        errors.push(`${name}: local article image ${image} is missing`);
      }
    }
    if (data.imageProvider === 'wikimedia') {
      if (data.imageKind !== 'photo') errors.push(`${name}: Wikimedia visuals must use imageKind: photo`);
      const expectedImagePrefix = `/uploads/articles/${slug}.`;
      if (!String(data.image || '').startsWith(expectedImagePrefix) || !/\.(?:jpe?g|png|webp)$/i.test(String(data.image || ''))) {
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

    const normalizedTitle = normalizeTitle(data.title);
    if (normalizedTitle) {
      if (seenTitles.has(normalizedTitle)) errors.push(`${name}: duplicate title also used by ${seenTitles.get(normalizedTitle)}`);
      else seenTitles.set(normalizedTitle, name);
    }

    if (data.sourceUrls !== undefined) {
      if (!Array.isArray(data.sourceUrls)) {
        errors.push(`${name}: sourceUrls must be a JSON-style array`);
      } else {
        for (const sourceUrl of data.sourceUrls) {
          if (!/^https:\/\//i.test(String(sourceUrl))) errors.push(`${name}: source URL must use https://`);
          const key = normalizeSource(sourceUrl);
          if (key) {
            if (seenSources.has(key)) errors.push(`${name}: source URL already used by ${seenSources.get(key)}`);
            else seenSources.set(key, name);
          }
        }
      }
    }

    if (data.origin === 'automation') {
      if (data.section === 'Opinion' || ['Opinion','Essay','Ideas','Review'].includes(data.type)) errors.push(`${name}: automated intake cannot publish Opinion/Essay/Ideas/Review; those formats are human-led`);
      if (!Array.isArray(data.sourceUrls) || data.sourceUrls.length === 0) errors.push(`${name}: automated stories require at least one sourceUrls entry`);
      if (!data.risk) errors.push(`${name}: automated stories require risk: low or sensitive`);
      if (data.risk === 'sensitive' && data.status === 'published' && !String(data.reviewedBy || '').trim()) {
        errors.push(`${name}: sensitive automated stories cannot be published without reviewedBy`);
      }
      errors.push(...contentPolicyErrors(data, name));
    }
  } catch (err) {
    errors.push(err.message);
  }
}

// Every committed AI illustration is untrusted input served from our origin.
if (existsSync(aiArtDir)) {
  for (const file of readdirSync(aiArtDir).sort()) {
    if (file.startsWith('.')) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/.test(file)) {
      errors.push(`public/generated/ai/${file}: only <slug>.svg files are allowed here`);
      continue;
    }
    for (const problem of validateSvg(readFileSync(join(aiArtDir, file), 'utf8'), `public/generated/ai/${file}`)) errors.push(problem);
  }
}

if (errors.length) {
  console.error('\nNuvellum content validation failed:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nuvellum content validation passed.');
