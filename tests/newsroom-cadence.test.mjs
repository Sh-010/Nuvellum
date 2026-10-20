import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DAILY_CAP, HOURLY_CAP, MIN_GAP_MINUTES, dailyCap,
  publishedInLastHour, remainingNow
} from '../scripts/lib/publication-chain.mjs';

const NOW = Date.parse('2026-10-20T16:00:00Z');
function recent(minutesAgo) {
  return { head: { ref: 'incoming/editorial-story-abc12345' }, merged_at: new Date(NOW - minutesAgo * 60_000).toISOString() };
}

test('15-minute newsroom schedule uses one story per cadence slot and safe daily cap', () => {
  assert.equal(DEFAULT_DAILY_CAP, 72);
  assert.equal(HOURLY_CAP, 1);
  assert.equal(MIN_GAP_MINUTES, 12);
  assert.equal(dailyCap(''), 72);
  assert.equal(dailyCap('24'), 24);
  assert.equal(dailyCap('100'), 72, 'configured cap cannot exceed free-hosting safety limit');
  assert.equal(dailyCap('0'), 0, 'allow an emergency zero cap');
});

test('automated merge blocked during 12-minute gap, then allowed', () => {
  assert.equal(publishedInLastHour([recent(11)], NOW), 1);
  assert.equal(remainingNow([recent(11)], 72, NOW), 0);
  assert.equal(publishedInLastHour([recent(13)], NOW), 0);
  assert.equal(remainingNow([recent(13)], 72, NOW), 1);
});

test('rolling daily cap blocks a 73rd publication regardless of time gap', () => {
  const publications = Array.from({ length: 72 }, (_, i) => recent(15 + i * 15));
  assert.equal(remainingNow(publications, 72, NOW), 0);
  assert.equal(remainingNow(publications.slice(0, 71), 72, NOW), 1);
});

test('irrelevant closed PRs and old publications do not count', () => {
  const old = recent(25 * 60);
  const ordinary = { head: { ref: 'fix/typo' }, merged_at: new Date(NOW - 2 * 60_000).toISOString() };
  assert.equal(remainingNow([old, ordinary], 72, NOW), 1);
});
