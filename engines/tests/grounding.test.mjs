import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGrounding } from '../shared/grounding.mjs';
import { loadStory } from '../shared/article.mjs';

const iran = loadStory('iran-proposes-seven-day-deal-to-reopen-strait-of-hormuz');

test('grounded copy passes', () => {
  const r = checkGrounding('Iran says the Strait of Hormuz could reopen within seven days if Washington accepts its terms.', iran.text);
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('invented numbers, names and quotes are rejected', () => {
  assert.match(checkGrounding('Iran says the strait could reopen within 3 days.', iran.text).problems.join(), /number "3"/);
  assert.match(checkGrounding('Iran says Saudi Arabia will mediate.', iran.text).problems.join(), /Saudi/);
  assert.match(checkGrounding('Araghchi said “we will never surrender”.', iran.text).problems.join(), /quotation/);
});

test('verbatim quotes and number words present in the article pass', () => {
  const r = checkGrounding('Shipping fell to about 18 transits per day, Kpler data showed.', iran.text);
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('sensational and persuasive phrasing is rejected even when facts are right', () => {
  assert.equal(checkGrounding('This changes everything: Iran says the strait could reopen.', iran.text).ok, false);
  assert.equal(checkGrounding('SHOCKING: Iran proposal.', iran.text).ok, false);
  assert.equal(checkGrounding('Vote for peace: Iran says the strait could reopen.', iran.text).ok, false);
});
