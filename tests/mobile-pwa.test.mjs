import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mobile/PWA metadata is valid and does not leak literal newline text', () => {
  const manifestText = readFileSync('public/manifest.webmanifest', 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, 'Nuvellum');
  assert.ok(manifest.icons.some(i => i.src.startsWith('/icon-192.png') && i.sizes === '192x192'));
  assert.ok(manifest.icons.some(i => i.src.startsWith('/icon-512.png') && i.sizes === '512x512' && i.purpose === 'maskable'));

  const head = readFileSync('src/components/SiteHead.astro', 'utf8');
  const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
  assert.equal(head.includes(' />\\n<link rel="shortcut icon"'), false);
  assert.equal(home.includes('>\\n<link rel="shortcut icon"'), false);
  assert.match(head, /apple-touch-icon/);
  assert.match(home, /apple-touch-icon/);
});

test('mobile app icons are real PNG files', () => {
  for (const path of ['public/icon-180.png', 'public/icon-192.png', 'public/icon-512.png']) {
    const file = readFileSync(path);
    assert.deepEqual([...file.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  }
});
