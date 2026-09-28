export const PLATFORMS = {
  x: { label: 'X', maxChars: 280, linkInText: true },
  threads: { label: 'Threads', maxChars: 500, linkInText: true },
  facebook: { label: 'Facebook', maxChars: 1000, linkInText: true },
  linkedin: { label: 'LinkedIn', maxChars: 1200, linkInText: true },
  instagram: { label: 'Instagram', maxChars: 1800, linkInText: false }
};

export function charCount(value) {
  return [...String(value || '')].length;
}
