import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const zip = new AdmZip(join(root, 'assets', 'nuvellum-v5.zip'));
zip.extractAllTo(join(root, 'public'), true);

const canonical = 'https://nuvellum.vercel.app';
for (const file of ['index.html','article.html']) {
  const path = join(root, 'public', file);
  let html = readFileSync(path, 'utf8');
  const url = file === 'index.html' ? canonical + '/' : canonical + '/article.html';
  if (!html.includes('rel="canonical"')) {
    html = html.replace('</title>', `</title>\n<link rel="canonical" href="${url}">\n<meta property="og:site_name" content="Nuvellum">\n<meta property="og:url" content="${url}">`);
  }
  writeFileSync(path, html);
}
console.log('Restored Nuvellum v5.1 fluid-motion design into public/.');
