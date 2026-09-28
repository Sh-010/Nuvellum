export const PLATFORMS = {
  x: { label: 'X', maxChars: 280, linkInText: true, feed: true, video: true },
  threads: { label: 'Threads', maxChars: 500, linkInText: true, feed: true, video: false },
  facebook: { label: 'Facebook', maxChars: 1000, linkInText: true, feed: true, video: true },
  linkedin: { label: 'LinkedIn', maxChars: 1200, linkInText: true, feed: true, video: false },
  instagram: { label: 'Instagram', maxChars: 1800, linkInText: false, feed: true, video: true },
  tiktok: { label: 'TikTok', maxChars: 1200, linkInText: false, feed: false, video: true },
  youtube: { label: 'YouTube Shorts', titleMax: 100, maxChars: 5000, linkInText: true, feed: false, video: true }
};

export function charCount(value) {
  return [...String(value || '')].length;
}
