// Load a published Nuvellum article from the repository and normalize it into
// the payload every engine consumes. Engines only ever use published articles.
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

/** Markdown -> plain text paragraphs (headings kept as their own lines). */
export function plainText(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Sentences from Markdown body paragraphs; headings and list markers are excluded. */
export function bodySentences(markdown) {
  const paras = String(markdown).split(/\n\s*\n/).map(p => p.trim())
    .filter(p => p && !/^#{1,6}\s/.test(p));
  return paras.flatMap(p => sentences(plainText(p)));
}

export function sentences(text) {
  return String(text).replace(/\s+/g, ' ')
    .split(/(?<=[.!?]["”’]?)\s+(?=["“‘A-Z0-9])/)
    .map(s => s.trim()).filter(s => s.length > 20);
}

export function articleImage(slug, data) {
  const ai = join(REPO_ROOT, 'public', 'generated', 'ai', `${slug}.svg`);
  if (String(data.image || '').startsWith('/generated/ai/') && existsSync(ai)) return { path: ai, kind: 'ai-illustration' };
  const built = join(REPO_ROOT, '.build', 'public', 'generated', `${slug}.svg`);
  if (data.origin === 'automation' && existsSync(built)) return { path: built, kind: 'editorial-illustration' };
  const img = String(data.image || '');
  if (img.startsWith('/images/') && existsSync(join(REPO_ROOT, 'public', img))) return { path: join(REPO_ROOT, 'public', img), kind: 'section-illustration' };
  return { path: null, kind: 'none' };
}

/** Normalized story payload used by distribution and shorts. */
export function storyPayload(slug, markdown) {
  const { data, body } = parseArticle(markdown);
  if (data.status !== 'published') throw new Error(`article ${slug} is not published (status: ${data.status})`);
  const text = plainText(body);
  return {
    slug,
    url: `${BRAND.siteUrl}/article/${slug}`,
    title: data.title,
    dek: data.dek,
    section: data.section,
    type: data.type,
    date: data.date,
    risk: data.risk || 'low',
    tags: Array.isArray(data.tags) ? data.tags : [],
    sourceUrls: Array.isArray(data.sourceUrls) ? data.sourceUrls : [],
    text,
    sentences: bodySentences(body),
    image: articleImage(slug, data)
  };
}

const bodyKey = (md) => { try { return parseArticle(md).body.replace(/\s+/g, ' ').trim(); } catch { return ''; } };

/** Bodies shared by 2+ articles are launch placeholders, not reporting. */
export function placeholderSlugs() {
  const byBody = new Map();
  for (const f of readdirSync(ARTICLES).filter(f => f.endsWith('.md'))) {
    const k = bodyKey(readFileSync(join(ARTICLES, f), 'utf8'));
    byBody.set(k, [...(byBody.get(k) || []), f.slice(0, -3)]);
  }
  return new Set([...byBody.values()].filter(v => v.length > 1).flat());
}

export function loadStory(slug, { allowPlaceholder = false } = {}) {
  const file = join(ARTICLES, `${slug}.md`);
  if (!existsSync(file)) throw new Error(`no article ${slug}`);
  if (!allowPlaceholder && placeholderSlugs().has(slug)) throw new Error(`article ${slug} has a placeholder body shared with other articles; engines will not promote it`);
  return storyPayload(slug, readFileSync(file, 'utf8'));
}

export function listPublishedSlugs() {
  return readdirSync(ARTICLES).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
    .filter(slug => { try { loadStory(slug); return true; } catch { return false; } });
}
