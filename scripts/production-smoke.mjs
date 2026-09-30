const ORIGIN = (process.env.NUVELLUM_SITE_URL || 'https://www.nuvellum.news').replace(/\/+$/, '');
const UA = 'Nuvellum-Production-Smoke/1.0';

const failures = [];
const checked = [];
const record = (ok, what, detail = '') => {
  checked.push({ ok, what, detail });
  if (!ok) failures.push(detail ? `${what}: ${detail}` : what);
};

async function get(path) {
  const url = path.startsWith('http') ? path : ORIGIN + path;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' }
  });
  const body = await res.text();
  return { url, res, body };
}

const core = [
  '/', '/latest', '/section/world', '/section/sports', '/world-explorer',
  '/saved', '/about', '/standards', '/corrections', '/contact',
  '/privacy', '/terms', '/credits', '/brief/unsubscribe',
  '/rss.xml', '/sitemap.xml', '/robots.txt', '/manifest.webmanifest',
  '/favicon.svg?v=5'
];

const pages = new Map();
for (const path of core) {
  try {
    const out = await get(path);
    pages.set(path, out);
    record(out.res.ok, path, `HTTP ${out.res.status}`);
  } catch (e) {
    record(false, path, e instanceof Error ? e.message : String(e));
  }
}

const expect = (path, re, label) => {
  const body = pages.get(path)?.body || '';
  record(re.test(body), `${path} contains ${label}`);
};

expect('/', /id="world-desk"/, 'World Desk');
expect('/', /id="newsletter"/, 'Brief signup');
expect('/', /data-latest-tab="sports"/, 'Sports Latest filter');
expect('/world-explorer', /id="globeCanvas"/, 'interactive globe canvas');
expect('/saved', /id="savedList"/, 'saved-stories list');
expect('/rss.xml', /<rss\b|<feed\b/i, 'RSS/Atom XML root');
expect('/sitemap.xml', /<urlset\b/i, 'sitemap urlset');
expect('/robots.txt', /Sitemap:\s*https:\/\/www\.nuvellum\.news\/sitemap\.xml/i, 'canonical sitemap declaration');

const home = pages.get('/')?.body || '';
record(!/<img\b[^>]*\ssrc="(?:|undefined|null)"/i.test(home), 'homepage has no empty image sources');

const abs = (value) => {
  try { return new URL(value, ORIGIN).toString(); } catch { return ''; }
};
const articleUrls = [...new Set([...home.matchAll(/href="(\/article\/[a-z0-9-]+)"/gi)].map(m => abs(m[1])).filter(Boolean))];
const imageUrls = [...new Set([...home.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map(m => abs(m[1])).filter(u => u.startsWith(ORIGIN)))];

async function verifyMany(urls, kind) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' } });
      record(res.ok, `${kind} ${url.replace(ORIGIN, '')}`, `HTTP ${res.status}`);
    } catch (e) {
      record(false, `${kind} ${url.replace(ORIGIN, '')}`, e instanceof Error ? e.message : String(e));
    }
  }
}

await verifyMany(articleUrls, 'article');
await verifyMany(imageUrls, 'image');

const sports = pages.get('/section/sports')?.body || '';
record(/\/article\//.test(sports), 'Sports section contains at least one article');
const latest = pages.get('/latest')?.body || '';
record(/\/article\//.test(latest), 'Latest contains at least one article');

const summary = {
  origin: ORIGIN,
  checked: checked.length,
  coreRoutes: core.length,
  homepageArticleLinks: articleUrls.length,
  homepageImages: imageUrls.length,
  failures
};
console.log(JSON.stringify(summary, null, 2));

if (failures.length) {
  console.error('\nProduction smoke failed:\n' + failures.map(x => ' - ' + x).join('\n'));
  process.exit(1);
}
