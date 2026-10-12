// Estimate the text the reader sees, excluding frontmatter, URLs and markup.
export function readingTime(markdown, wordsPerMinute = 225) {
  const text = String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_`>]/g, '');
  // Count tokens outside markup; this is measurement, not HTML sanitization.
  const words = [...text.matchAll(/<[^>]*>|[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)]
    .filter(token => !token[0].startsWith('<'));
  return `${Math.max(1, Math.ceil(words.length / wordsPerMinute))} min`;
}
