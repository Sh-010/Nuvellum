import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const injector = readFileSync(new URL('../scripts/inject-home-content.mjs', import.meta.url), 'utf8');

test('production story cards navigate to their data-route instead of opening the legacy drawer', () => {
  assert.match(home, /const url=el\.dataset\.route;/);
  assert.match(home, /if\(url\)\{goWithCurtain\(url\);return\}/);
  assert.match(home, /target\.closest\('a,button,input,form,\.bookmark,\.save-btn'\)/);
});

test('smooth article navigation covers production article routes', () => {
  assert.ok(home.includes(`qsa('a[href="article.html"],a[href^="/article/"]').forEach(a=>{`));
});

test('injected Screen & Play production cards are labelled as article links', () => {
  assert.match(injector, /<span class="quick-chip">Open story<\/span>/);
  assert.match(injector, /data-route="\$\{route\(a\)\}"/);
});
