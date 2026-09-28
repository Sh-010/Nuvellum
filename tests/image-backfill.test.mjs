// Guards for the article image backfill (scripts/backfill-article-images.mjs): credits stay truthful,
// licences stay open, and no published article silently falls back to placeholder art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../scripts/lib/editorial.mjs';
import { classify } from '../scripts/backfill-article-images.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const credits = JSON.parse(readFileSync(join(root, 'src', 'data', 'image-credits.json'), 'utf8'));
const plan = JSON.parse(readFileSync(join(root, 'src', 'data', 'image-plan.json'), 'utf8'));
const articles = readdirSync(join(root, 'src', 'content', 'articles')).filter(f => f.endsWith('.md')).map(f => ({
  slug: f.replace(/\.md$/, ''),
  data: parseFrontmatter(readFileSync(join(root, 'src', 'content', 'articles', f), 'utf8')) || {}
})).filter(a => a.data.status === 'published');

test('every credited image exists, is the article image and is openly licensed', () => {
  for (const [slug, c] of Object.entries(credits)) {
    const article = articles.find(a => a.slug === slug);
    assert.ok(article, `${slug}: credit for an unknown or unpublished article`);
    assert.equal(article.data.image, c.path, `${slug}: frontmatter image differs from the credited file`);
    assert.ok(existsSync(join(root, 'public', c.path)), `${slug}: ${c.path} is missing`);
    if (c.kind === 'photo') {
      assert.match(c.license, /^(CC0|Public domain|CC BY(-SA)? \d(\.\d)?)$/i, `${slug}: licence "${c.license}"`);
      assert.doesNotMatch(c.license, /\b(NC|ND)\b/, `${slug}: non-commercial or no-derivatives licence`);
      assert.ok(c.author && c.descriptionUrl?.startsWith('https://commons.wikimedia.org/'), `${slug}: author or source page missing`);
      if (!/public domain|cc0/i.test(c.license)) assert.ok(c.licenseUrl, `${slug}: licence URL missing`);
    }
  }
});

// Gated newsroom AI illustrations are allowed (n8n style gate); only generic art needs a plan. Counting ai-svg
// here failed the build of every newly published illustrated story (PRs #101, #102).
test('no published article shows placeholder or procedural art without a plan', () => {
  const weak = articles.filter(a => ['section-placeholder', 'procedural'].includes(classify(a.data)) && !plan[a.slug]);
  assert.deepEqual(weak.map(a => a.slug), []);
});

test('classify recognises each image path family', () => {
  assert.equal(classify({ image: '/uploads/articles/x.jpg' }), 'real');
  assert.equal(classify({ image: '/uploads/articles/x.svg' }), 'illustration');
  assert.equal(classify({ image: '/generated/ai/x.svg' }), 'ai-svg');
  assert.equal(classify({ origin: 'automation' }), 'text-led');
  assert.equal(classify({ image: '/images/world.svg', origin: 'automation' }), 'procedural');
  assert.equal(classify({ image: '/images/world.svg' }), 'section-placeholder');
});
