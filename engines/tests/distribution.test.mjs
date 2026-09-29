import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStory } from '../shared/article.mjs';
import { templateFeedCopy, templateVideoCopy, trackedUrl, validateCopy } from '../distribution/copy.mjs';
import { buildDistributionDraft } from '../distribution/engine.mjs';

const slug = 'pokemon-tcg-s-next-big-set-available-weeks-before-official-release';
const story = loadStory(slug);

test('published article loads into a safe distribution payload', () => {
  assert.equal(story.slug, slug);
  assert.equal(story.mediaMode, 'text-led');
  assert.ok(story.title.includes('Pokémon'));
  assert.ok(story.url.endsWith('/article/' + slug));
});

test('feed templates are platform-specific, valid and tracked where links are supported', () => {
  const copy = templateFeedCopy(story);
  for (const [platform, value] of Object.entries(copy)) assert.deepEqual(validateCopy(platform, value, story), [], platform);
  assert.match(copy.x, /utm_source=x/);
  assert.match(copy.linkedin, /utm_source=linkedin/);
  assert.ok(!copy.instagram.includes('utm_source=instagram'));
});

test('video templates cover X, Facebook, Instagram, TikTok and YouTube Shorts', () => {
  const copy = templateVideoCopy(story);
  for (const [platform, value] of Object.entries(copy)) assert.deepEqual(validateCopy(platform, value, story), [], platform);
  assert.deepEqual(Object.keys(copy), ['x','facebook','instagram','tiktok','youtube']);
  assert.match(copy.x, /utm_source=x/);
  assert.match(copy.facebook, /utm_source=facebook/);
  assert.match(copy.youtube.description, /utm_source=youtube/);
  assert.ok(!copy.instagram.includes('utm_source=instagram'));
  assert.ok(!copy.tiktok.includes('utm_source=tiktok'));
});

test('tracking links identify platform, social medium and article slug', () => {
  const u = new URL(trackedUrl(story, 'threads'));
  assert.equal(u.searchParams.get('utm_source'), 'threads');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('utm_campaign'), 'article');
  assert.equal(u.searchParams.get('utm_content'), slug);
});

test('text-led story gets feed cards and parallel short-video requirements', () => {
  const r = buildDistributionDraft(story);
  assert.equal(r.version, 3);
  assert.equal(r.tracks.feed.x.media.mode, 'social-card');
  assert.equal(r.tracks.feed.x.media.variant, 'square');
  assert.equal(r.tracks.feed.instagram.media.mode, 'social-card');
  assert.equal(r.tracks.feed.instagram.media.variant, 'portrait');
  assert.equal(r.tracks.video.x.media.mode, 'video-needed');
  assert.equal(r.tracks.video.facebook.media.mode, 'video-needed');
  assert.equal(r.tracks.video.instagram.media.mode, 'video-needed');
  assert.equal(r.tracks.video.tiktok.media.mode, 'video-needed');
  assert.equal(r.tracks.video.youtube.media.mode, 'video-needed');
  assert.ok(r.tracks.video.youtube.title.length <= 100);
  assert.equal(r.mode, 'dry-run');
});

// Regressions from the pre-connection QA pass (main @ 58adf50): 14/33 stories had no X draft, 6 had no Threads
// draft (the tracked link was truncated away), and every draft ran the headline into the dek.
import { readdirSync } from 'node:fs';
import { generateFeedCopy, generateVideoCopy, platformLength } from '../distribution/copy.mjs';

test('X counts links as 23 characters (t.co)', () => {
  assert.equal(platformLength('x', 'Hi https://nuvellum.vercel.app/article/' + 'a'.repeat(200) + '?utm_source=x'), 3 + 23);
  assert.equal(platformLength('threads', 'Hi https://x.y/z'), 16);
});

test('every distributable story gets every feed and video draft, link intact, headline and dek as separate paragraphs', () => {
  const long = loadStory('diablo-cody-reteaming-with-nathan-kahane-and-mason-novick-on-next-film-always-roxanne');
  const feed = generateFeedCopy(long);
  assert.deepEqual(feed.notes, []);
  assert.ok(feed.copy.x.startsWith(long.title + '\n\n' + long.dek.slice(0, 40)), feed.copy.x);
  assert.ok(feed.copy.threads.endsWith(trackedUrl(long, 'threads')));
  let stories = 0;
  for (const f of readdirSync(new URL('../../src/content/articles/', import.meta.url))) {
    let s; try { s = loadStory(f.replace(/\.md$/, '')); } catch { continue; }
    stories++;
    const fc = generateFeedCopy(s), vc = generateVideoCopy(s);
    assert.deepEqual([...fc.notes, ...vc.notes], [], s.slug);
    for (const [p, v] of Object.entries(fc.copy)) if (s.dek) assert.ok(v.startsWith(s.title + '\n\n'), `${p}: ${s.slug}`);
  }
  assert.ok(stories >= 30, 'fixture corpus unexpectedly small');
});
