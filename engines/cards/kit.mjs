// Nuvellum card kit: the site's palette and typeface (Newsreader, embedded so every machine renders the same
// card), the approved N✦ monogram and NUVELLUM✦ wordmark, and text helpers that record each line's box so
// tests and QA can prove nothing overflows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';
import { measure } from './fit.mjs';

// Site tokens (src/styles, homepage): ivory paper, near-black ink, burgundy/wine accents.
export const C = { paper: '#F8F4EC', paper2: '#FBF8F1', ink: '#17120F', burgundy: '#76132B', wine: '#661227', wine2: '#54101F', muted: '#6B6259', rule: '#D9D0C4', ghost: '#EFE7DA', onDark: '#F6EEE2', onDarkMuted: '#E2C5CC' };
export const SITE = 'nuvellum.news';
export const FAMILY = "NV, Newsreader, Georgia, 'Times New Roman', serif";

const LATIN_EXT = /[Ā-ʯḀ-ỿ₠-⃀]/;
let fontCache = {};
function fontFace(style, range) {
  const key = style + range;
  fontCache[key] ??= readFileSync(join(REPO_ROOT, 'public', 'fonts', `newsreader-${style}-${range}.woff2`)).toString('base64');
  return `@font-face{font-family:NV;font-style:${style};font-weight:300 700;src:url(data:font/woff2;base64,${fontCache[key]}) format('woff2')}`;
}
/** Embedded @font-face rules: only the styles and ranges the card's text needs. */
export function fontCss(allText, { italic }) {
  const ext = LATIN_EXT.test(allText);
  return [fontFace('normal', 'latin'), ext && fontFace('normal', 'latin-ext'), italic && fontFace('italic', 'latin'), italic && ext && fontFace('italic', 'latin-ext')].filter(Boolean).join('');
}

/** XML-escape and drop control characters. */
export function esc(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

const FACE = { 'normal-400': ['normal', 400], 'normal-600': ['normal', 600], 'normal-700': ['normal', 700], 'italic-400': ['italic', 400] };

/**
 * One line of text. data-box records the left/right limit the line was fitted to; data-w the measured width.
 * anchor 'start' | 'middle' | 'end'.
 */
export function text(str, { x, y, size, face = 'normal-600', fill = C.ink, anchor = 'start', ls = 0, min, max, caps = false, opacity }) {
  const s = caps ? String(str).toUpperCase() : String(str);
  const [style, weight] = FACE[face];
  const w = measure(s, size, face, ls);
  return `<text x="${r(x)}" y="${r(y)}" font-family="${FAMILY}" font-size="${size}" font-weight="${weight}"${style === 'italic' ? ' font-style="italic"' : ''} fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}${opacity ? ` opacity="${opacity}"` : ''} data-face="${face}" data-w="${r(w)}" data-box="${r(min ?? x)},${r(max ?? x)}">${esc(s)}</text>`;
}
/** A fitted block of lines (from fitText) at a baseline y. */
export function lines(fit, { x, y, face = 'normal-600', fill = C.ink, min, max, anchor = 'start' }) {
  return fit.lines.map((l, i) => text(l, { x, y: y + i * fit.leading, size: fit.size, face, fill, min, max, anchor })).join('');
}
const r = (n) => Math.round(n * 10) / 10;

/** Four-point star (the ✦ of the site's monogram and favicon), centred at cx, cy. */
export function star(cx, cy, rad, fill = C.burgundy) {
  const k = rad * 0.3;
  return `<path d="M${r(cx)} ${r(cy - rad)}L${r(cx + k)} ${r(cy - k)}L${r(cx + rad)} ${r(cy)}L${r(cx + k)} ${r(cy + k)}L${r(cx)} ${r(cy + rad)}L${r(cx - k)} ${r(cy + k)}L${r(cx - rad)} ${r(cy)}L${r(cx - k)} ${r(cy - k)}Z" fill="${fill}"/>`;
}

/** NUVELLUM✦ wordmark, as in the site footer. Returns { svg, width }. */
export function wordmark(x, y, size, { fill = C.ink, starFill = C.burgundy, anchor = 'start' } = {}) {
  const ls = size * 0.16;
  const w = measure('NUVELLUM', size, 'normal-600', ls);
  const x0 = anchor === 'end' ? x - w - size * 0.62 : x;
  return { width: w + size * 0.62, svg: text('NUVELLUM', { x: x0, y, size, face: 'normal-600', fill, ls, max: x0 + w }) + star(x0 + w + size * 0.36, y - size * 0.62, size * 0.24, starFill) };
}

/** The N✦ monogram (burgundy serif N, star at its shoulder). size = cap height scale in px. */
export function monogram(x, y, size, { fill = C.burgundy, opacity } = {}) {
  const w = measure('N', size, 'normal-600');
  return `<g${opacity ? ` opacity="${opacity}"` : ''}>${text('N', { x, y, size, face: 'normal-600', fill, max: x + w })}${star(x + w + size * 0.06, y - size * 0.66, size * 0.12, fill)}</g>`;
}

/** Small uppercase label (kicker). */
export function kicker(str, x, y, { size = 20, fill = C.burgundy, anchor = 'start', min, max } = {}) {
  return text(str, { x, y, size, face: 'normal-700', fill, ls: size * 0.16, caps: true, anchor, min: min ?? (anchor === 'end' ? x / 2 : x), max: max ?? x + 2000 });
}

/** A label on a solid chip (always readable on top of any picture). */
export function chip(str, x, y, { size = 16, bg = C.ink, fill = C.paper2, anchor = 'start' } = {}) {
  const s = String(str).toUpperCase(), ls = size * 0.14;
  // Chromium's real glyph widths can run a few pixels wider than the deterministic metrics.
  // Give chips generous horizontal padding so long photo credits never spill out of the chip
  // or trip the live overflow gate by a handful of pixels.
  const w = measure(s, size, 'normal-700', ls) + size * 2.0, h = size * 1.9;
  const x0 = anchor === 'end' ? x - w : x;
  return `<g><rect x="${r(x0)}" y="${r(y - h)}" width="${r(w)}" height="${r(h)}" fill="${bg}" opacity="0.92"/>${text(s, { x: x0 + size * 0.8, y: y - h * 0.32, size, face: 'normal-700', fill, ls, max: x0 + w - size * 0.8 })}</g>`;
}

/** The story's own image, cover-cropped into a box, with a hairline frame. */
export function picture(media, align, x, y, w, h, id) {
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.ghost}"/>` +
    `<g clip-path="url(#${id})"><image href="${media.uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${align}"/></g>` +
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${C.ink}" stroke-opacity="0.12"/>`;
}

export function svg(width, height, body, { fonts, bg = C.paper, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${title ? ` aria-label="${esc(title)}"` : ''}><style>${fonts}</style><rect width="${width}" height="${height}" fill="${bg}"/>${body}</svg>`;
}
