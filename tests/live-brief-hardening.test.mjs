import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN = 'https://www.nuvellum.news';
const UNSUBSCRIBE_URL = 'https://www.nuvellum.news/brief/unsubscribe?s=r0694ELtjii3amgB6ivL1Inq_d10evvv&t=vfNw21OCKRajv5E6uDTzVOOtbgpqVFbPKZeShf1CP4Y';

test('live hardened Brief QA unsubscribe succeeds', async () => {
  const u = new URL(UNSUBSCRIBE_URL);
  const res = await fetch(`${ORIGIN}/api/brief?action=unsubscribe&s=${encodeURIComponent(u.searchParams.get('s'))}&t=${encodeURIComponent(u.searchParams.get('t'))}`, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'User-Agent': 'Nuvellum-QA/1.0'
    },
    body: JSON.stringify({ s: u.searchParams.get('s'), t: u.searchParams.get('t') })
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.match(String(body.message || ''), /unsubscribed/i);
});
