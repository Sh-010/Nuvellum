// Regenerate the app icons from public/favicon.svg: node scripts/build-app-icons.mjs
// Run it whenever the favicon changes; tests/mobile-pwa.test.mjs fails until the icons match it again.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_SET, encodePng, faviconArt, renderIcon } from './lib/app-icons.mjs';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const art = faviconArt();
for (const [file, size, variant] of ICON_SET) {
  const out = join(pub, file);
  mkdirSync(dirname(out), { recursive: true });
  const png = encodePng(renderIcon(size, variant, art));
  writeFileSync(out, png);
  console.log(`${file.padEnd(34)} ${size}x${size} ${variant.padEnd(8)} ${png.length} bytes`);
}
