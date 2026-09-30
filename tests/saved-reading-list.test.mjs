import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the bookmark control opens the saved reading list, never Latest', () => {
  const shell=readFileSync('src/components/InteriorShell.astro','utf8');
  const home=readFileSync('scripts/render-editorial-home.mjs','utf8');
  assert.match(shell, /id="savedOpen" href="\/saved"/);
  assert.doesNotMatch(shell, /id="savedOpen" href="\/latest"/);
  assert.match(home, /savedOpen'\)\?\.addEventListener\('click',\(\)=>\{location\.href='\/saved'\}\)/);
  assert.doesNotMatch(home, /savedOpen'\)\?\.addEventListener\('click',\(\)=>\{location\.href='\/latest'\}\)/);
});

test('the saved page reads the existing browser reading-list key and can remove entries', () => {
  const page=readFileSync('src/pages/saved.astro','utf8');
  assert.match(page, /nuvellum-saved-v2/);
  assert.match(page, /localStorage\.getItem\(key\)/);
  assert.match(page, /localStorage\.setItem\(key/);
  assert.match(page, /className='saved-remove'/);
  assert.match(page, /noindex=\{true\}/);
});
