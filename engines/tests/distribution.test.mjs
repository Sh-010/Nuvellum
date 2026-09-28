import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStory } from '../shared/article.mjs';
import { templateCopy, trackedUrl, validateCopy } from '../distribution/copy.mjs';
import { buildDistributionDraft } from '../distribution/engine.mjs';

const slug = 'pokemon-tcg-s-next-big-set-available-weeks-before-official-release';
const story = loadStory(slug);

test('published article loads into a safe distribution payload', () => {
  assert.equal(story.slug, slug);
  assert.equal(story.mediaMode, 'text-led');
  assert.ok(story.title.includes('Pokémon'));
  assert.ok(story.url.endsWith('/article/' + slug));
});

test('platform templates are within limits and contain tracked links where required', () => {
  const copy = templateCopy(story);
  for (const [platform, text] of Object.entries(copy)) assert.deepEqual(validateCopy(platform, text, story), [], platform + ': ' + text);
  assert.match(copy.x, /utm_source=x/);
  assert.match(copy.linkedin, /utm_source=linkedin/);
  assert.ok(!copy.instagram.includes('utm_source=instagram'));
  assert.ok(!copy.tiktok.includes('utm_source=tiktok'));
  assert.match(copy.youtube.description, /utm_source=youtube/);
});

test('tracking links identify platform, social medium and article slug', () => {
  const u = new URL(trackedUrl(story, 'threads'));
  assert.equal(u.searchParams.get('utm_source'), 'threads');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('utm_campaign'), 'article');
  assert.equal(u.searchParams.get('utm_content'), slug);
});

test('text-led stories request a designed social card instead of fake story art', () => {
  const r = buildDistributionDraft(story);
  assert.equal(r.drafts.x.media.mode, 'text-card-needed');
  assert.equal(r.drafts.instagram.media.mode, 'text-card-needed');
  assert.equal(r.drafts.tiktok.media.mode, 'video-needed');
  assert.equal(r.drafts.youtube.media.mode, 'video-needed');
  assert.ok(r.drafts.youtube.title.length <= 100);
  assert.equal(r.mode, 'dry-run');
});
