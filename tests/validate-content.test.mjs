import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

// Runs the real validator against an isolated temporary content tree.
function runValidator({ articles = {}, aiSvgs = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'nuvellum-validate-'));
  try {
    cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'src', 'content', 'articles'), { recursive: true });
    mkdirSync(join(dir, 'public', 'generated', 'ai'), { recursive: true });
    for (const [slug, text] of Object.entries(articles)) writeFileSync(join(dir, 'src', 'content', 'articles', `${slug}.md`), text);
    for (const [file, text] of Object.entries(aiSvgs)) writeFileSync(join(dir, 'public', 'generated', 'ai', file), text);
    const r = spawnSync(process.execPath, [join(dir, 'scripts', 'validate-content.mjs')], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function article(slug, fields = {}) {
  const base = {
    title: `Story ${slug}`,
    dek: 'A sufficiently descriptive standfirst for the test article.',
    section: 'World',
    type: 'News',
    author: 'Nuvellum Global Desk',
    date: '2026-09-26',
    readingTime: '3 min',
    image: `/generated/ai/${slug}.svg`,
    imageAlt: 'Editorial illustration',
    status: 'published',
    tags: ['test'],
    sourceUrls: [`https://example.com/${slug}`],
    origin: 'automation',
    risk: 'low',
    reviewedBy: '',
    ...fields
  };
  const fm = Object.entries(base)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? JSON.stringify(v) : JSON.stringify(String(v))}`)
    .join('\n');
  return `---\n${fm}\n---\n\nBody paragraph for ${slug}.\n`;
}

const goodSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

test('allows an article using its own /generated/ai/<slug>.svg', () => {
  const r = runValidator({ articles: { 'a-story': article('a-story') }, aiSvgs: { 'a-story.svg': goodSvg } });
  assert.equal(r.code, 0, r.out);
});

test('rejects a missing AI image file', () => {
  const r = runValidator({ articles: { 'a-story': article('a-story') } });
  assert.equal(r.code, 1);
  assert.match(r.out, /is missing/);
});

test("rejects pointing at another article's AI image", () => {
  const r = runValidator({ articles: { 'a-story': article('a-story', { image: '/generated/ai/other.svg' }) }, aiSvgs: { 'other.svg': goodSvg } });
  assert.equal(r.code, 1);
  assert.match(r.out, /must belong to this article/);
});

test('rejects other /generated/ paths and traversal', () => {
  for (const image of ['/generated/a-story.svg', '/generated/ai/../x.svg', '/generated/ai/a-story.png']) {
    const r = runValidator({ articles: { 'a-story': article('a-story', { image }) }, aiSvgs: { 'a-story.svg': goodSvg } });
    assert.equal(r.code, 1, image);
  }
});

test('rejects an unsafe AI SVG even if no article references it', () => {
  const r = runValidator({
    articles: { 'a-story': article('a-story', { image: '/images/world.svg' }) },
    aiSvgs: { 'evil.svg': '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' }
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /event handler/);
});

test('rejects non-svg files in the AI art folder', () => {
  const r = runValidator({ articles: { 'a-story': article('a-story', { image: '/images/world.svg' }) }, aiSvgs: { 'x.html': '<p>x</p>' } });
  assert.equal(r.code, 1);
});

test('policy: sensitive story with pipeline reviewer but no explicit clearance fails validation', () => {
  const r = runValidator({
    articles: { 'a-story': article('a-story', { risk: 'sensitive', reviewedBy: 'Nuvellum Verification Pipeline' }) },
    aiSvgs: { 'a-story.svg': goodSvg }
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /requires verification/);
});

test('policy: explicitly cleared sensitive story passes validation', () => {
  const r = runValidator({
    articles: { 'a-story': article('a-story', { risk: 'sensitive', reviewedBy: 'Nuvellum Verification Pipeline', verification: 'cleared', editorialReview: 'passed' }) },
    aiSvgs: { 'a-story.svg': goodSvg }
  });
  assert.equal(r.code, 0, r.out);
});

test('policy: a published story whose verification failed is rejected', () => {
  const r = runValidator({
    articles: { 'a-story': article('a-story', { risk: 'sensitive', reviewedBy: 'X', verification: 'failed' }) },
    aiSvgs: { 'a-story.svg': goodSvg }
  });
  assert.equal(r.code, 1);
});
