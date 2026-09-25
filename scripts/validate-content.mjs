import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const dir = join(root, 'src', 'content', 'articles');

const required = ['title','dek','section','type','author','date','readingTime','image','imageAlt','status','tags'];
const statuses = new Set(['draft','review','published']);
const types = new Set(['News','Analysis','Opinion','Review','Explainer','Essay','Ideas']);
const risks = new Set(['low','sensitive']);
const origins = new Set(['manual','automation']);
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

for (const name of readdirSync(dir).filter(x => x.endsWith('.md')).sort()) {
  const path = join(dir, name);
  const src = readFileSync(path, 'utf8');
  try {
    const { data, body } = parse(src, name);
    const slug = basename(name, '.md');

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`${name}: invalid slug/filename`);
    for (const key of required) if (data[key] === undefined || data[key] === '') errors.push(`${name}: missing required frontmatter field "${key}"`);

    if (data.status && !statuses.has(data.status)) errors.push(`${name}: status must be draft, review or published`);
    if (data.type && !types.has(data.type)) errors.push(`${name}: unsupported type "${data.type}"`);
    if (data.origin && !origins.has(data.origin)) errors.push(`${name}: origin must be manual or automation`);
    if (data.risk && !risks.has(data.risk)) errors.push(`${name}: risk must be low or sensitive`);

    if (data.date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date + 'T00:00:00Z')))) errors.push(`${name}: date must be YYYY-MM-DD`);
    if (data.updated && (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated) || Number.isNaN(Date.parse(data.updated + 'T00:00:00Z')))) errors.push(`${name}: updated must be YYYY-MM-DD`);

    if (data.title && String(data.title).length > 180) errors.push(`${name}: title is over 180 characters`);
    if (data.dek && String(data.dek).length > 360) errors.push(`${name}: dek is over 360 characters`);
    if (!Array.isArray(data.tags) || data.tags.length === 0) errors.push(`${name}: tags must be a non-empty JSON-style array`);

    for (const key of ['title','dek','section','type','author','imageAlt','reviewedBy']) {
      if (data[key] && /[<>]/.test(String(data[key]))) errors.push(`${name}: HTML is not allowed in ${key}`);
    }

    if (data.image && !/^(\/images\/|\/uploads\/|https:\/\/)/.test(String(data.image))) errors.push(`${name}: image must use /images/, /uploads/ or https://`);
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
          const key = String(sourceUrl).trim();
          if (key) {
            if (seenSources.has(key)) errors.push(`${name}: source URL already used by ${seenSources.get(key)}`);
            else seenSources.set(key, name);
          }
        }
      }
    }

    if (data.origin === 'automation') {
      if (!Array.isArray(data.sourceUrls) || data.sourceUrls.length === 0) errors.push(`${name}: automated stories require at least one sourceUrls entry`);
      if (!data.risk) errors.push(`${name}: automated stories require risk: low or sensitive`);
      if (data.risk === 'sensitive' && data.status === 'published' && !String(data.reviewedBy || '').trim()) {
        errors.push(`${name}: sensitive automated stories cannot be published without reviewedBy`);
      }
    }
  } catch (err) {
    errors.push(err.message);
  }
}

if (errors.length) {
  console.error('\nNuvellum content validation failed:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nuvellum content validation passed.');
