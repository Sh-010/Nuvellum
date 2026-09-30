import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('RSS footer links open the reader-friendly page instead of raw XML', () => {
  const footer = readFileSync('src/components/SiteFooter.astro', 'utf8');
  const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
  assert.match(footer, /href="\/rss">RSS<\/a>/);
  assert.match(home, /href="\/rss">RSS<\/a>/);
  assert.doesNotMatch(footer, /href="\/rss\.xml">RSS<\/a>/);
  assert.doesNotMatch(home, /href="\/rss\.xml">RSS<\/a>/);
});

test('the raw RSS feed remains machine-readable and gains a browser stylesheet', () => {
  const feed = readFileSync('src/pages/rss.xml.ts', 'utf8');
  const xsl = readFileSync('public/rss.xsl', 'utf8');
  assert.match(feed, /Content-Type':'application\/rss\+xml; charset=utf-8'/);
  assert.match(feed, /xml-stylesheet type="text\/xsl" href="\/rss\.xsl"/);
  assert.match(xsl, /<xsl:stylesheet/);
  assert.match(xsl, /select="rss\/channel\/item"/);
});

test('the human RSS page clearly exposes the canonical feed address', () => {
  const page = readFileSync('src/pages/rss.astro', 'utf8');
  assert.match(page, /href="\/rss\.xml"/);
  assert.match(page, /nuvellum\.news\/rss\.xml/);
  assert.match(page, /without an algorithm/i);
});
