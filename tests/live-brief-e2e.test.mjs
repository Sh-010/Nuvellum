import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN = 'https://www.nuvellum.news';
const EMAIL = 'nuvellum-e2e-20260930-1030@example.com';

test('live Nuvellum Brief resubscribe reactivates the reader', async () => {
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
      source: 'qa-live-e2e-resubscribe'
    })
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.match(String(body.message || ''), /Nuvellum Brief/i);
});
