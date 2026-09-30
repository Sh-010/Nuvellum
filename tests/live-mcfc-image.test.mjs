import test from 'node:test';
import assert from 'node:assert/strict';

const URL = 'https://www.nuvellum.news/uploads/articles/roy-keane-and-wayne-rooney-clash-over-potential-man-city-title-strips.jpg';

test('production MCFC image is a readable JPEG', async () => {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Nuvellum-QA/1.0', 'Cache-Control': 'no-cache' } });
  const type = res.headers.get('content-type') || '';
  const buf = new Uint8Array(await res.arrayBuffer());
  console.log(JSON.stringify({
    status: res.status,
    type,
    length: buf.length,
    prefix: Array.from(buf.slice(0, 12)),
    suffix: Array.from(buf.slice(-4))
  }));
  assert.equal(res.status, 200);
  assert.match(type, /^image\/jpeg/i);
  assert.ok(buf.length > 10000);
  assert.deepEqual(Array.from(buf.slice(0, 3)), [0xff, 0xd8, 0xff]);
  assert.deepEqual(Array.from(buf.slice(-2)), [0xff, 0xd9]);
});
