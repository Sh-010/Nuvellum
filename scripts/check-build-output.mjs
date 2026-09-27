// Post-build checks on the files that actually deploy (dist/), not on source files.
// PR #46 passed its tests but never shipped because the tests read a file the build
// replaces; this script closes that gap. Run after `npm run build`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, articlesDir } from './lib/paths.mjs';
import { parseFrontmatter } from './lib/editorial.mjs';

const dist = join(root, 'dist');
const errors = [];
const read = (p) => readFileSync(join(dist, p), 'utf8');
if (!existsSync(dist)) { console.error('dist/ is missing; run npm run build first.'); process.exit(1); }

// Homepage: the v5.1 bridge must have patched story activation.
const home = read('index.html');
if (home.includes('openDrawer(storyDataFrom(el))});')) errors.push('index.html: story cards still use the drawer-only handler');
if (!home.includes('const activate=()=>{const url=el.dataset.route;')) errors.push('index.html: routed story activation missing');
if (!home.includes('nuvellum-production-bridge')) errors.push('index.html: production bridge missing');

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
  if (data.origin === 'automation' && Array.isArray(data.sourceUrls)) {
    for (const u of data.sourceUrls) {
      if (!h.includes(`href="${String(u).replace(/&/g, '&amp;')}"`)) errors.push(`${slug}: source ${u} not linked`);
    }
    if (!h.includes('class="context sources"')) errors.push(`${slug}: sources block missing`);
  }
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
