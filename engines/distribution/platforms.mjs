// Platform rules. Lengths follow each platform's published limits; the URL
// weight for X reflects t.co wrapping (every link counts as 23 characters).
export const PLATFORMS = {
  x:         { label: 'X',              kind: 'text',  maxChars: 280,  urlWeight: 23, linkInText: true },
  threads:   { label: 'Threads',        kind: 'text',  maxChars: 500,  linkInText: true },
  facebook:  { label: 'Facebook Page',  kind: 'link',  maxChars: 600,  linkInText: false },
  instagram: { label: 'Instagram',      kind: 'image', maxChars: 2200, linkInText: false },
  tiktok:    { label: 'TikTok',         kind: 'video', maxChars: 2200, linkInText: false },
  youtube:   { label: 'YouTube Shorts', kind: 'video', maxChars: 5000, titleMax: 100, linkInText: true }
};

/** Character count as the platform measures it. */
export function platformLength(platform, text) {
  const spec = PLATFORMS[platform];
  if (!spec?.urlWeight) return [...String(text)].length;
  return [...String(text).replace(/https?:\/\/\S+/g, 'x'.repeat(spec.urlWeight))].length;
}
