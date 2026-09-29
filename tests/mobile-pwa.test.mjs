import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ICON_SET, VARIANTS, decodePng, faviconArt, renderIcon } from '../scripts/lib/app-icons.mjs';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const head = readFileSync('src/components/SiteHead.astro', 'utf8');
const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
const bridge = readFileSync('scripts/lib/v51-bridge.mjs', 'utf8');
const icon = (src) => decodePng(readFileSync(`public${src.replace(/\?.*$/, '')}`));

test('manifest: identity, colours and a complete icon set', () => {
  assert.equal(manifest.name, 'Nuvellum');
  assert.equal(manifest.short_name, 'Nuvellum');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.equal(manifest.theme_color, '#6d1720');
  const purposes = (p) => manifest.icons.filter((i) => i.purpose === p).map((i) => i.sizes).sort();
  assert.deepEqual(purposes('any'), ['192x192', '512x512'], 'Android needs 192 and 512 "any" icons');
  assert.deepEqual(purposes('maskable'), ['192x192', '512x512'], 'a true maskable icon, not the "any" artwork reused');
  const anySrc = new Set(manifest.icons.filter((i) => i.purpose === 'any').map((i) => i.src));
  for (const m of manifest.icons.filter((i) => i.purpose === 'maskable')) assert.ok(!anySrc.has(m.src), `${m.src} must not double as an "any" icon`);
});

test('every manifest and page icon exists, is a complete PNG, and has the size it claims', () => {
  for (const i of manifest.icons) {
    assert.doesNotMatch(i.src, /\?v=1\b/, 'no stale ?v=1 cache keys');
    assert.equal(i.type, 'image/png');
    assert.ok(existsSync(`public${i.src}`), `${i.src} exists`);
    const png = icon(i.src); // throws on truncated data, bad CRCs or a missing IEND
    assert.equal(`${png.width}x${png.height}`, i.sizes, `${i.src} is really ${i.sizes}`);
  }
  for (const [file] of ICON_SET) assert.doesNotThrow(() => decodePng(readFileSync(`public/${file}`)), `${file} decodes completely`);
});

test('the committed icons are exactly what the favicon renders to (no stale or hand-edited artwork)', () => {
  const art = faviconArt();
  for (const [file, size, variant] of ICON_SET) {
    const committed = decodePng(readFileSync(`public/${file}`)), fresh = renderIcon(size, variant, art);
    assert.equal(committed.width, size, file);
    let diff = 0;
    for (let k = 0; k < fresh.rgba.length; k++) diff = Math.max(diff, Math.abs(committed.rgba[k] - fresh.rgba[k]));
    assert.ok(diff <= 1, `${file} differs from favicon.svg (max channel difference ${diff}); run node scripts/build-app-icons.mjs`);
  }
});

test('home-screen icons are opaque; the maskable icon keeps the N and star inside the Android safe zone', () => {
  for (const src of ['/icons/nuvellum-apple-180.png', '/icons/nuvellum-maskable-192.png', '/icons/nuvellum-maskable-512.png']) {
    assert.ok(icon(src).opaque, `${src} must be fully opaque (iOS paints transparency black, Android masks it)`);
  }
  const m = icon('/icons/nuvellum-maskable-512.png'), bg = [...m.rgba.subarray(0, 3)];
  const r = m.width * 0.4, c = m.width / 2; // W3C maskable safe zone: circle of radius 40%
  let outside = 0, inside = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const o = (y * m.width + x) * 4, ink = Math.abs(m.rgba[o] - bg[0]) + Math.abs(m.rgba[o + 1] - bg[1]) + Math.abs(m.rgba[o + 2] - bg[2]) > 24;
    if (!ink) continue;
    if (Math.hypot(x + 0.5 - c, y + 0.5 - c) > r) outside++; else inside++;
  }
  assert.equal(outside, 0, 'no part of the monogram may fall outside the safe circle');
  assert.ok(inside > m.width * m.height * 0.05, 'the monogram is actually drawn (not a blank tile)');
  // …and it is the Nuvellum crimson star, not just any mark.
  const crimson = [...Array(m.width * m.height).keys()].some((p) => m.rgba[p * 4] > 90 && m.rgba[p * 4] < 130 && m.rgba[p * 4 + 1] < 40 && m.rgba[p * 4 + 2] < 50);
  assert.ok(crimson, 'the crimson star is present');
  assert.ok(VARIANTS.maskable.glyphScale < VARIANTS.apple.glyphScale, 'maskable padding is larger than the Apple icon’s');
});

test('every page links the same, current icons; the homepage links the manifest; theme colour is consistent', () => {
  for (const [name, src] of [['SiteHead', head], ['homepage', home], ['v5.1 bridge', bridge]]) {
    assert.match(src, /rel="apple-touch-icon" href="\/icons\/nuvellum-apple-180\.png" sizes="180x180"/, `${name}: current Apple touch icon`);
    assert.match(src, /name="apple-mobile-web-app-title" content="Nuvellum"/, `${name}: home-screen title`);
    assert.match(src, /rel="manifest" href="\/manifest\.webmanifest"/, `${name}: links the web app manifest`);
    assert.doesNotMatch(src, /icon-(?:180|192|512)\.png\?v=1/, `${name}: no stale ?v=1 icon`);
    for (const m of src.matchAll(/name="theme-color" content="([^"]+)"/g)) assert.equal(m[1], manifest.theme_color, `${name}: theme colour matches the manifest`);
  }
  for (const m of [head, home].join('\n').matchAll(/href="(\/icons\/[^"]+)"/g)) assert.ok(existsSync(`public${m[1]}`), `${m[1]} exists`);
  // The favicon stays the approved monogram tile.
  const fav = readFileSync('public/favicon.svg', 'utf8');
  assert.match(fav, /<rect[^>]*rx="8"[^>]*fill="#ffffff"/);
  assert.match(fav, /fill="#6d1720"/);
});

test('mobile/PWA metadata does not leak literal newline text', () => {
  assert.equal(head.includes(' />\\n<link rel="shortcut icon"'), false);
  assert.equal(home.includes('>\\n<link rel="shortcut icon"'), false);
});

test('the icon decoder really catches truncated files (the bug that shipped the broken 512 icon)', () => {
  const good = readFileSync('public/icons/nuvellum-512.png');
  assert.throws(() => decodePng(good.subarray(0, Math.floor(good.length * 0.6))), /truncated|IEND|CRC/);
});
