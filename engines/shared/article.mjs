import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from './brand.mjs';

export const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ARTICLES = join(REPO_ROOT, 'src', 'content', 'articles');

function parseValue(v) {
  v = String(v ?? '').trim();
  if (v.startsWith('[') && v.endsWith(']')) { try { return JSON.parse(v); } catch { return v; } }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

export function parseArticle(markdown) {
  const text = String(markdown);
  if (!text.startsWith('---')) throw new Error('article has no frontmatter');
  const end = text.indexOf('\n---', 3);
  if (end < 0) throw new Error('article frontmatter is not closed');
  const data = {};
  for (const line of text.slice(3, end).trim().split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2]);
  }
  return { data, body: text.slice(end + 4).trim() };
}

export function plainText(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sentences(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return (normalized.match(/[^.!?]+[.!?][\"”’]?|[^.!?]+$/g) || []).map(s => s.trim()).filter(s => s.length > 20);
}

export function bodySentences(markdown) {
  const paras = String(markdown).split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !/^#{1,6}\s/.test(p));
  return paras.flatMap(p => sentences(plainText(p)));
}

function imageInfo(data) {
  const src = String(data.image || '').trim();
  const mode = mediaMode(data);
  if (!src.startsWith('/')) return { path: null, kind: mode };
  const path = join(REPO_ROOT, 'public', src.replace(/^\/+/, ''));
  return { path: existsSync(path) ? path : null, kind: mode };
}

function bodyKey(md) {
  try { return parseArticle(md).body.replace(/\s+/g, ' ').trim(); } catch { return ''; }
}

export function placeholderSlugs() {
  const byBody = new Map();
  for (const f of readdirSync(ARTICLES).filter(f => f.endsWith('.md'))) {
    const md = readFileSync(join(ARTICLES, f), 'utf8');
    const key = bodyKey(md);
    if (!key) continue;
    byBody.set(key, [...(byBody.get(key) || []), f.slice(0, -3)]);
  }
  return new Set([...byBody.values()].filter(v => v.length > 1).flat());
}

export function mediaMode(data) {
  const image = String(data.image || '').trim();
  if (!image) return 'text-led';
  // Nuvellum-drawn SVGs also live in /uploads/articles/; they are illustrations, never "FILE PHOTO".
  if (data.imageKind === 'illustration' || /^\/uploads\/articles\/.+\.svg$/i.test(image)) return 'illustration';
  if (data.imageKind === 'photo' || /^\/uploads\/articles\//i.test(image)) return 'photo';
  if (/^\/generated\/ai\//i.test(image)) return 'illustration';
  return 'other';
}

export function loadStory(slug, { allowPlaceholder = false } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('invalid article slug');
  const file = join(ARTICLES, slug + '.md');
  if (!existsSync(file)) throw new Error('no article ' + slug);
  if (!allowPlaceholder && placeholderSlugs().has(slug)) throw new Error('article ' + slug + ' has a placeholder body shared with another article');
  const parsed = parseArticle(readFileSync(file, 'utf8'));
  const data = parsed.data;
  if (data.status !== 'published') throw new Error('article ' + slug + ' is not published');
  const image = String(data.image || '').trim() || null;
  const info = imageInfo(data);
  return {
    slug,
    url: BRAND.siteUrl + '/article/' + slug,
    title: String(data.title || '').trim(),
    dek: String(data.dek || '').trim(),
    section: String(data.section || '').trim(),
    type: String(data.type || '').trim(),
    risk: String(data.risk || 'low').trim(),
    tags: Array.isArray(data.tags) ? data.tags : [],
    sourceUrls: Array.isArray(data.sourceUrls) ? data.sourceUrls : [],
    publishedAt: data.publishedAt || data.date || null,
    text: plainText(parsed.body),
    sentences: bodySentences(parsed.body),
    image,
    imagePath: info.path,
    imageKind: info.kind,
    mediaMode: info.kind
  };
}
