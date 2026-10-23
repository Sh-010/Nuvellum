import test from 'node:test';
import assert from 'node:assert/strict';
import { recentClosedPulls, remainingNow } from '../scripts/lib/publication-chain.mjs';

const NOW = Date.parse('2026-10-23T15:00:00Z');
const recent = { updated_at: '2026-10-23T14:55:00Z', merged_at: '2026-10-23T14:55:00Z', head: { ref: 'incoming/example' } };
const old = { updated_at: '2026-10-21T10:00:00Z', merged_at: null, head: { ref: 'incoming/stale' } };

test('pagination past 500 closed PRs still counts recent publications', async () => {
  const calls = [];
  const pulls = await recentClosedPulls(async page => {
    calls.push(page);
    if (page <= 5) return Array.from({ length: 100 }, (_, i) =>
      page === 1 && i === 0 ? recent : { ...recent, merged_at: null });
    return [recent, old];
  }, NOW);
  assert.deepEqual(calls, [1, 2, 3, 4, 5, 6]);
  assert.equal(pulls.length, 501);
  assert.equal(remainingNow(pulls, 72, NOW), 0); // Most recent merge is within the 12-minute gap.
});

test('stops at the first update older than the rolling day', async () => {
  const calls = [];
  const pulls = await recentClosedPulls(async page => {
    calls.push(page);
    return [recent, old];
  }, NOW);
  assert.equal(pulls.length, 1);
  assert.deepEqual(calls, [1]);
});

test('fails closed on missing timestamps or truncated pagination', async () => {
  await assert.rejects(() => recentClosedPulls(async () => [{ merged_at: null }], NOW), /updated_at/);
  await assert.rejects(() => recentClosedPulls(async () =>
    Array.from({ length: 100 }, () => recent), NOW, 2), /exceeds 200/);
});
