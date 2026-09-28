// A story image has to depict the story. Section placeholders, house plates and procedural fallback
// art do not, so they count as "no image": the story is set text-led rather than dressed in generic art.
const GENERIC_IMAGE_RE = /^\/(?:images\/[a-z-]+\.svg$|uploads\/house\/|generated\/(?!ai\/)[^/]+\.svg$)/i;

export function storyImage(article) {
  const src = String(article?.image ?? '').trim();
  return src && !GENERIC_IMAGE_RE.test(src) ? src : '';
}

export const hasStoryImage = (article) => storyImage(article) !== '';
