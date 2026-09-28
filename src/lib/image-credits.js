// Credits and crop focus for article images upgraded by scripts/backfill-article-images.mjs.
// The data file is written by that script; entries exist only for backfilled images.
import credits from '../data/image-credits.json' with { type: 'json' };

export const IMAGE_CREDITS = credits;

/** Credit entry for an article's current image, or null (AI art, or a text-led story with no image). */
export function imageCredit(slug, image) {
  const c = credits[slug];
  return c && image && c.path === image ? c : null;
}

/** CSS object-position for the image's focal point, when one was recorded. */
export function imageFocus(slug, image) {
  const c = imageCredit(slug, image);
  return c?.focus ? `object-position:${c.focus}` : undefined;
}

/** Plain-text attribution, e.g. "Photo: Jane Doe / Wikimedia Commons, CC BY-SA 4.0". */
export function creditText(c) {
  if (!c) return '';
  if (c.kind !== 'photo') return c.source === 'Nuvellum' ? 'Illustration: Nuvellum' : '';
  const licence = /public domain|^pd/i.test(c.license) ? 'public domain' : c.license;
  return `Photo: ${c.author} / ${c.source}, ${licence}`;
}
