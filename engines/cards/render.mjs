// Nuvellum social card system: renders every format for a story and writes a manifest the social publisher
// can use. Deterministic (no clock, no network, fonts embedded); PNGs are optional (raster.mjs, Chromium).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';
import { storyMedia } from './media.mjs';
import { FORMATS, chooseVariant, renderCard, renderQuoteCard, pickQuote } from './templates.mjs';
export { wrap, textWidth } from './legacy-metrics.mjs';

export const SOCIAL_CARD_DIR = join(REPO_ROOT, 'engines', 'out', 'social-cards');
const rel = (p) => relative(REPO_ROOT, p).replaceAll('\\', '/');

/**
 * Render all cards for `story` into `outBase/<slug>/`.
 * options: { variant } to force a template (standard | breaking | analysis | culture); { quote: false } to skip
 * the quote / key-fact cards.
 * Returns the manifest (also written as manifest.json).
 */
export function renderSocialCards(story, outBase = SOCIAL_CARD_DIR, options = {}) {
  const dir = join(outBase, story.slug);
  mkdirSync(dir, { recursive: true });
  const media = storyMedia(story);
  const variant = options.variant || chooseVariant(story, media);
  const assets = [];
  for (const name of Object.keys(FORMATS)) {
    const { svg, meta } = renderCard(name, story, media, variant);
    const file = join(dir, `${name}.svg`);
    writeFileSync(file, svg);
    assets.push({ ...meta, path: rel(file), use: FORMATS[name].use, safeZone: safeZone(name) });
  }
  const q = options.quote === false ? null : pickQuote(story);
  if (q) {
    for (const name of ['square', 'portrait']) {
      const { svg, meta } = renderQuoteCard(name, story, q);
      const file = join(dir, `quote-${name}.svg`);
      writeFileSync(file, svg);
      assets.push({ ...meta, path: rel(file), use: 'feed: pull quote / key fact', safeZone: safeZone(name) });
    }
  }
  const byFormat = Object.fromEntries(assets.map((a) => [a.format, a.path]));
  const manifest = {
    version: 2,
    slug: story.slug,
    url: story.url,
    title: story.title,
    section: story.section,
    variant,
    // What the cards show: the story's own photo or approved illustration, or a text-led design. Never a stand-in.
    media: media ? { mode: media.mode, label: media.label, credit: media.credit || null, usedBy: assets.filter((a) => a.image).map((a) => a.format) } : { mode: 'text-led' },
    quote: q ? { kind: q.kind, text: q.text } : { skipped: options.quote === false ? 'disabled' : story.risk === 'sensitive' ? 'sensitive story: no stand-alone quote or fact card' : 'no self-contained quote or key fact in the article' },
    assets,
    clipped: assets.some((a) => a.headline?.clipped || a.quote?.clipped),
    // Compatibility with the v1 distribution drafts.
    sourceMode: media && variant !== 'analysis' ? media.mode : 'text-led',
    square: byFormat.square,
    portrait: byFormat.portrait,
    landscape: byFormat.landscape,
    story: byFormat.story,
    rasterNeededForLivePosting: true
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function safeZone(name) {
  const f = FORMATS[name];
  return { x: f.m, y: f.top + (name === 'story' ? 0 : f.m * 0.5), width: f.w - 2 * f.m, height: f.bottom - f.top - (name === 'story' ? 0 : f.m) };
}
