export const PLATFORMS = {
  x: { label: 'X', maxChars: 280, linkInText: true, media: 'optional' },
  threads: { label: 'Threads', maxChars: 500, linkInText: true, media: 'optional' },
  facebook: { label: 'Facebook', maxChars: 1000, linkInText: true, media: 'optional' },
  linkedin: { label: 'LinkedIn', maxChars: 1200, linkInText: true, media: 'optional' },
  instagram: { label: 'Instagram', maxChars: 1800, linkInText: false, media: 'image' },
  tiktok: { label: 'TikTok', maxChars: 1200, linkInText: false, media: 'video' },
  youtube: { label: 'YouTube Shorts', titleMax: 100, maxChars: 5000, linkInText: true, media: 'video' }
};

export function charCount(value) {
  return [...String(value || '')].length;
}
