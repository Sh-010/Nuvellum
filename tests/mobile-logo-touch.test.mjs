import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../scripts/render-editorial-home.mjs', import.meta.url), 'utf8');

test('touch-capable devices get a wordmark reveal fallback beyond pointer media queries', () => {
  assert.match(renderer, /maxTouchPoints/);
  assert.match(renderer, /pointerType==='touch'/);
  assert.match(renderer, /firesTouchEvents===true/);
  assert.match(renderer, /visualViewport/);
  assert.match(renderer, /touchBrand\(e\)/);
  assert.match(renderer, /addEventListener\('pointerdown',revealBrand\)/);
  assert.match(renderer, /brandZone\?\.classList\.contains\('is-open'\)/);
});
