// A story image has to depict the story. Section placeholders, house plates and procedural fallback
// art do not, so they count as "no image": the story is set text-led rather than dressed in generic art.
const GENERIC_IMAGE_RE = /^\/(?:images\/[a-z-]+\.svg$|uploads\/house\/|generated\/(?!ai\/)[^/]+\.svg$)/i;

export function storyImage(article) {
  const src = String(article?.image ?? '').trim();
  // Avoid archive photography depicting a different event; let the article be text-led.
  const unrelatedArchive = /not of the events? reported/i.test(String(article?.imageCaption || ''));
  // Never depict a real sensitive event with a machine-generated scene.
  const sensitiveAi = article?.risk === 'sensitive' && /^\/generated\/ai\//i.test(src);
  return src && !GENERIC_IMAGE_RE.test(src) && !unrelatedArchive && !sensitiveAi ? src : '';
}

export const hasStoryImage = (article) => storyImage(article) !== '';
