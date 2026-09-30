import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const ORIGIN = 'https://www.nuvellum.news';
const KEANE = 'Roy Keane and Wayne Rooney clash over potential Man City title strips';

async function scrollWholePage(page) {
  await page.evaluate(async () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(500, innerHeight * 0.7)) {
      scrollTo(0, y);
      await delay(35);
    }
    scrollTo(0, 0);
  });
}

async function assertNoBrokenVisibleImages(page, label) {
  const broken = await page.evaluate(() => [...document.images]
    .filter(img => {
      const r = img.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && getComputedStyle(img).display !== 'none';
      return visible && img.complete && img.naturalWidth === 0;
    })
    .map(img => ({ src: img.currentSrc || img.src, alt: img.alt })));
  assert.deepEqual(broken, [], label + ' has broken visible images: ' + JSON.stringify(broken));
}

async function assertNoHorizontalOverflow(page, label, allowance = 3) {
  const dims = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  assert.ok(dims.scroll <= dims.client + allowance, label + ' horizontal overflow: ' + JSON.stringify(dims));
}

test('production desktop interactions, saved stories, search, Brief modal and theme all work', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err.message || err)));

  const res = await page.goto(ORIGIN + '/', { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(res?.status(), 200);
  await page.evaluate(() => {
    localStorage.removeItem('nuvellum-saved-v2');
    localStorage.removeItem('nuvellum-theme');
  });
  await page.reload({ waitUntil: 'networkidle' });

  assert.match(await page.title(), /Nuvellum/i);
  await page.locator('#latestList').waitFor();
  await assertNoHorizontalOverflow(page, 'desktop home');

  await scrollWholePage(page);
  await assertNoBrokenVisibleImages(page, 'desktop home');

  await page.locator('[data-latest-tab="sports"]').click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('#latestList').innerText(), /Roy Keane and Wayne Rooney/i);
  assert.equal(await page.locator('[data-latest-tab="sports"]').getAttribute('aria-selected'), 'true');

  const save = page.locator('#latestList [data-save]').first();
  await save.waitFor();
  const savedTitle = await save.getAttribute('data-save');
  assert.ok(savedTitle);
  await save.click();
  assert.equal(await save.getAttribute('aria-pressed'), 'true');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvellum-saved-v2') || '[]'));
  assert.ok(stored.some(x => x && x.title === savedTitle), 'save did not persist to localStorage');

  await page.goto(ORIGIN + '/saved', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#savedList').waitFor();
  assert.ok((await page.locator('body').innerText()).includes(savedTitle), 'saved page did not show saved story');
  await assertNoHorizontalOverflow(page, 'desktop saved');

  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#searchOpen').click();
  await page.locator('#searchInput').fill('Roy Keane');
  await page.waitForFunction(title => document.querySelector('#searchResults')?.textContent?.includes(title), KEANE);
  assert.match(await page.locator('#searchResults').innerText(), /Roy Keane and Wayne Rooney/i);

  await page.keyboard.press('Escape');
  await page.locator('[data-brief-open]').first().click();
  assert.equal(await page.locator('#briefInvitation').getAttribute('hidden'), null);
  await page.keyboard.press('Escape');
  assert.notEqual(await page.locator('#briefInvitation').getAttribute('hidden'), null);

  await page.locator('#themeToggle').click();
  await page.waitForFunction(() => document.body.classList.contains('night'));
  assert.equal(await page.locator('#themeToggle').getAttribute('aria-pressed'), 'true');
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.locator('body').evaluate(el => el.classList.contains('night')), 'night theme did not persist across reload');

  assert.deepEqual(pageErrors, [], 'desktop page errors: ' + pageErrors.join(' | '));
  console.log('BROWSER_DESKTOP_OK', JSON.stringify({ savedTitle, sportsStory: KEANE }));
  await browser.close();
});

test('production mobile layout and touch logo behavior are healthy', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err.message || err)));

  const res = await page.goto(ORIGIN + '/', { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(res?.status(), 200);
  await assertNoHorizontalOverflow(page, 'mobile home', 4);
  await scrollWholePage(page);
  await assertNoBrokenVisibleImages(page, 'mobile home');

  const monogram = page.locator('#brandMonogram');
  await monogram.waitFor();
  await monogram.tap();
  assert.ok(await page.locator('#brandZone').evaluate(el => el.classList.contains('is-open')), 'mobile logo did not reveal the wordmark');

  await page.locator('[data-latest-tab="sports"]').click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('#latestList').innerText(), /Roy Keane and Wayne Rooney/i);

  await page.goto(ORIGIN + '/article/roy-keane-and-wayne-rooney-clash-over-potential-man-city-title-strips', { waitUntil: 'networkidle', timeout: 30000 });
  await assertNoHorizontalOverflow(page, 'mobile article', 4);
  await scrollWholePage(page);
  await assertNoBrokenVisibleImages(page, 'mobile article');

  assert.deepEqual(pageErrors, [], 'mobile page errors: ' + pageErrors.join(' | '));
  console.log('BROWSER_MOBILE_OK');
  await browser.close();
});

test('production World Explorer initialises WebGL and country search selects a country', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err.message || err)));

  const res = await page.goto(ORIGIN + '/world-explorer?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(res?.status(), 200);
  await page.waitForFunction(() => window.__worldExplorerQA?.ready === true, null, { timeout: 30000 });
  assert.ok(await page.locator('.explorer-shell').evaluate(el => el.classList.contains('is-ready')));
  assert.ok(await page.locator('#globeFallback').isHidden(), 'World Explorer fell back instead of rendering 3D');

  const stats = await page.evaluate(() => window.__worldExplorerQA?.stats);
  assert.ok(stats && stats.countryCount > 150, 'unexpected atlas stats: ' + JSON.stringify(stats));

  await page.locator('#countrySearch').fill('Switzerland');
  await page.locator('#countryGo').click();
  await page.waitForFunction(() => /Switzerland/i.test(document.querySelector('#countryPanel')?.textContent || ''), null, { timeout: 5000 });
  assert.match(await page.locator('#countryPanel').innerText(), /Switzerland/i);
  await assertNoHorizontalOverflow(page, 'World Explorer desktop', 4);

  const serious = errors.filter(x => /World Explorer failed|TypeError|ReferenceError|SyntaxError/i.test(x));
  assert.deepEqual(serious, [], 'World Explorer console errors: ' + serious.join(' | '));
  console.log('WORLD_EXPLORER_BROWSER_OK', JSON.stringify(stats));
  await browser.close();
});
