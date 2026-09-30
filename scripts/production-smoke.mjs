const ORIGIN = (process.env.NUVELLUM_SITE_URL || 'https://www.nuvellum.news').replace(/\/+$/, '');
const UA = 'Nuvellum-Production-Smoke/2.0';
const REQUEST_TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

const failures = [];
const checked = [];
const record = (ok, what, detail = '') => {
  checked.push({ ok, what, detail });
  if (!ok) failures.push(detail ? `${what}: ${detail}` : what);
};

const abs = (value) => {
  try { return new URL(value, ORIGIN).toString(); } catch { return ''; }
};
const sameOrigin = (value) => {
  try { return new URL(value).origin === ORIGIN; } catch { return false; }
};
const htmlDecode = (value) => String(value).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function fetchText(value) {
  const url = value.startsWith('http') ? value : ORIGIN + value;
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' }
  });
  const body = await res.text();
  return { url, res, body };
}

async function mapLimit(values, worker) {
  let cursor = 0;
  const jobs = Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      await worker(values[index], index);
    }
  });
  await Promise.all(jobs);
}

const core = [
  '/', '/latest', '/section/world', '/section/sports', '/world-explorer',
  '/saved', '/about', '/standards', '/corrections', '/contact',
  '/privacy', '/terms', '/credits', '/brief/unsubscribe',
  '/rss.xml', '/sitemap.xml', '/robots.txt', '/manifest.webmanifest',
  '/favicon.svg?v=5'
];

const pages = new Map();
await mapLimit(core, async (path) => {
  try {
    const out = await fetchText(path);
    pages.set(path, out);
    record(out.res.ok, path, `HTTP ${out.res.status}`);
  } catch (e) {
    record(false, path, e instanceof Error ? e.message : String(e));
  }
});

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

const sitemap = pages.get('/sitemap.xml')?.body || '';
const sitemapUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)]
  .map(m => htmlDecode(m[1]).trim())
  .filter(url => sameOrigin(url)))];
record(sitemapUrls.length > 0, 'sitemap exposes same-origin URLs', `found ${sitemapUrls.length}`);

const livePages = new Map();
await mapLimit(sitemapUrls, async (url) => {
  try {
    const out = await fetchText(url);
    livePages.set(url, out);
    record(out.res.ok, `sitemap route ${url.replace(ORIGIN, '') || '/'}`, `HTTP ${out.res.status}`);
    const type = out.res.headers.get('content-type') || '';
    if (/text\/html/i.test(type)) {
      record(!/<img\b[^>]*\ssrc="(?:|undefined|null)"/i.test(out.body), `${url.replace(ORIGIN, '') || '/'} has no empty image sources`);
    }
  } catch (e) {
    record(false, `sitemap route ${url.replace(ORIGIN, '') || '/'}`, e instanceof Error ? e.message : String(e));
  }
});

const articleUrls = sitemapUrls.filter(url => new URL(url).pathname.startsWith('/article/'));
record(articleUrls.length > 0, 'sitemap contains published article routes', `found ${articleUrls.length}`);

const localImageUrls = new Set();
for (const url of articleUrls) {
  const body = livePages.get(url)?.body || '';
  record(/<main\b|<article\b/i.test(body), `article markup ${url.replace(ORIGIN, '')}`);
  for (const m of body.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi)) {
    const image = abs(htmlDecode(m[1]));
    if (image && sameOrigin(image)) localImageUrls.add(image);
  }
}
for (const m of home.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi)) {
  const image = abs(htmlDecode(m[1]));
  if (image && sameOrigin(image)) localImageUrls.add(image);
}

await mapLimit([...localImageUrls], async (url) => {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' }
    });
    const type = res.headers.get('content-type') || '';
    record(res.ok, `image ${url.replace(ORIGIN, '')}`, `HTTP ${res.status}`);
    record(/^image\//i.test(type), `image content-type ${url.replace(ORIGIN, '')}`, type || 'missing');
    const length = Number(res.headers.get('content-length') || 0);
    if (length) record(length > 256, `image body nontrivial ${url.replace(ORIGIN, '')}`, `${length} bytes`);
    await res.arrayBuffer();
  } catch (e) {
    record(false, `image ${url.replace(ORIGIN, '')}`, e instanceof Error ? e.message : String(e));
  }
});

const sports = pages.get('/section/sports')?.body || '';
record(/\/article\//.test(sports), 'Sports section contains at least one article');
const latest = pages.get('/latest')?.body || '';
record(/\/article\//.test(latest), 'Latest contains at least one article');

const summary = {
  origin: ORIGIN,
  checked: checked.length,
  coreRoutes: core.length,
  sitemapRoutes: sitemapUrls.length,
  publishedArticles: articleUrls.length,
  localImages: localImageUrls.size,
  failures
};
console.log(JSON.stringify(summary, null, 2));

if (failures.length) {
  console.error('\nProduction smoke failed:\n' + failures.map(x => ' - ' + x).join('\n'));
  process.exit(1);
}
