// Text measurement and headline fitting for the social cards, using Newsreader advance widths measured in
// Chromium (newsreader-metrics.json, regenerate with measure-font.mjs). The cards embed the same font, so the
// estimate matches what the rasteriser draws; SAFETY leaves headroom for kerning and rounding.
import { readFileSync } from 'node:fs';

const METRICS = JSON.parse(readFileSync(new URL('./newsreader-metrics.json', import.meta.url), 'utf8')).faces;
export const SAFETY = 0.97;

/** Width in px of `text` at `size` px in face 'normal-400' | 'normal-600' | 'normal-700' | 'italic-400'. */
export function measure(text, size, face = 'normal-600', letterSpacing = 0) {
  const table = METRICS[face];
  let em = 0, n = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code >= 0x300 && code <= 0x36f) continue;
    em += table[code] ?? table.fallback;
    n++;
  }
  return em / 1000 * size + Math.max(0, n - 1) * letterSpacing;
}

const words = (text) => String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** Greedy wrap at `width`; returns lines, or null if a single word is wider than the line. */
export function greedy(text, width, size, face) {
  const limit = width * SAFETY;
  const lines = [];
  let line = '';
  for (const w of words(text)) {
    if (measure(w, size, face) > limit) return null;
    const next = line ? line + ' ' + w : w;
    if (line && measure(next, size, face) > limit) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Balanced wrap: the narrowest measure that still gives the greedy line count, so lines come out even
 * (no one-word last line) like CSS text-wrap: balance.
 */
export function balanced(text, width, size, face) {
  const base = greedy(text, width, size, face);
  if (!base || base.length < 2) return base;
  let lo = width * 0.5, hi = width, best = base;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const l = greedy(text, mid, size, face);
    if (l && l.length === base.length) { best = l; hi = mid; } else lo = mid;
  }
  return best;
}

/** Clip to `maxLines` with an ellipsis on the last line (last resort only). */
export function clipLines(text, width, size, face, maxLines) {
  const lines = greedy(text, width, size, face) || [String(text)];
  if (lines.length <= maxLines) return { lines, clipped: false };
  let last = lines.slice(maxLines - 1).join(' ');
  while (measure(last + '…', size, face) > width * SAFETY && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' ')).replace(/[\s,;:.–-]+$/, '');
  return { lines: [...lines.slice(0, maxLines - 1), last + '…'], clipped: true };
}

/**
 * Largest font size in [minSize, maxSize] (step 2) at which `text` fits `width` in at most `maxLines` lines
 * (and within `maxHeight` when given), with balanced breaks. Returns { size, lines, leading, fitted }.
 * fitted=false means even minSize needs more lines; the caller then tries its long-headline layout, and only
 * the last layout clips (clipped=true).
 */
export function fitText(text, { width, maxLines, maxSize, minSize, face = 'normal-600', leading = 1.08, maxHeight = Infinity, clip = false }) {
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = balanced(text, width, size, face);
    if (!lines) continue;
    const lh = Math.round(size * leading);
    if (lines.length <= maxLines && lines.length * lh <= maxHeight) return { size, lines, leading: lh, fitted: true, clipped: false };
  }
  const lh = Math.round(minSize * leading);
  const lines = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / lh)));
  if (!clip) return { size: minSize, lines: null, leading: lh, fitted: false, clipped: false };
  return { size: minSize, leading: lh, fitted: false, ...clipLines(text, width, minSize, face, lines) };
}
