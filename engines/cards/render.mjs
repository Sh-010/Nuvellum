import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';

const COLORS = { paper:'#FAF7F2', ink:'#0F0F0F', wine:'#681F2D', stone:'#8D8A84', line:'#D8D0C4', soft:'#EFE8DE' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[ch]));
}

function wrap(text, maxChars, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (candidate.length <= maxChars || !line) { line = candidate; continue; }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]?$/, '') + '…';
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
    const title = wrap(story.title, 34, 4);
    const dek = wrap(story.dek, 72, 2);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
      ${masthead(w)}
      <defs><clipPath id="img"><rect x="72" y="126" width="936" height="480" rx="2"/></clipPath></defs>
      <g clip-path="url(#img)"><image href="${image}" x="72" y="126" width="936" height="480" preserveAspectRatio="xMidYMid slice"/></g>
      <rect x="72" y="126" width="12" height="480" fill="${COLORS.wine}"/>
      <text x="72" y="650" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}${label ? '  ·  '+label : ''}</text>
      ${textLines(title,72,718,54,58,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
      ${textLines(dek,72,932,22,30,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
      ${footer(w,h)}
    </svg>`;
  }
  const title = wrap(story.title, 27, 6);
  const dek = wrap(story.dek, 58, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
    <rect x="0" y="0" width="18" height="${h}" fill="${COLORS.wine}"/>
    ${masthead(w)}
    <text x="72" y="154" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}</text>
    <text x="805" y="255" fill="${COLORS.soft}" font-family="Georgia,'Times New Roman',serif" font-size="260" font-weight="700">N</text>
    ${mark(934,178,2.2)}
    ${textLines(title,72,276,68,72,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
    <line x1="72" y1="748" x2="330" y2="748" stroke="${COLORS.wine}" stroke-width="4"/>
    ${textLines(dek,72,810,28,38,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
    ${footer(w,h)}
  </svg>`;
}

function portrait(story, image) {
  const w=1080, h=1350;
  const section = esc(String(story.section || 'Nuvellum').toUpperCase());
  const imageLed = Boolean(image);
  const label = labelFor(story);
  if (imageLed) {
    const title = wrap(story.title, 31, 5);
    const dek = wrap(story.dek, 62, 2);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
      ${masthead(w)}
      <defs><clipPath id="img"><rect x="72" y="126" width="936" height="610" rx="2"/></clipPath></defs>
      <g clip-path="url(#img)"><image href="${image}" x="72" y="126" width="936" height="610" preserveAspectRatio="xMidYMid slice"/></g>
      <rect x="72" y="126" width="12" height="610" fill="${COLORS.wine}"/>
      <text x="72" y="786" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}${label ? '  ·  '+label : ''}</text>
      ${textLines(title,72,858,58,63,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
      ${textLines(dek,72,1180,24,32,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
      ${footer(w,h)}
    </svg>`;
  }
  const title = wrap(story.title, 26, 7);
  const dek = wrap(story.dek, 55, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.paper}"/>
    <rect x="0" y="0" width="18" height="${h}" fill="${COLORS.wine}"/>
    ${masthead(w)}
    <text x="72" y="170" fill="${COLORS.wine}" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${section}</text>
    <text x="760" y="330" fill="${COLORS.soft}" font-family="Georgia,'Times New Roman',serif" font-size="330" font-weight="700">N</text>
    ${mark(930,220,2.6)}
    ${textLines(title,72,336,76,80,`fill="${COLORS.ink}" font-family="Georgia,'Times New Roman',serif" font-weight="700"`) }
    <line x1="72" y1="920" x2="360" y2="920" stroke="${COLORS.wine}" stroke-width="4"/>
    ${textLines(dek,72,992,30,42,`fill="${COLORS.stone}" font-family="Georgia,'Times New Roman',serif" font-style="italic"`) }
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
    portrait: relative(REPO_ROOT, portraitPath).replaceAll('\\\\', '/'),
    rasterNeededForLivePosting: true
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export const SOCIAL_CARD_DIR = join(REPO_ROOT, 'engines', 'out', 'social-cards');

