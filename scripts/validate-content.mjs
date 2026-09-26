import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const dir = join(root, 'src', 'content', 'articles');
const aiArtDir = join(root, 'public', 'generated', 'ai');

const required = ['title','dek','section','type','author','date','readingTime','image','imageAlt','status','tags'];
const statuses = new Set(['draft','review','published']);
const sections = new Set(['World','Business','Technology','Science','Crime','Sports','Culture','Film & TV','Anime','Gaming','Opinion']);
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

// Story-specific AI illustrations committed by the newsroom live at public/generated/ai/<slug>.svg.
// They are served as <img> sources, so only static vector drawing is allowed: an element allowlist,
// no scripting, no event handlers, no links, no external or embedded resources, no text.
const svgElements = new Set([
  'svg','g','defs','style','title','desc','path','rect','circle','ellipse','line','polyline','polygon',
  'lineargradient','radialgradient','stop','clippath','mask','pattern','filter',
  'fegaussianblur','feoffset','feblend','fecolormatrix','femerge','femergenode','feflood','fecomposite',
  'feturbulence','fedisplacementmap','fedropshadow','fecomponenttransfer','fefunca','fefuncr','fefuncg','fefuncb','femorphology'
]);
const svgBlocked = [
  /<!DOCTYPE/i, /<!ENTITY/i, /<\?xml-stylesheet/i, /<!\[CDATA\[/i,
  /javascript\s*:/i, /data\s*:/i, /\bon[a-z]+\s*=/i, /\b(?:xlink:)?href\s*=/i,
  /@import/i, /expression\s*\(/i, /behavior\s*:/i, /url\(\s*["']?\s*(?!#)/i
];
const maxSvgBytes = 150 * 1024;
const aiImagePath = /^\/generated\/ai\/([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/;

function validateSvg(file, label) {
  const problems = [];
  const size = statSync(file).size;
  if (size > maxSvgBytes) problems.push(`is ${size} bytes (limit ${maxSvgBytes})`);
  const svg = readFileSync(file, 'utf8').trim();
  if (!/^<svg\b[^>]*>[\s\S]*<\/svg>$/.test(svg)) problems.push('must be a single <svg> root element');
  if (!/^<svg\b[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) problems.push('must declare xmlns="http://www.w3.org/2000/svg"');
  for (const pattern of svgBlocked) if (pattern.test(svg)) problems.push(`contains blocked pattern ${pattern}`);
  for (const m of svg.matchAll(/<\s*\/?\s*([A-Za-z][\w:.-]*)/g)) {
    const name = m[1].toLowerCase();
    if (!svgElements.has(name)) problems.push(`uses disallowed element <${m[1]}>`);
  }
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line)\b/i.test(svg)) problems.push('has no drawable shapes');
  return [...new Set(problems)].map(p => `${label}: ${p}`);
}

const errors = [];
const seenTitles = new Map();
const articleSlugs = new Set(readdirSync(dir).filter(x => x.endsWith('.md')).map(x => basename(x, '.md')));
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
    if (data.updated && (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated) || Number.isNaN(Date.parse(data.updated + 'T00:00:00Z')))) errors.push(`${name}: updated must be YYYY-MM-DD`);

    if (data.title && String(data.title).length > 180) errors.push(`${name}: title is over 180 characters`);
    if (data.dek && String(data.dek).length > 360) errors.push(`${name}: dek is over 360 characters`);
    if (!Array.isArray(data.tags) || data.tags.length === 0) errors.push(`${name}: tags must be a non-empty JSON-style array`);

    for (const key of ['title','dek','section','type','author','imageAlt','reviewedBy']) {
      if (data[key] && /[<>]/.test(String(data[key]))) errors.push(`${name}: HTML is not allowed in ${key}`);
    }

    const aiImage = String(data.image || '').match(aiImagePath);
    if (aiImage) {
      // An AI illustration must belong to this article and exist as a validated file.
      if (aiImage[1] !== slug) errors.push(`${name}: AI image must be /generated/ai/${slug}.svg`);
      const file = join(aiArtDir, `${aiImage[1]}.svg`);
      if (!existsSync(file)) errors.push(`${name}: AI image ${data.image} is missing from public/generated/ai/`);
    } else if (data.image && !/^(\/images\/|\/uploads\/|https:\/\/)/.test(String(data.image))) {
      errors.push(`${name}: image must use /images/, /uploads/, https:// or /generated/ai/<slug>.svg`);
    }

    if (data.publishedAt !== undefined) {
      const ts = String(data.publishedAt);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(ts) || Number.isNaN(Date.parse(ts))) errors.push(`${name}: publishedAt must be an ISO-8601 UTC timestamp`);
      else if (data.date && ts.slice(0, 10) !== data.date) errors.push(`${name}: publishedAt must fall on the article date`);
    }
    if (data.editorialReview !== undefined && !['pending','passed','failed'].includes(data.editorialReview)) errors.push(`${name}: editorialReview must be pending, passed or failed`);
    if (data.verification !== undefined && !['cleared','failed'].includes(data.verification)) errors.push(`${name}: verification must be cleared or failed`);
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
      // Newsroom metadata contract (stories carrying publishedAt come from the v6.5 pipeline).
      if (data.publishedAt !== undefined && data.status === 'published') {
        if (data.editorialReview !== 'passed') errors.push(`${name}: published automated stories require editorialReview: "passed"`);
        if (data.risk === 'sensitive') {
          if (data.verification !== 'cleared') errors.push(`${name}: published sensitive stories require verification: "cleared"`);
          if (data.reviewedBy !== 'Nuvellum Verification Pipeline') errors.push(`${name}: sensitive stories cleared by the pipeline must have reviewedBy: "Nuvellum Verification Pipeline"`);
        }
      }
      if (data.verification === 'failed' && data.status === 'published') errors.push(`${name}: stories that failed verification cannot be published`);
      if (/Prepared from (Source|Unknown|undefined) reporting/i.test(String(data.sourceNote || ''))) errors.push(`${name}: sourceNote names a placeholder outlet`);
      if (Array.isArray(data.sourceUrls) && data.sourceUrls.some(u => /[?&](utm_[a-z]+|fbclid|gclid|__source)=/i.test(String(u)))) errors.push(`${name}: sourceUrls contain tracking parameters`);
    }
  } catch (err) {
    errors.push(err.message);
  }
}

if (existsSync(aiArtDir)) {
  for (const file of readdirSync(aiArtDir).sort()) {
    const label = `public/generated/ai/${file}`;
    const m = file.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/);
    if (!m) { errors.push(`${label}: only <slug>.svg files are allowed here`); continue; }
    if (!articleSlugs.has(m[1])) errors.push(`${label}: no matching article src/content/articles/${m[1]}.md`);
    errors.push(...validateSvg(join(aiArtDir, file), label));
  }
}

if (errors.length) {
  console.error('\nNuvellum content validation failed:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nuvellum content validation passed.');
