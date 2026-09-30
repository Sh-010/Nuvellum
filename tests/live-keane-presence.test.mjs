import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN='https://www.nuvellum.news';
const SLUG='roy-keane-and-wayne-rooney-clash-over-potential-man-city-title-strips';

test('production Roy Keane story presence', async () => {
  const article=await fetch(`${ORIGIN}/article/${SLUG}`,{headers:{'User-Agent':'Nuvellum-QA/1.0','Cache-Control':'no-cache'}});
  const home=await fetch(`${ORIGIN}/`,{headers:{'User-Agent':'Nuvellum-QA/1.0','Cache-Control':'no-cache'}});
  const sports=await fetch(`${ORIGIN}/section/sports`,{headers:{'User-Agent':'Nuvellum-QA/1.0','Cache-Control':'no-cache'}});
  const index=await fetch(`${ORIGIN}/search-index.json?qa=${Date.now()}`,{headers:{'User-Agent':'Nuvellum-QA/1.0','Cache-Control':'no-cache'}});
  const articleText=await article.text();
  const homeText=await home.text();
  const sportsText=await sports.text();
  const indexText=await index.text();
  let parsed=[]; try{parsed=JSON.parse(indexText)}catch{}
  const hit=Array.isArray(parsed)?parsed.find(x=>x.slug===SLUG):null;
  console.log('LIVE_PRESENCE',JSON.stringify({
    articleStatus:article.status,
    articleHasTitle:articleText.includes('Roy Keane and Wayne Rooney clash over potential Man City title strips'),
    homeStatus:home.status,
    homeHasSlug:homeText.includes(SLUG),
    sportsStatus:sports.status,
    sportsHasSlug:sportsText.includes(SLUG),
    indexStatus:index.status,
    indexHit:hit && {slug:hit.slug,status:hit.status,section:hit.section,publishedAt:hit.publishedAt,title:hit.title}
  }));
  assert.equal(article.status,200);
});
