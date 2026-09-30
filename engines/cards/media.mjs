// The story's own image, or nothing. There is no fallback picture: a story without a usable photo or
// approved illustration gets a text-led card.
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/** Pixel size from the file header (PNG, JPEG, WebP, SVG viewBox); null when unknown. */
export function imageSize(buf, ext) {
  try {
    if (ext === '.png' && buf.toString('ascii', 1, 4) === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (ext === '.jpg' || ext === '.jpeg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (ext === '.webp' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const kind = buf.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (ext === '.svg') {
      const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(buf.toString('utf8', 0, 4000));
      if (vb) return { width: +vb[1], height: +vb[2] };
    }
  } catch {}
  return null;
}

/**
 * { uri, mode: 'photo'|'illustration', width, height, credit, label } for the story's own local image, or null.
 * Remote images, missing files and unknown types are treated as "no image".
 */
export function storyMedia(story) {
  const src = String(story.image || '').trim();
  if (!src.startsWith('/') || story.mediaMode === 'text-led') return null;
  const path = join(REPO_ROOT, 'public', src.replace(/^\/+/, ''));
  const ext = extname(path).toLowerCase();
  if (!existsSync(path) || !MIME[ext]) return null;
  const buf = readFileSync(path);
  const size = imageSize(buf, ext) || { width: story.imageCredit?.width || 0, height: story.imageCredit?.height || 0 };
  const mode = story.mediaMode === 'illustration' || ext === '.svg' ? 'illustration' : 'photo';
  const c = story.imageCredit;
  const credit = mode === 'photo' && c && (c.author || c.license) ? `Photo: ${[c.author, c.license].filter(Boolean).join(' / ')}` : '';
  return { uri: `data:${MIME[ext]};base64,${buf.toString('base64')}`, mode, width: size.width, height: size.height, credit, focus: c?.focus || '', label: mode === 'photo' ? 'FILE PHOTO' : 'ILLUSTRATION' };
}

/**
 * preserveAspectRatio for a cover crop into a w×h box. When the picture is taller than the box (portraits,
 * people), anchor to the top so faces and heads are not cut off; otherwise keep the centre.
 */
export function coverAlign(media, w, h) {
  if (/top/i.test(media.focus)) return 'xMidYMin slice';
  if (/bottom/i.test(media.focus)) return 'xMidYMax slice';
  if (media.width && media.height && media.height / media.width > h / w) return 'xMidYMin slice';
  return 'xMidYMid slice';
}
