// Social card assets for the publisher: render the story's cards with the card system (engines/cards), rasterise
// every card to PNG in Chromium and refuse the set if any text line leaves its box. Output is ephemeral
// (engines/out/social-cards/<slug>/, gitignored; an Actions workspace is discarded after the run).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';
import { renderSocialCards, SOCIAL_CARD_DIR } from '../cards/render.mjs';

/** Which card each platform uses (the contract for current and future adapters). */
export const ASSET_FOR = {
  telegram: 'square',
  facebook: 'landscape',
  linkedin: 'landscape',
  x: 'landscape',
  threads: 'square',
  instagram: 'portrait',
  tiktok: 'story',
  youtube: 'story'
};
export const IMAGE_PLATFORMS = new Set(Object.keys(ASSET_FOR));

/**
 * Render and verify the story's cards.
 * @returns {Promise<{ ok: true, manifest, png: Record<string,string>, forPlatform: Record<string,string> } | { ok: false, error: string }>}
 */
export async function prepareCardAssets(story, { outDir = SOCIAL_CARD_DIR, rasterise, render = renderSocialCards } = {}) {
  let manifest;
  try {
    // Quote / key-fact cards follow the card system's own rules (never for sensitive stories).
    manifest = render(story, outDir);
  } catch (e) {
    return { ok: false, error: `cards: render failed (${e.name || 'Error'}: ${String(e.message).slice(0, 120)})` };
  }
  if (manifest.clipped) return { ok: false, error: 'cards: a headline had to be clipped; not posting a truncated card' };
  const files = manifest.assets.map((a) => join(REPO_ROOT, a.path));
  let res;
  try {
    rasterise ??= (await import('../cards/raster.mjs')).rasterise;
    res = await rasterise(files, { png: true });
  } catch (e) {
    return { ok: false, error: `cards: rasterisation failed (${e.name || 'Error'}: ${String(e.message).split('\n')[0].slice(0, 120)})` };
  }
  const bad = res.filter((r) => r.overflow?.length);
  if (bad.length) return { ok: false, error: `cards: ${bad.length} card(s) failed the overflow check (${bad[0].overflow[0].slice(0, 100)})` };
  const png = {};
  for (const a of manifest.assets) {
    const file = join(REPO_ROOT, a.path.replace(/\.svg$/, '.png'));
    if (!existsSync(file)) return { ok: false, error: `cards: ${a.format}.png was not written` };
    png[a.format] = file;
  }
  const forPlatform = Object.fromEntries(Object.entries(ASSET_FOR).map(([p, f]) => [p, png[f]]).filter(([, f]) => f));
  return { ok: true, manifest, png, forPlatform };
}
