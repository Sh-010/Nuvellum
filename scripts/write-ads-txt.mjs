// Writes dist/ads.txt only when NUVELLUM_ADSENSE_PUB_ID holds a real AdSense publisher ID (pub- + 16 digits).
// Until then the site serves no ads.txt at all, which is correct for a site without ads.
// f08c47fec0942fa0 is Google's published certification authority ID for ads.txt.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function adsTxt(pubId) {
  const id = String(pubId || '').trim();
  return /^pub-\d{16}$/.test(id) ? `google.com, ${id}, DIRECT, f08c47fec0942fa0\n` : '';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const txt = adsTxt(process.env.NUVELLUM_ADSENSE_PUB_ID);
  if (!txt) { console.log('ads.txt not written: NUVELLUM_ADSENSE_PUB_ID is not configured.'); process.exit(0); }
  writeFileSync(fileURLToPath(new URL('../dist/ads.txt', import.meta.url)), txt);
  console.log('ads.txt written for the configured AdSense publisher ID.');
}
