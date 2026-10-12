// Estimate the text the reader sees, excluding frontmatter, URLs and markup.
export function readingTime(markdown, wordsPerMinute = 225) {
  const text = String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_`>]/g, '');
  const words = text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
  return `${Math.max(1, Math.ceil(words.length / wordsPerMinute))} min`;
}
