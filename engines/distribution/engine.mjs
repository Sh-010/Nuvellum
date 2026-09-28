import { PLATFORMS } from './platforms.mjs';
import { generateCopy } from './copy.mjs';

function mediaFor(platform, story) {
  const spec = PLATFORMS[platform];
  if (spec.media === 'video') return { mode: 'video-needed', source: null };
  if (story.mediaMode === 'text-led') return { mode: 'text-card-needed', source: null };
  return { mode: story.mediaMode, source: story.image };
}

export function buildDistributionDraft(story, opts = {}) {
  const platforms = opts.platforms || Object.keys(PLATFORMS);
  const result = generateCopy(story, platforms);
  const drafts = {};
  for (const platform of platforms) {
    if (!result.copy[platform]) continue;
    const value = result.copy[platform];
    drafts[platform] = {
      platform,
      label: PLATFORMS[platform].label,
      status: 'draft',
      media: mediaFor(platform, story),
      ...(platform === 'youtube'
        ? { title: value.title, description: value.description }
        : { text: value })
    };
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    slug: story.slug,
    articleUrl: story.url,
    section: story.section,
    risk: story.risk,
    mediaMode: story.mediaMode,
    mode: 'dry-run',
    notes: result.notes,
    drafts
  };
}
