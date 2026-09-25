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
const dangerous = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*form\b/i,
  /javascript\s*:/i,
  /\bon\w+\s*=/i
];

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
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    data[m[1]] = value;
  }
  return { data, body };
}

const errors = [];
for (const name of readdirSync(dir).filter(x => x.endsWith('.md')).sort()) {
  const path = join(dir, name);
  const src = readFileSync(path, 'utf8');
  try {
    const { data, body } = parse(src, name);
    const slug = basename(name, '.md');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`${name}: invalid slug/filename`);
    for (const key of required) if (!data[key]) errors.push(`${name}: missing required frontmatter field "${key}"`);
    if (data.status && !statuses.has(data.status)) errors.push(`${name}: status must be draft, review or published`);
    if (data.type && !types.has(data.type)) errors.push(`${name}: unsupported type "${data.type}"`);
    if (data.date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date + 'T00:00:00Z')))) errors.push(`${name}: date must be YYYY-MM-DD`);
    if (data.title && data.title.length > 180) errors.push(`${name}: title is over 180 characters`);
    if (data.dek && data.dek.length > 360) errors.push(`${name}: dek is over 360 characters`);
    for (const key of ['title','dek','section','type','author','imageAlt']) {
      if (data[key] && /[<>]/.test(data[key])) errors.push(`${name}: HTML is not allowed in ${key}`);
    }
    if (data.image && !/^(\/images\/|\/uploads\/|https:\/\/)/.test(data.image)) errors.push(`${name}: image must use /images/, /uploads/ or https://`);
    if (!body) errors.push(`${name}: article body is empty`);
    if (/<\s*\/?\s*[A-Za-z][^>]*>/.test(body)) errors.push(`${name}: raw HTML is blocked in article bodies; use Markdown only`);
    for (const pattern of dangerous) if (pattern.test(src)) errors.push(`${name}: blocked unsafe markup or URL pattern: ${pattern}`);
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
