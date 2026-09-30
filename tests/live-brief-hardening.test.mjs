import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN = 'https://www.nuvellum.news';
const EMAIL = 'nuvellum-hardening-20260930@example.com';

test('live hardened Brief QA signup succeeds', async () => {
  const res = await fetch(`${ORIGIN}/api/brief?action=subscribe`, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'User-Agent': 'Nuvellum-QA/1.0'
    },
    body: JSON.stringify({
      email: EMAIL,
      consent: true,
      website: '',
      elapsedMs: 9000,
      source: 'qa-hardening-live'
    })
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true, JSON.stringify(body));
});
