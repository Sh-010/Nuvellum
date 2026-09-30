import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSnippet, injectAnalytics, validGa4Id } from '../scripts/lib/analytics.mjs';
import { imageMode, sourceHost, summarizeArticles } from '../scripts/lib/observability.mjs';

test('GA4 measurement IDs are validated before injection', () => {
  assert.equal(validGa4Id('G-ABC123XYZ'), 'G-ABC123XYZ');
  assert.equal(validGa4Id('bad-id'), '');
  assert.equal(analyticsSnippet('bad-id'), '');
});

test('analytics injection is idempotent and avoids query strings in explicit page fields', () => {
  const html = '<html><head><title>x</title></head><body></body></html>';
  const once = injectAnalytics(html, 'G-ABC123XYZ');
  const twice = injectAnalytics(once, 'G-ABC123XYZ');
  assert.match(once, /id="nuvellum-analytics"/);
  assert.match(once, /location\.origin \+ location\.pathname/);
  assert.equal(once, twice);
});

test('image modes distinguish real photos, AI art and intentional text-led stories', () => {
  assert.equal(imageMode({}), 'text-led');
  assert.equal(imageMode({ image:'/uploads/house/gaming.svg' }), 'text-led');
  assert.equal(imageMode({ image:'/uploads/articles/a.webp', imageKind:'photo' }), 'photo');
  assert.equal(imageMode({ image:'/generated/ai/a.svg' }), 'ai-illustration');
});

test('newsroom summary counts windows, sections, source hosts and visual modes', () => {
  const now = Date.parse('2026-09-28T20:00:00Z');
  const entries = [
    { slug:'a', data:{ status:'published', origin:'automation', publishedAt:'2026-09-28T19:00:00Z', section:'World', risk:'low', image:'/uploads/articles/a.webp', imageKind:'photo', sourceUrls:['https://www.reuters.com/a'] } },
    { slug:'b', data:{ status:'published', origin:'automation', publishedAt:'2026-09-24T19:00:00Z', section:'Gaming', risk:'sensitive', sourceUrls:['https://www.polygon.com/b'] } },
    { slug:'c', data:{ status:'published', origin:'human', date:'2026-09-01', section:'Opinion' } }
  ];
  const s = summarizeArticles(entries, now);
  assert.equal(s.publishedTotal, 3);
  assert.equal(s.automatedTotal, 2);
  assert.equal(s.published24h, 1);
  assert.equal(s.published7d, 2);
  assert.equal(s.sections.World, 1);
  assert.equal(s.sections.Gaming, 1);
  assert.equal(s.imageModes.photo, 1);
  assert.equal(s.imageModes['text-led'], 1);
  assert.equal(s.sourceHosts['reuters.com'], 1);
  assert.equal(sourceHost('https://www.polygon.com/a?x=1'), 'polygon.com');
});

test('GA4 is consent-first: nothing from Google loads until the reader allows it', async () => {
  const { analyticsSnippet, CONSENT_KEY } = await import('../scripts/lib/analytics.mjs');
  const s = analyticsSnippet('G-ABC123XYZ');
  assert.doesNotMatch(s, /<script[^>]+src=/, 'no gtag.js tag in the page itself');
  assert.match(s, /function start\(\)/);
  assert.match(s, /if \(IMPLIED \|\| choice === 'granted'\) start\(\)/);
  assert.match(s, /const IMPLIED = false/);
  assert.match(analyticsSnippet('G-ABC123XYZ', { consent: 'implied' }), /const IMPLIED = true/);
  assert.ok(s.includes(JSON.stringify(CONSENT_KEY)));
  assert.match(s, /send_page_view: false/, 'one page_view per page, sent explicitly');
  assert.match(s, /allow_google_signals: false/);
  assert.match(s, /window\.__nuvellumAnalytics/, 'a page can never initialise analytics twice');
});

test('GA4 page types cover every reader surface, and only utm tags survive in page_location', async () => {
  const { pageType, analyticsSnippet } = await import('../scripts/lib/analytics.mjs');
  const cases = { '/': 'home', '/index.html': 'home', '/article/a-story': 'article', '/section/world': 'section', '/latest': 'latest',
    '/world-explorer': 'world_explorer', '/world/europe': 'world', '/country/france': 'country', '/author/x': 'author', '/about': 'page' };
  for (const [p, t] of Object.entries(cases)) assert.equal(pageType(p), t, p);
  assert.equal(pageType('/nope', 'Page not found — Nuvellum'), 'not_found');
  const s = analyticsSnippet('G-ABC123XYZ');
  assert.match(s, /utm_\(source\|medium\|campaign\|term\|content\|id\)/);
  assert.doesNotMatch(s, /page_location: location\.href/, 'the full address (with its query) is never sent');
  // The in-page classifier is the same function the test exercises.
  assert.ok(s.includes(pageType.toString()));
});

test('the Brief sign-up reaches GA4 only as sign_up after the server confirms it, with no address', async () => {
  const { analyticsSnippet } = await import('../scripts/lib/analytics.mjs');
  const { readFileSync } = await import('node:fs');
  const s = analyticsSnippet('G-ABC123XYZ');
  assert.match(s, /addEventListener\('nuvellum:brief-signup'[^\n]*send\('sign_up', \{ method: 'nuvellum_brief'/);
  assert.doesNotMatch(s, /newsletter_interaction/, 'clicks in the form are not counted as sign-ups');
  const home = readFileSync('scripts/render-editorial-home.mjs', 'utf8');
  assert.match(home, /dispatchEvent\(new CustomEvent\('nuvellum:brief-signup',\{detail:\{source\}\}\)\)/, 'the shared form handler emits only after a successful response');
  assert.match(home, /wireBriefForm\(document\.getElementById\('signup'\),'home'\)/, 'the front-page form keeps the home attribution');
  assert.match(home, /wireBriefForm\(briefModalForm,'header'\)/, 'the masthead invitation is attributed separately');
});

test('analytics never reaches the admin desk or the Brief pages, and the CSP allows GA4 endpoints', async () => {
  const { EXCLUDED } = await import('../scripts/lib/analytics.mjs');
  const { readFileSync } = await import('node:fs');
  const skip = (p) => EXCLUDED.some((re) => re.test(p));
  assert.ok(skip('admin/index.html') && skip('admin\\index.html') && skip('brief/unsubscribe/index.html') && skip('brief\\unsubscribe\\index.html'));
  assert.ok(!skip('index.html') && !skip('article/x/index.html') && !skip('world-explorer/index.html') && !skip('latest/index.html'));
  const csp = JSON.parse(readFileSync('vercel.json', 'utf8')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  for (const host of ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com']) assert.ok(csp.includes(host), host);
});
