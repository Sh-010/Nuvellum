import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';

const COLORS = { paper:'#FAF7F2', ink:'#0F0F0F', wine:'#681F2D', stone:'#8D8A84', line:'#D8D0C4', soft:'#EFE8DE' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[ch]));
}

// Georgia advance widths (per 1000 em) for ASCII 32–126, measured in Chrome. Lines are broken by estimated
// rendered width, not character count: char-count wrapping ran bold headlines past the card edge.
const ADVANCE = {
  bold: [254,376,510,703,641,879,799,269,447,447,482,703,328,379,328,472,701,490,626,625,649,599,648,554,676,648,367,367,703,703,703,548,967,758,757,715,834,721,671,807,913,446,595,817,686,1023,839,820,701,820,797,649,684,833,762,1126,809,732,689,447,472,447,703,703,500,596,646,531,663,572,393,577,680,354,346,632,344,1016,690,636,658,648,520,513,397,677,567,863,588,562,525,500,388,500,703],
  italic: [241,331,412,643,610,817,710,215,375,375,472,643,270,374,270,469,614,430,559,552,565,528,566,497,596,566,384,384,643,643,643,479,929,671,654,642,749,653,599,725,815,390,518,694,604,927,767,730,610,730,702,561,619,756,667,976,710,615,602,375,469,375,643,643,500,573,554,454,575,472,329,573,563,297,291,528,285,879,590,537,578,555,461,431,347,575,538,822,501,560,444,430,375,430,643]
};
// Headroom for fallback serifs (e.g. DejaVu Serif where Georgia is not installed) and rasteriser differences.
const FIT = 0.94;

export function textWidth(text, size, face = 'bold') {
  const table = ADVANCE[face];
  let em = 0;
  for (const ch of String(text).normalize('NFD')) {
    const code = ch.codePointAt(0);
    if (code >= 0x300 && code <= 0x36f) continue; // combining accent: no advance of its own
    em += code >= 32 && code <= 126 ? table[code - 32] : ch === '‘' || ch === '’' ? table[39 - 32] : ch === '“' || ch === '”' ? table[34 - 32] : ch === '…' ? 1000 : 600;
  }
  return em / 1000 * size;
}

// Greedy word wrap to maxWidth. When the text does not fit in maxLines, the last line is filled with as many
// words as fit alongside an ellipsis (it used to keep a single word).
export function wrap(text, maxWidth, size, maxLines, face = 'bold') {
  const limit = maxWidth * FIT;
  const fits = s => textWidth(s, size, face) <= limit;
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && fits(line + ' ' + words[i])) line += ' ' + words[i++];
    lines.push(line);
  }
  if (i < words.length && lines.length) {
    let last = lines[lines.length - 1].replace(/[\s,;:.…-]+$/, '');
    while (!fits(last + '…') && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' ')).replace(/[\s,;:.-]+$/, '');
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}

function textLines(lines, x, y, size, leading, attrs='') {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * leading}" ${attrs} font-size="${size}">${esc(line)}</text>`).join('\n');
}

function imageDataUri(story) {
  const src = String(story.image || '').trim();
  if (!src.startsWith('/')) return null;
  const path = join(REPO_ROOT, 'public', src.replace(/^\/+/, ''));
  if (!existsSync(path)) return null;
  const ext = extname(path).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

function mark(x, y, scale=1) {
  const s = 12 * scale;
  return `<path d="M${x} ${y-s} L${x+s*.36} ${y-s*.36} L${x+s} ${y} L${x+s*.36} ${y+s*.36} L${x} ${y+s} L${x-s*.36} ${y+s*.36} L${x-s} ${y} L${x-s*.36} ${y-s*.36} Z" fill="${COLORS.wine}"/>`;
}

function masthead(width, top=66) {
  return `<g>
    <text x="72" y="${top}" fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-size="28" font-weight="700" letter-spacing="4">NUVELLUM</text>
    ${mark(304, top-10, .55)}
    <line x1="72" y1="${top+22}" x2="${width-72}" y2="${top+22}" stroke="${COLORS.line}"/>
  </g>`;
}

function footer(width, height) {
  return `<g>
    <line x1="72" y1="${height-88}" x2="${width-72}" y2="${height-88}" stroke="${COLORS.line}"/>
    <text x="72" y="${height-48}" fill="${COLORS.stone}" font-family="Arial,Helvetica,sans-serif" font-size="18" letter-spacing="2">BEYOND THE HEADLINE.</text>
    <text x="${width-72}" y="${height-48}" text-anchor="end" fill="${COLORS.stone}" font-family="Arial,Helvetica,sans-serif" font-size="18">NUVELLUM.VERCEL.APP</text>
  </g>`;
}

function labelFor(story) {
  if (story.mediaMode === 'illustration') return 'ILLUSTRATION';
  if (story.mediaMode === 'photo') return 'FILE PHOTO';
  return '';
}

function square(story, image) {
  const w=1080, h=1080;
  const section = esc(String(story.section || 'Nuvellum').toUpperCase());
  const imageLed = Boolean(image);
  const label = labelFor(story);
  if (imageLed) {
    const title = wrap(story.title, 936, 54, 4);
    const dekY = 718 + (title.length - 1) * 58 + 64;
    const dek = wrap(story.dek, 936, 22, Math.max(0, Math.min(2, 1 + Math.floor((h - 118 - dekY) / 30))), 'italic');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
      ${masthead(w)}
      <defs><clipPath id="img"><rect x="72" y="126" width="936" height="480" rx="2"/></clipPath></defs>
      <g clip-path="url(#img)"><image href="${image}" x="72" y="126" width="936" height="480" preserveAspectRatio="xMidYMid slice"/></g>
      <rect x="72" y="126" width="12" height="480" fill="${COLORS.wine}"/>
      <text x="72" y="650" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}${label ? '  ·  '+label : ''}</text>
      ${textLines(title,72,718,54,58,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
      ${textLines(dek,72,dekY,22,30,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
      ${footer(w,h)}
    </svg>`;
  }
  const title = wrap(story.title, 936, 68, 6);
  const dek = wrap(story.dek, 936, 28, 3, 'italic');
  const flow = 276 + (title.length - 1) * 72 + 76 + 62 + (dek.length - 1) * 38;
  const titleY = 276 + Math.max(0, Math.floor((h - 148 - flow) / 2));
  const ruleY = titleY + (title.length - 1) * 72 + 76;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
    <rect x="0" y="0" width="18" height="${h}" fill="${COLORS.wine}"/>
    ${masthead(w)}
    <text x="72" y="154" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}</text>
    <text x="805" y="255" fill="${COLORS.soft}" font-family="Georgia,'Times New Roman',serif" font-size="260" font-weight="700">N</text>
    ${mark(934,178,2.2)}
    ${textLines(title,72,titleY,68,72,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
    <line x1="72" y1="${ruleY}" x2="330" y2="${ruleY}" stroke="${COLORS.wine}" stroke-width="4"/>
    ${textLines(dek,72,ruleY + 62,28,38,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
    ${footer(w,h)}
  </svg>`;
}

function portrait(story, image) {
  const w=1080, h=1350;
  const section = esc(String(story.section || 'Nuvellum').toUpperCase());
  const imageLed = Boolean(image);
  const label = labelFor(story);
  if (imageLed) {
    const title = wrap(story.title, 936, 58, 5);
    const dekY = 858 + (title.length - 1) * 63 + 70;
    const dek = wrap(story.dek, 936, 24, Math.max(0, Math.min(2, 1 + Math.floor((h - 118 - dekY) / 32))), 'italic');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
      ${masthead(w)}
      <defs><clipPath id="img"><rect x="72" y="126" width="936" height="610" rx="2"/></clipPath></defs>
      <g clip-path="url(#img)"><image href="${image}" x="72" y="126" width="936" height="610" preserveAspectRatio="xMidYMid slice"/></g>
      <rect x="72" y="126" width="12" height="610" fill="${COLORS.wine}"/>
      <text x="72" y="786" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}${label ? '  ·  '+label : ''}</text>
      ${textLines(title,72,858,58,63,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
      ${textLines(dek,72,dekY,24,32,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
      ${footer(w,h)}
    </svg>`;
  }
  const title = wrap(story.title, 936, 76, 7);
  const dek = wrap(story.dek, 936, 30, 4, 'italic');
  const flow = 336 + (title.length - 1) * 80 + 84 + 72 + (dek.length - 1) * 42;
  const titleY = 336 + Math.max(0, Math.floor((h - 158 - flow) / 2));
  const ruleY = titleY + (title.length - 1) * 80 + 84;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
    <rect x="0" y="0" width="18" height="${h}" fill="${COLORS.wine}"/>
    ${masthead(w)}
    <text x="72" y="170" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}</text>
    <text x="760" y="330" fill="${COLORS.soft}" font-family="Georgia,'Times New Roman',serif" font-size="330" font-weight="700">N</text>
    ${mark(930,220,2.6)}
    ${textLines(title,72,titleY,76,80,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
    <line x1="72" y1="${ruleY}" x2="360" y2="${ruleY}" stroke="${COLORS.wine}" stroke-width="4"/>
    ${textLines(dek,72,ruleY + 72,30,42,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
    ${footer(w,h)}
  </svg>`;
}

export function renderSocialCards(story, outBase) {
  const dir = join(outBase, story.slug);
  mkdirSync(dir, { recursive: true });
  const image = imageDataUri(story);
  const squarePath = join(dir, 'square.svg');
  const portraitPath = join(dir, 'portrait.svg');
  writeFileSync(squarePath, square(story, image));
  writeFileSync(portraitPath, portrait(story, image));
  const manifest = {
    slug: story.slug,
    sourceMode: image ? story.mediaMode : 'text-led',
    square: relative(REPO_ROOT, squarePath).replaceAll('\\', '/'),
    portrait: relative(REPO_ROOT, portraitPath).replaceAll('\\', '/'),
    rasterNeededForLivePosting: true
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export const SOCIAL_CARD_DIR = join(REPO_ROOT, 'engines', 'out', 'social-cards');

