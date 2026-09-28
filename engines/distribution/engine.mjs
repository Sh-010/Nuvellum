import { PLATFORMS } from './platforms.mjs';
import { generateFeedCopy, generateVideoCopy } from './copy.mjs';

function feedMedia(platform, story) {
  const variant = platform === 'instagram' ? 'portrait' : 'square';
  return {
    mode: 'social-card',
    variant,
    path: `engines/out/social-cards/${story.slug}/${variant}.svg`,
    sourceMode: story.mediaMode
  };
}

function draftValue(platform, value, media) {
  if (platform === 'youtube') return {
    platform, label: PLATFORMS[platform].label, status: 'draft',
    title: value.title, description: value.description, media
  };
  return { platform, label: PLATFORMS[platform].label, status: 'draft', text: value, media };
}

export function buildDistributionDraft(story, opts = {}) {
  const requested = opts.platforms || Object.keys(PLATFORMS);
  const feedPlatforms = requested.filter(p => PLATFORMS[p]?.feed);
  const videoPlatforms = requested.filter(p => PLATFORMS[p]?.video);
  const feed = generateFeedCopy(story, feedPlatforms);
  const video = generateVideoCopy(story, videoPlatforms);
  const tracks = { feed: {}, video: {} };

  for (const platform of feedPlatforms) {
    if (!feed.copy[platform]) continue;
    tracks.feed[platform] = draftValue(platform, feed.copy[platform], feedMedia(platform, story));
  }
  for (const platform of videoPlatforms) {
    if (!video.copy[platform]) continue;
    tracks.video[platform] = draftValue(platform, video.copy[platform], { mode: 'video-needed', source: null });
  }

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    slug: story.slug,
    articleUrl: story.url,
    section: story.section,
    risk: story.risk,
    mediaMode: story.mediaMode,
    mode: 'dry-run',
    notes: [...feed.notes.map(n => 'feed/' + n), ...video.notes.map(n => 'video/' + n)],
    tracks
  };
}
