import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN='https://www.nuvellum.news';
const SLUG='roy-keane-and-wayne-rooney-clash-over-potential-man-city-title-strips';

test('production Sports filter includes the Keane/Rooney story and cache-busted image', async () => {
  const res=await fetch(`${ORIGIN}/`,{headers:{'User-Agent':'Nuvellum-QA/1.0','Cache-Control':'no-cache'}});
  const html=await res.text();
  const m=html.match(/<template data-latest-set="sports">([\s\S]*?)<\/template>/);
  const sports=m?.[1]||'';
  const imageUrl=`/uploads/articles/${SLUG}.jpg?v=20260930-1`;
  console.log('LIVE_SPORTS_FILTER',JSON.stringify({
    status:res.status,
    templateFound:Boolean(m),
    sportsHasSlug:sports.includes(SLUG),
    sportsHasImage:sports.includes(imageUrl),
    homepageHasCacheBustedImage:html.includes(imageUrl)
  }));
  assert.equal(res.status,200);
  assert.ok(m,'Sports template missing');
  assert.ok(sports.includes(SLUG),'Keane/Rooney story missing from Sports filter');
  assert.ok(html.includes(imageUrl),'cache-busted MCFC image URL missing from production homepage');
});
