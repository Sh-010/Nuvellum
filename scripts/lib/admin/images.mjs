// Upload checks for article images. The type is decided by the file's own bytes, not by the name or
// the browser's MIME claim; both must agree with the bytes. SVG is refused: it is active content, and
// the only SVGs Nuvellum serves are newsroom illustrations that pass scripts/lib/svg-safety.mjs.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // keeps the base64 request under Vercel's 4.5 MB body limit
export const MIN_IMAGE_WIDTH = 600;
export const MAX_IMAGE_SIDE = 10000;

const TYPES = {
  jpg: { mime: 'image/jpeg', exts: ['jpg', 'jpeg'] },
  png: { mime: 'image/png', exts: ['png'] },
  webp: { mime: 'image/webp', exts: ['webp'] }
};

export function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Pixel dimensions from the image header (JPEG SOFn, PNG IHDR, WebP VP8/VP8L/VP8X), or null. */
export function dimensions(buf, kind) {
  try {
    if (kind === 'png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (kind === 'webp') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (kind === 'jpg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return null;
}

/**
 * Validate an upload { name, type, dataBase64 }. Returns { ok, errors, ext, bytes, width, height }.
 * The stored extension always comes from the sniffed type.
 */
export function checkUpload(upload) {
  const errors = [];
  const name = String(upload?.name || '');
  const claimed = String(upload?.type || '').toLowerCase();
  const b64 = String(upload?.dataBase64 || '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, errors: ['The image data is not valid.'] };
  if (b64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) return { ok: false, errors: [`Images must be ${MAX_IMAGE_BYTES / 1048576} MB or smaller.`] };
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, errors: [`Images must be ${MAX_IMAGE_BYTES / 1048576} MB or smaller.`] };
  const nameExt = (name.match(/\.([A-Za-z0-9]+)$/)?.[1] || '').toLowerCase();
  if (nameExt === 'svg' || claimed.includes('svg') || /<svg[\s>]/i.test(bytes.subarray(0, 512).toString('utf8'))) {
    return { ok: false, errors: ['SVG uploads are not accepted. Upload a JPEG, PNG or WebP.'] };
  }
  const kind = sniff(bytes);
  if (!kind) return { ok: false, errors: ['Only JPEG, PNG and WebP images are accepted.'] };
  if (!TYPES[kind].exts.includes(nameExt)) errors.push(`The file name ends in ".${nameExt || '?'}" but the file is a ${kind.toUpperCase()}.`);
  if (claimed && claimed !== TYPES[kind].mime) errors.push(`The browser reported ${claimed} but the file is ${TYPES[kind].mime}.`);
  const dim = dimensions(bytes, kind);
  if (!dim || !dim.width || !dim.height) errors.push('The image dimensions could not be read.');
  else {
    if (dim.width < MIN_IMAGE_WIDTH) errors.push(`The image is ${dim.width}px wide; use at least ${MIN_IMAGE_WIDTH}px so it is sharp on the article page.`);
    if (dim.width > MAX_IMAGE_SIDE || dim.height > MAX_IMAGE_SIDE) errors.push('The image is too large in pixels.');
  }
  return { ok: errors.length === 0, errors, ext: kind, mime: TYPES[kind].mime, bytes: bytes.length, width: dim?.width, height: dim?.height, base64: b64 };
}

/** Remote image URLs allowed by the site's contract: https only, no credentials, sane length. */
export function checkImageUrl(url) {
  const s = String(url || '').trim();
  if (s.length > 800) return 'Image URL is too long.';
  let u;
  try { u = new URL(s); } catch { return 'Image URL is not a valid URL.'; }
  if (u.protocol !== 'https:') return 'Image URL must use https://.';
  if (u.username || u.password) return 'Image URL must not contain credentials.';
  if (/\.svg($|\?)/i.test(u.pathname)) return 'SVG images are not accepted.';
  return null;
}
