import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const ORIGIN='https://www.nuvellum.news';

test('production mobile first tap reveals Nuvellum wordmark without navigating', {timeout:60000}, async (t)=>{
  const browser=await chromium.launch({headless:true});
  t.after(async()=>{await browser.close().catch(()=>{})});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();
  await page.addInitScript(()=>localStorage.setItem('nuvellum-analytics-consent','denied'));
  await page.goto(ORIGIN+'/?qa=mobile-wordmark-2',{waitUntil:'networkidle',timeout:30000});
  const zone=page.locator('#brandZone');
  const mono=page.locator('#brandMonogram');
  const before=page.url();
  await mono.tap();
  await page.waitForTimeout(350);
  assert.ok(await zone.evaluate(el=>el.classList.contains('is-open')),'first tap did not persistently reveal wordmark');
  assert.equal(new URL(page.url()).pathname,new URL(before).pathname,'first tap navigated away');
  assert.ok(await page.locator('#brandExpanded').isVisible(),'expanded wordmark is not visible after first tap');
});

test('production World Explorer remains interactive', {timeout:90000}, async (t)=>{
  const browser=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  t.after(async()=>{await browser.close().catch(()=>{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  await page.addInitScript(()=>localStorage.setItem('nuvellum-analytics-consent','denied'));
  await page.goto(ORIGIN+'/world-explorer?qa=final2',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__worldExplorerQA?.ready===true,null,{timeout:30000});
  await page.locator('#countrySearch').fill('Switzerland');
  await page.locator('#countryGo').click();
  await page.waitForFunction(()=>/Switzerland/i.test(document.querySelector('#countryPanel')?.textContent||''),null,{timeout:5000});
  assert.match(await page.locator('#countryPanel').innerText(),/Switzerland/i);
});
