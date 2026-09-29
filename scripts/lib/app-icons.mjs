// Nuvellum app icons, drawn from public/favicon.svg so the browser-tab icon, the home-screen icon and the
// Android adaptive icon are always the same artwork. Dependency-free: the favicon is straight-line paths on a
// rounded tile, so a small anti-aliased scanline rasteriser and a PNG encoder/decoder are enough. The same
// code renders the committed PNGs (scripts/build-app-icons.mjs) and checks them (tests/mobile-pwa.test.mjs).
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// ---------- favicon.svg -> shapes ----------

const hex = (c) => { const m = String(c).trim().match(/^#([0-9a-f]{6})$/i); if (!m) throw new Error(`unsupported colour ${c}`); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };

/** Straight-line SVG path data (M L H V Z, absolute and relative) -> list of closed polygons. */
export function parsePath(d) {
  const tokens = String(d).match(/[MLHVZmlhvz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const polys = []; let poly = null, x = 0, y = 0, cmd = null, i = 0;
  const num = () => { const v = Number(tokens[i++]); if (!Number.isFinite(v)) throw new Error(`bad path number in ${d}`); return v; };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); poly = [[x, y]]; polys.push(poly); cmd = 'L'; break;
      case 'm': x += num(); y += num(); poly = [[x, y]]; polys.push(poly); cmd = 'l'; break;
      case 'L': x = num(); y = num(); poly.push([x, y]); break;
      case 'l': x += num(); y += num(); poly.push([x, y]); break;
      case 'H': x = num(); poly.push([x, y]); break;
      case 'h': x += num(); poly.push([x, y]); break;
      case 'V': y = num(); poly.push([x, y]); break;
      case 'v': y += num(); poly.push([x, y]); break;
      case 'Z': case 'z': if (poly) { x = poly[0][0]; y = poly[0][1]; } cmd = null; break;
      default: throw new Error(`unsupported path command ${cmd} (favicon icons support straight lines only)`);
    }
  }
  return polys;
}

/** Rounded rectangle as a polygon (arcs as 24 segments per corner). */
function roundedRect(x, y, w, h, r) {
  const pts = [], n = 24;
  const corners = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= n; k++) { const a = a0 + (Math.PI / 2) * (k / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

/** The favicon as layers: the tile, then the glyphs (the N, then the star). */
export function faviconArt(svg = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8')) {
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1]?.split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4) throw new Error('favicon.svg needs a viewBox');
  const rectTag = svg.match(/<rect\b[^>]*>/)?.[0];
  if (!rectTag) throw new Error('favicon.svg needs its tile <rect>');
  const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]+)"`)) || [])[1];
  const tile = { x: +attr(rectTag, 'x'), y: +attr(rectTag, 'y'), w: +attr(rectTag, 'width'), h: +attr(rectTag, 'height'), r: +(attr(rectTag, 'rx') || 0), color: hex(attr(rectTag, 'fill')) };
  const glyphs = [];
  // Paths inherit fill from an enclosing <g fill>, or carry their own.
  const groupRe = /<g\b[^>]*fill="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g;
  let m; const inGroups = [];
  while ((m = groupRe.exec(svg))) { inGroups.push([m.index, m.index + m[0].length]); for (const p of m[2].matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)) glyphs.push({ polys: parsePath(p[1]), color: hex(attr(p[0], 'fill') || m[1]) }); }
  for (const p of svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)) {
    if (inGroups.some(([a, b]) => p.index >= a && p.index < b)) continue;
    glyphs.push({ polys: parsePath(p[1]), color: hex(attr(p[0], 'fill')) });
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) for (const poly of g.polys) for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { viewBox, tile, glyphs, bbox: { x0, y0, x1, y1 } };
}

// ---------- rasteriser ----------

const SUB = 16; // vertical samples per pixel; horizontal coverage is exact

/** Coverage (0..1 per pixel) of polygons under the nonzero rule. */
function coverage(polys, size) {
  const cov = new Float32Array(size * size);
  const edges = [];
  for (const poly of polys) for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
    if (ay !== by) edges.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1 } : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1 });
  }
  for (let sy = 0; sy < size * SUB; sy++) {
    const y = (sy + 0.5) / SUB;
    const xs = [];
    for (const e of edges) if (y >= e.y0 && y < e.y1) xs.push([e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), e.dir]);
    if (!xs.length) continue;
    xs.sort((a, b) => a[0] - b[0]);
    const row = Math.floor(sy / SUB) * size;
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k][1];
      if (!wind) continue;
      const a = Math.max(0, xs[k][0]), b = Math.min(size, xs[k + 1][0]);
      if (b <= a) continue;
      const pa = Math.floor(a), pb = Math.floor(b);
      if (pa === pb) { cov[row + pa] += (b - a) / SUB; continue; }
      cov[row + pa] += (pa + 1 - a) / SUB;
      for (let px = pa + 1; px < pb && px < size; px++) cov[row + px] += 1 / SUB;
      if (pb < size) cov[row + pb] += (b - pb) / SUB;
    }
  }
  for (let k = 0; k < cov.length; k++) if (cov[k] > 1) cov[k] = 1;
  return cov;
}

/** Composite a layer (colour x coverage) over an RGBA float buffer (premultiplied). */
function paint(buf, cov, [r, g, b]) {
  for (let k = 0; k < cov.length; k++) {
    const c = cov[k]; if (!c) continue;
    const o = k * 4, keep = 1 - c;
    buf[o] = r * c + buf[o] * keep; buf[o + 1] = g * c + buf[o + 1] * keep; buf[o + 2] = b * c + buf[o + 2] * keep; buf[o + 3] = 255 * c + buf[o + 3] * keep;
  }
}

/**
 * Icon variants.
 *  any:      the favicon exactly (rounded tile on transparency), scaled to size.
 *  apple:    full-bleed square (iOS rounds the corners itself; it would paint transparency black), with the
 *            monogram centred and kept clear of the corner rounding.
 *  maskable: full-bleed square with the monogram centred inside the 80% safe circle, so Android's adaptive
 *            masks (circle, squircle, teardrop) never crop the N or the star.
 */
export const VARIANTS = {
  any: { fullBleed: false, glyphScale: null },
  apple: { fullBleed: true, glyphScale: 0.8 },
  maskable: { fullBleed: true, glyphScale: 0.66 }
};

export function renderIcon(size, variant = 'any', art = faviconArt()) {
  const v = VARIANTS[variant]; if (!v) throw new Error(`unknown variant ${variant}`);
  const [vx, vy, vw] = art.viewBox, k = size / vw;
  const buf = new Float32Array(size * size * 4);
  const map = (tx) => (polys) => polys.map((poly) => poly.map(([x, y]) => tx(x, y)));
  if (v.fullBleed) paint(buf, coverage([[[0, 0], [size, 0], [size, size], [0, size]]], size), art.tile.color);
  else paint(buf, coverage([roundedRect((art.tile.x - vx) * k, (art.tile.y - vy) * k, art.tile.w * k, art.tile.h * k, art.tile.r * k)], size), art.tile.color);
  let tx;
  if (v.glyphScale == null) tx = (x, y) => [(x - vx) * k, (y - vy) * k];
  else {
    const { x0, y0, x1, y1 } = art.bbox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = v.glyphScale * k;
    tx = (x, y) => [size / 2 + (x - cx) * s, size / 2 + (y - cy) * s];
  }
  for (const g of art.glyphs) paint(buf, coverage(map(tx)(g.polys), size), g.color);
  const out = new Uint8Array(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    const a = buf[p * 4 + 3];
    out[p * 4 + 3] = Math.round(a);
    for (let c = 0; c < 3; c++) out[p * 4 + c] = a > 0 ? Math.min(255, Math.round((buf[p * 4 + c] / a) * 255)) : 0;
  }
  return { width: size, height: size, rgba: out };
}

// ---------- PNG ----------

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA -> PNG (RGB when fully opaque, which home-screen icons must be). */
export function encodePng({ width, height, rgba }) {
  const opaque = rgba.every((v, i) => i % 4 !== 3 || v === 255);
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc(height * (1 + width * ch));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * ch)] = 0;
    for (let x = 0; x < width; x++) for (let c = 0; c < ch; c++) raw[y * (1 + width * ch) + 1 + x * ch + c] = rgba[(y * width + x) * 4 + c];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Strict PNG decoder for 8-bit RGB/RGBA (what these icons use). Throws on truncation or corrupt chunks. */
export function decodePng(file) {
  const buf = Buffer.from(file);
  if (buf.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) throw new Error('not a PNG');
  let off = 8, ihdr = null, ended = false; const idat = [];
  while (off < buf.length) {
    if (off + 12 > buf.length) throw new Error('truncated PNG chunk');
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    if (off + 12 + len > buf.length) throw new Error(`truncated ${type} chunk`);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) throw new Error(`bad CRC in ${type}`);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { ended = true; break; }
    off += 12 + len;
  }
  if (!ihdr || !ended) throw new Error('PNG has no IHDR or IEND (truncated file)');
  if (ihdr.depth !== 8 || ![2, 6].includes(ihdr.color) || ihdr.interlace) throw new Error(`unsupported PNG format (depth ${ihdr.depth}, colour ${ihdr.color})`);
  const ch = ihdr.color === 6 ? 4 : 3, { width, height } = ihdr, stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (stride + 1)) throw new Error(`PNG image data is ${raw.length} bytes, expected ${height * (stride + 1)} (truncated or corrupt)`);
  const px = Buffer.alloc(height * stride), rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error(`bad PNG filter ${f}`);
      px[y * stride + x] = v & 255;
    }
  }
  for (let p = 0; p < width * height; p++) { for (let c = 0; c < 3; c++) rgba[p * 4 + c] = px[p * ch + c]; rgba[p * 4 + 3] = ch === 4 ? px[p * ch + 3] : 255; }
  return { width, height, rgba, opaque: ch === 3 || rgba.every((v, i) => i % 4 !== 3 || v === 255) };
}

/** The icon set the site ships: [path under public/, size, variant]. */
export const ICON_SET = [
  ['icons/nuvellum-apple-180.png', 180, 'apple'],
  ['icons/nuvellum-192.png', 192, 'any'],
  ['icons/nuvellum-512.png', 512, 'any'],
  ['icons/nuvellum-maskable-192.png', 192, 'maskable'],
  ['icons/nuvellum-maskable-512.png', 512, 'maskable'],
  // Legacy paths (cached manifests and old home-screen shortcuts may still ask for them): same artwork.
  ['icon-180.png', 180, 'apple'],
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any']
];
