import test from 'node:test';
import assert from 'node:assert/strict';
import { createOgHandler } from '../api/og.js';

const req = (slug, method = 'GET') => new Request(`https://www.nuvellum.news/api/og?slug=${encodeURIComponent(slug)}`, { method });
test('OG image serves an existing 1200x630 branded PNG over same-origin API', async () => {
  let upstream = '';
  const payload = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
  const h = createOgHandler({ fetchImpl: async url => {
    upstream = url;
    return new Response(payload, { headers: { 'content-type': 'image/png' } });
  }});
  const r = await h(req('horror-is-big-business'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(upstream, 'https://raw.githubusercontent.com/Sh-010/Nuvellum/social-assets/cards/horror-is-big-business/landscape.png');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), payload);
});
test('missing or unavailable cards redirect to site PNG icon instead of returning broken OG image', async () => {
  for (const fetchImpl of [
    async () => new Response('not found', { status: 404 }),
    async () => { throw new Error('temporary upstream failure'); }
  ]) {
    const r = await createOgHandler({ fetchImpl })(req('uncarded-story'));
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://www.nuvellum.news/icons/nuvellum-512.png');
  }
});
test('OG endpoint rejects invalid slugs and state-changing methods', async () => {
  assert.equal((await createOgHandler()(req('../secret'))).status, 400);
  assert.equal((await createOgHandler()(req('valid-slug', 'POST'))).status, 405);
});
