// Article image backfill: audit the published inventory and upgrade weak art from a curated plan.
//
//   node scripts/backfill-article-images.mjs                 audit (default): classify every published image
//   node scripts/backfill-article-images.mjs --apply         apply src/data/image-plan.json to weak/listed articles
//        [--only slug,slug] [--refresh]                      limit to slugs; re-fetch even if already applied
//
// Plan entries (src/data/image-plan.json, keyed by article slug):
//   { "source": "commons", "file": "File:Name.jpg", "alt": "…", "caption": "…", "focus": "50% 35%" }
//   { "source": "illustration", "path": "/uploads/articles/<slug>.svg", "alt": "…", "caption": "…" }
// Commons files are accepted only under open licences (public domain, CC0, CC BY, CC BY-SA; never NC/ND).
// A server-rendered copy (Commons 1280px thumbnail bucket) is stored under public/uploads/articles/, the credit is written
// to src/data/image-credits.json, and only the article's image/imageAlt frontmatter lines change.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/paths.mjs';
import { parseFrontmatter } from './lib/editorial.mjs';

const ARTICLES = join(root, 'src', 'content', 'articles');
const PLAN = join(root, 'src', 'data', 'image-plan.json');
const CREDITS = join(root, 'src', 'data', 'image-credits.json');
const UPLOADS = join(root, 'public', 'uploads', 'articles');
const UA = 'NuvellumImageBackfill/1.0 (https://nuvellum.vercel.app; editorial image credits tooling)';
const OPEN_LICENSE = /^(cc0|public domain|pd\b|pd-|cc by(-sa)? \d(\.\d)?|cc by(-sa)?$|attribution$|cc-by(-sa)?-\d)/i;
const CLOSED_LICENSE = /\b(nc|nd|non-?commercial|no ?deriv)/i;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const refresh = args.includes('--refresh');
const only = (args[args.indexOf('--only') + 1] || '').split(',').filter(s => s && args.includes('--only'));

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const plan = readJson(PLAN, {});
const credits = readJson(CREDITS, {});

// Weak = generic art standing in for a story. Newsroom AI illustrations (ai-svg) are not weak: they are only
// committed after passing the n8n style gate, and visual-acquire still prefers a real photo.
export const WEAK = ['procedural', 'section-placeholder'];

export function classify(data) {
  const image = String(data.image || '').trim();
  const imagePath = image.replace(/[?#].*$/, '');
  if (imagePath.startsWith('/uploads/articles/') && /\.(jpe?g|png|webp)$/i.test(imagePath)) return 'real';
  if (imagePath.startsWith('/uploads/articles/') && imagePath.endsWith('.svg')) return 'illustration';
  if (!image) return 'text-led';
  if (image.startsWith('/generated/ai/')) return 'ai-svg';
  if (data.origin === 'automation') return 'procedural';
  return 'section-placeholder';
}

function articles() {
  return readdirSync(ARTICLES).filter(f => f.endsWith('.md')).map(f => {
    const src = readFileSync(join(ARTICLES, f), 'utf8');
    return { slug: f.replace(/\.md$/, ''), file: join(ARTICLES, f), src, data: parseFrontmatter(src) || {} };
  }).filter(a => a.data.status === 'published');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Commons asks clients to pace requests; back off and retry when it answers with a rate-limit page.
async function politeFetch(url, asJson) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(1100 + attempt * 4000);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) continue;
    if (!asJson) return res;
    const text = await res.text();
    if (text.startsWith('{')) return JSON.parse(text);
  }
  throw new Error(`Commons kept rate-limiting ${url.slice(0, 80)}`);
}

const strip = html => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function commonsInfo(file) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(file)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1280`;
  const page = Object.values((await politeFetch(url, true)).query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`Commons file not found: ${file}`);
  const m = info.extmetadata || {};
  const license = strip(m.LicenseShortName?.value) || strip(m.License?.value);
  if (!OPEN_LICENSE.test(license) || CLOSED_LICENSE.test(license)) throw new Error(`${file}: licence "${license}" is not an accepted open licence`);
  return {
    file,
    license,
    licenseUrl: m.LicenseUrl?.value || '',
    author: strip(m.Artist?.value) || 'Unknown author',
    credit: strip(m.Credit?.value),
    descriptionUrl: info.descriptionurl,
    downloadUrl: info.width > 1280 && info.thumburl ? info.thumburl : info.url,
    mime: info.mime,
    width: info.width,
    height: info.height
  };
}

function setFrontmatter(src, key, value) {
  const line = `${key}: ${JSON.stringify(value)}`;
  const re = new RegExp(`^${key}:.*$`, 'm');
  return re.test(src) ? src.replace(re, line) : src.replace(/^---\n/, `---\n${line}\n`);
}

function audit(list) {
  const rows = list.map(a => ({ slug: a.slug, section: a.data.section, kind: classify(a.data), planned: plan[a.slug]?.source || '' }));
  const counts = rows.reduce((c, r) => ((c[r.kind] = (c[r.kind] || 0) + 1), c), {});
  for (const r of rows.sort((x, y) => x.kind.localeCompare(y.kind) || x.section.localeCompare(y.section))) {
    const weak = WEAK.includes(r.kind);
    console.log(`${weak ? 'WEAK ' : '     '}${r.kind.padEnd(20)} ${String(r.section).padEnd(11)} ${r.planned ? `[plan: ${r.planned}] ` : ''}${r.slug}`);
  }
  console.log('\n', counts, `\n ${rows.filter(r => WEAK.includes(r.kind)).length} weak of ${rows.length} published`);
}

async function run() {
  const list = articles();
  if (!apply) return audit(list);
  mkdirSync(UPLOADS, { recursive: true });
  let changed = 0;
  for (const a of list) {
    const p = plan[a.slug];
    if (!p || (only.length && !only.includes(a.slug))) continue;
    if (!refresh && credits[a.slug] && credits[a.slug].file === p.file && credits[a.slug].path === a.data.image) continue;
    let path, credit;
    if (p.source === 'commons') {
      const info = await commonsInfo(p.file);
      const ext = /png/.test(info.mime) && !/\.jpe?g/i.test(info.downloadUrl) ? 'png' : 'jpg';
      path = `/uploads/articles/${a.slug}.${ext}`;
      const res = await politeFetch(info.downloadUrl, false);
      if (!res.ok) throw new Error(`${a.slug}: download ${res.status}`);
      writeFileSync(join(root, 'public', path), Buffer.from(await res.arrayBuffer()));
      credit = { kind: 'photo', source: 'Wikimedia Commons', ...info, caption: p.caption || '', focus: p.focus || '', path, retrieved: new Date().toISOString().slice(0, 10) };
      delete credit.downloadUrl;
    } else if (p.source === 'illustration') {
      path = p.path;
      if (!existsSync(join(root, 'public', path))) throw new Error(`${a.slug}: illustration ${path} is missing`);
      credit = { kind: 'illustration', source: 'Nuvellum', caption: p.caption || 'Nuvellum editorial illustration', focus: p.focus || '', path };
    } else throw new Error(`${a.slug}: unknown plan source "${p.source}"`);
    let src = setFrontmatter(a.src, 'image', path);
    if (p.alt) src = setFrontmatter(src, 'imageAlt', p.alt);
    writeFileSync(a.file, src);
    credits[a.slug] = credit;
    changed++;
    console.log(`applied ${credit.kind.padEnd(12)} ${a.slug}  ${credit.license ? `(${credit.license}, ${credit.author})` : ''}`);
  }
  const sorted = Object.fromEntries(Object.keys(credits).sort().map(k => [k, credits[k]]));
  writeFileSync(CREDITS, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\n${changed} article(s) updated; credits in src/data/image-credits.json`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('backfill-article-images.mjs')) {
  run().catch(e => { console.error(e.message); process.exit(1); });
}
