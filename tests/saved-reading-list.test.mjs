import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SAVED_KEY, parseSaved, withoutSaved, savedRow, savedPath } from '../src/lib/saved-list.js';

const shell = readFileSync('src/components/InteriorShell.astro', 'utf8');
const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
const page = readFileSync('src/pages/saved.astro', 'utf8');
const article = readFileSync('src/pages/article/[slug].astro', 'utf8');
const bookmarkTag = (src) => src.match(/<[a-z]+[^>]*id="savedOpen"[^>]*>/)?.[0] || '';

test('the masthead bookmark is a real link to /saved on the homepage and interior pages, never /latest', () => {
  for (const [name, src] of [['InteriorShell', shell], ['homepage', home]]) {
    const tag = bookmarkTag(src);
    assert.match(tag, /^<a /, `${name}: a link, so it works without JavaScript and opens in a new tab`);
    assert.match(tag, /href="\/saved"/, name);
    assert.doesNotMatch(tag, /\/latest/, name);
    assert.doesNotMatch(src, /savedOpen[^;]{0,80}location\.href\s*=\s*['"]\/latest/, `${name}: no script redirect to /latest`);
  }
});

test('/saved is a private page: noindex, not in the sitemap, reads the one existing key', () => {
  assert.match(page, /noindex=\{true\}/);
  assert.doesNotMatch(readFileSync('src/pages/sitemap.xml.ts', 'utf8'), /['"]\/saved['"]/);
  assert.equal(SAVED_KEY, 'nuvellum-saved-v2');
  assert.match(page, /from '\.\.\/lib\/saved-list\.js'/);
  assert.match(article, /const key='nuvellum-saved-v2'/, 'article pages write the same key');
  assert.match(home, /const savedKey='nuvellum-saved-v2'/, 'homepage cards write the same key');
});

test('both writers put the newest save first, so /saved can say "newest first"', () => {
  assert.match(article, /\[\{title,cat,url:location\.pathname\},\.\.\.l\]/);
  assert.match(home, /list\.unshift\(\{title,url\}\)/);
});

test('reads legacy {title,url} and current {title,cat,url} entries alike', () => {
  const raw = JSON.stringify([
    { title: 'Nasa awards orbital safety analysis support services contract', url: '/article/nasa-awards-orbital-safety-analysis-support-services-contract' },
    { title: 'Trump says AI companies sign voluntary accord on safety controls', cat: 'Technology · News', url: '/article/trump-says-ai-companies-sign-voluntary-accord-on-safety-controls' },
    { title: 'A story from an older build', cat: 'World · Analysis', url: 'https://nuvellum.vercel.app/article/older-story/' },
    null, 7, { url: '/article/untitled' }, { title: '   ' },
    { title: 'Trump says AI companies sign voluntary accord on safety controls', url: '/article/trump-says-ai-companies-sign-voluntary-accord-on-safety-controls' }
  ]);
  const saved = parseSaved(raw);
  assert.deepEqual(saved.map((x) => x.title), [
    'Nasa awards orbital safety analysis support services contract',
    'Trump says AI companies sign voluntary accord on safety controls',
    'A story from an older build'
  ], 'untitled/garbage entries dropped, a double save shown once, order kept');

  const index = new Map([['trump-says-ai-companies-sign-voluntary-accord-on-safety-controls', { slug: 'trump-says-ai-companies-sign-voluntary-accord-on-safety-controls', title: 'Trump says AI companies sign voluntary accord on safety controls', section: 'Technology', type: 'News', readingTime: '2 min', dek: 'Leaders of major AI companies…' }]]);
  const legacy = savedRow(saved[0], index);
  assert.equal(legacy.href, '/article/nasa-awards-orbital-safety-analysis-support-services-contract');
  assert.equal(legacy.section, '', 'no cat and not in the index: no invented metadata');
  const current = savedRow(saved[1], index);
  assert.deepEqual([current.section, current.type, current.readingTime, current.dek], ['Technology', 'News', '2 min', 'Leaders of major AI companies…']);
  const older = savedRow(saved[2], new Map());
  assert.deepEqual([older.href, older.section, older.type], ['/article/older-story', 'World', 'Analysis'], 'absolute URL → site path; cat → section · format');
});

test('broken storage is an empty list, and foreign or malformed URLs never become links', () => {
  for (const raw of [null, '', 'not json', '{"title":"x"}', '42']) assert.deepEqual(parseSaved(raw), []);
  assert.equal(savedPath('javascript:alert(1)'), '');
  assert.equal(savedPath('https://example.com/elsewhere'), '');
  assert.equal(savedPath('/latest'), '');
  assert.equal(savedPath('/article/a-story?utm=x#top'), '/article/a-story');
  assert.equal(savedRow({ title: 'Odd', url: 'javascript:alert(1)' }).href, '');
});

test('remove takes out exactly one story and leaves every other entry as written; clear leaves nothing', () => {
  const entries = [{ title: 'One', url: '/article/one' }, { title: 'Two', cat: 'World · News', url: '/article/two' }, { title: 'Three', url: '/article/three', extra: 1 }];
  const next = withoutSaved(JSON.stringify(entries), 'Two');
  assert.deepEqual(next, [entries[0], entries[2]]);
  assert.deepEqual(withoutSaved(JSON.stringify(entries), 'Not saved'), entries);
  assert.deepEqual(withoutSaved('garbage', 'One'), []);
});

test('built output (when present): /saved exists, is noindex, and every masthead bookmark points at it', { skip: !existsSync('dist/saved') && 'run npm run build first' }, () => {
  const saved = readFileSync('dist/saved/index.html', 'utf8');
  assert.match(saved, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(readFileSync('dist/sitemap.xml', 'utf8'), /\/saved<\/loc>/);
  for (const f of ['dist/index.html', 'dist/latest/index.html', 'dist/saved/index.html']) {
    assert.match(bookmarkTag(readFileSync(f, 'utf8')), /href="\/saved"/, f);
  }
});
