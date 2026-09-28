// Post-build checks on the files that actually deploy (dist/), not on source files.
// PR #46 passed its tests but never shipped because the tests read a file the build
// replaces; this script closes that gap. Run after `npm run build`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, articlesDir } from './lib/paths.mjs';
import { parseFrontmatter } from './lib/editorial.mjs';
import { COUNTRIES, countrySlug } from '../src/lib/countries.js';

const dist = join(root, 'dist');
const errors = [];
const read = (p) => readFileSync(join(dist, p), 'utf8');
if (!existsSync(dist)) { console.error('dist/ is missing; run npm run build first.'); process.exit(1); }

// Homepage: editorial v6 must render from live published content and include the World Desk.
const home = read('index.html');
if (!home.includes('data-home-version="nuvellum-editorial-home-v6"')) errors.push('index.html: editorial homepage v6 marker missing');
if (!home.includes('id="world-desk"')) errors.push('index.html: World Desk missing');
if (!home.includes('id="nuvellum-editorial-home-v6"')) errors.push('index.html: homepage interaction script missing');
if (!home.includes('/article/')) errors.push('index.html: live article routes missing');
if (!home.includes('id="brandZone"')) errors.push('index.html: interactive Nuvellum brand mark missing');
if (!home.includes('/headlines/n')) errors.push('index.html: headline-letter discovery links missing');
if (!home.includes('id="newsletter"')) errors.push('index.html: newsletter section missing');
if (!home.includes('class="footer-cols"')) errors.push('index.html: full footer navigation missing');
// Latest: filters exist, and at most five rows are ever rendered. Candidate sets must stay in
// inert <template>s; rendering them (PR #70) stretched both homepage columns.
for (const key of ['all', 'world', 'business', 'tech', 'culture', 'screen', 'sports']) {
  if (!home.includes(`data-latest-tab="${key}"`)) errors.push(`index.html: Latest filter "${key}" missing`);
}
const renderedLatestRows = (home.replace(/<template[\s\S]*?<\/template>/g, '').match(/class="latest-row"/g) || []).length;
if (renderedLatestRows !== 5) errors.push(`index.html: ${renderedLatestRows} Latest rows rendered outside templates (expected exactly 5)`);
if (!/\.latest-list\{--latest-slot:\d+px;display:grid;grid-template-rows:repeat\(5,var\(--latest-slot\)\)/.test(home)) errors.push('index.html: Latest list no longer reserves a fixed five-row height');
const popularBlock = home.slice(home.indexOf('id="popular-heading"'), home.indexOf('In Focus</h2>'));
if (/\b\d+(\.\d)?K\b/.test(popularBlock.replace(/<[^>]+>/g, ' '))) errors.push('index.html: view-count style metric in Popular Reads (no analytics are connected)');

for (const letter of ['n','u','v','e','l','m']) {
  const file = join('headlines', letter, 'index.html');
  if (!existsSync(join(dist, file))) errors.push(`${file}: missing headline archive route`);
}

if (!existsSync(join(dist, 'world-explorer', 'index.html'))) errors.push('world-explorer/index.html: missing interactive globe route');
else {
  const explorer = read(join('world-explorer', 'index.html'));
  if (!explorer.includes('id="globeCanvas"')) errors.push('world-explorer/index.html: globe canvas missing');
  if (!explorer.includes('world-explorer-data')) errors.push('world-explorer/index.html: country data payload missing');
}
if (!home.includes('href="/world-explorer"')) errors.push('index.html: World Desk CTA does not link to World Explorer');
for (const country of COUNTRIES) {
  const file = join('country', countrySlug(country.name), 'index.html');
  if (!existsSync(join(dist, file))) errors.push(`${file}: country desk route missing for ${country.name}`);
}

// Every published article page.
const published = readdirSync(articlesDir).filter((f) => f.endsWith('.md')).map((f) => {
  const src = readFileSync(join(articlesDir, f), 'utf8');
  return { slug: f.replace(/\.md$/, ''), data: parseFrontmatter(src) || {} };
}).filter((a) => a.data.status === 'published');

for (const { slug, data } of published) {
  const file = join('article', slug, 'index.html');
  if (!existsSync(join(dist, file))) { errors.push(`${file}: missing`); continue; }
  const h = read(file);
  if (!h.includes(`<link rel="canonical" href="https://nuvellum.vercel.app/article/${slug}"`)) errors.push(`${slug}: canonical URL`);
  if (!/<time datetime="\d{4}-\d{2}-\d{2}T[^"]+">/.test(h)) errors.push(`${slug}: <time datetime> missing`);
  if (!/"@type":"(News)?Article"/.test(h)) errors.push(`${slug}: Article JSON-LD missing`);
  // Ingestion sources stay in the article metadata (newsroom, verification, duplicate checks) but are
  // not published: no sources block, no link to or mention of an ingestion URL, no JSON-LD isBasedOn,
  // and no internal sourceNote. Attribution a story needs is written into its text.
  for (const u of Array.isArray(data.sourceUrls) ? data.sourceUrls : []) {
    if (h.includes(String(u).replace(/&/g, '&amp;'))) errors.push(`${slug}: ingestion source ${u} is exposed on the page`);
  }
  if (h.includes('class="context sources"') || h.includes('"isBasedOn"')) errors.push(`${slug}: public sources block or isBasedOn present`);
  if (data.sourceNote && h.includes(String(data.sourceNote).replace(/&/g, '&amp;'))) errors.push(`${slug}: internal sourceNote is exposed on the page`);
}

// Sitemap: every published article, each with lastmod.
const sitemap = read('sitemap.xml');
for (const { slug } of published) {
  if (!new RegExp(`<loc>https://nuvellum\\.vercel\\.app/article/${slug}</loc><lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`).test(sitemap)) errors.push(`sitemap: ${slug} missing or without lastmod`);
}

if (errors.length) {
  console.error('\nBuild output check failed:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`Build output check passed (${published.length} articles).`);
