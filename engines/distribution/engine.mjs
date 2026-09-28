import { PLATFORMS } from './platforms.mjs';
import { generateCopy } from './copy.mjs';

export function buildDistributionDraft(story, opts = {}) {
  const platforms = opts.platforms || Object.keys(PLATFORMS);
  const result = generateCopy(story, platforms);
  const drafts = {};
  for (const platform of platforms) {
    if (!result.copy[platform]) continue;
    drafts[platform] = {
      platform,
      label: PLATFORMS[platform].label,
      text: result.copy[platform],
      status: 'draft',
      media: story.mediaMode === 'text-led'
        ? { mode: 'text-card-needed', source: null }
        : { mode: story.mediaMode, source: story.image }
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
