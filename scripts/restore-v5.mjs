import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildPublicDir } from './lib/paths.mjs';
import { productionizeHome, productionizeLegacyArticle } from './lib/v51-bridge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const archivePath = join(root, 'assets', 'nuvellum-v5.zip');
const archive = readFileSync(archivePath);
const expectedSha256 = 'b41a222588a53e91a78354c859c9d9ee01b7ac07b333e9a98f3dfa4f8b8d93e8';
const actualSha256 = createHash('sha256').update(archive).digest('hex');
if (actualSha256 !== expectedSha256) throw new Error(`Nuvellum v5.1 baseline archive checksum mismatch: ${actualSha256}`);
if (existsSync(join(root, 'src', 'pages', 'index.astro'))) throw new Error('src/pages/index.astro would override the approved v5.1 homepage. Remove it before building.');
const zip = new AdmZip(archive);
zip.extractAllTo(buildPublicDir, true);
const baselineHtml = readFileSync(join(buildPublicDir, 'index.html'), 'utf8');
if (!baselineHtml.includes('v4 FULLY INTERACTIVE EDITORIAL LAYER') || !baselineHtml.includes('quick-chip')) throw new Error('Extracted homepage does not match the approved v5.1 interaction baseline.');


for (const file of ['index.html','article.html']) {
  const path = join(buildPublicDir, file);
  let html = readFileSync(path, 'utf8');
  html = file === 'index.html' ? productionizeHome(html) : productionizeLegacyArticle(html);
  if (file === 'index.html' && html.includes('is on the list.')) {
    throw new Error('Production homepage still contains the mock newsletter success message.');
  }
  writeFileSync(path, html);
}

console.log('Restored exact Nuvellum v5.1 design and applied production-only routing/SEO bridges.');
