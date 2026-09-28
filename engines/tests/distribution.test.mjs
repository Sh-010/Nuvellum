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
  assert.equal(r.version, 2);
  assert.equal(r.tracks.feed.x.media.mode, 'text-card-needed');
  assert.equal(r.tracks.feed.instagram.media.mode, 'text-card-needed');
  assert.equal(r.tracks.video.x.media.mode, 'video-needed');
  assert.equal(r.tracks.video.facebook.media.mode, 'video-needed');
  assert.equal(r.tracks.video.instagram.media.mode, 'video-needed');
  assert.equal(r.tracks.video.tiktok.media.mode, 'video-needed');
  assert.equal(r.tracks.video.youtube.media.mode, 'video-needed');
  assert.ok(r.tracks.video.youtube.title.length <= 100);
  assert.equal(r.mode, 'dry-run');
});
