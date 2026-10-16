import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSnippet } from '../scripts/lib/analytics.mjs';

test('related recommendation clicks are measurable without changing consent', () => {
  const html = analyticsSnippet('G-TEST123', { consent: 'required' });
  assert.match(html, /if \(el\.closest\('section\.continue'\)\) send\('related_story_click'/);
  assert.match(html, /send\('article_click'/);
  assert.match(html, /destination_path: url\.pathname, page_path: location\.pathname/);
  assert.match(html, /choice === 'granted'/);
  assert.match(html, /analytics_storage: 'granted'/);
  assert.match(html, /No thanks/);
  assert.ok(html.indexOf("send('related_story_click'") > html.indexOf("send('article_click'"));
});

test('analytics still does not run without a valid GA4 measurement ID', () => {
  assert.equal(analyticsSnippet(''), '');
  assert.equal(analyticsSnippet('not-an-id'), '');
});
