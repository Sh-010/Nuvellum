// The homepage served in production is the checksum-locked v5.1 archive with the
// bridges from scripts/lib/v51-bridge.mjs applied at build time. These tests run
// those bridges on the real archive, so they check what actually ships.
// (PR #46 edited public/index.html, which the build overwrites, so its fix never deployed.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { productionizeHome } from '../scripts/lib/v51-bridge.mjs';

const zip = new AdmZip(fileURLToPath(new URL('../assets/nuvellum-v5.zip', import.meta.url)));
const baseline = zip.readAsText('index.html');
const built = productionizeHome(baseline);
const injector = readFileSync(new URL('../scripts/inject-home-content.mjs', import.meta.url), 'utf8');

test('tracked public/index.html and article.html are the untouched v5.1 archive copies', () => {
  // The build replaces these files with the archive. Editing them has no effect in production:
  // change scripts/lib/v51-bridge.mjs instead.
  for (const f of ['index.html', 'article.html']) {
    const tracked = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.equal(tracked, zip.readAsText(f), `public/${f} differs from assets/nuvellum-v5.zip; edit scripts/lib/v51-bridge.mjs instead`);
  }
});

test('routed story cards open their article on click, Enter and Space; demo cards keep the drawer', () => {
  assert.ok(built.includes("const activate=()=>{const url=el.dataset.route;if(url){goWithCurtain(url);return}openDrawer(storyDataFrom(el))};"));
  assert.ok(built.includes("el.addEventListener('click',e=>{if(shouldOpenPreview(e.target))activate()});"));
  assert.ok(built.includes("e.preventDefault();activate()}});"));
  assert.ok(!built.includes('openDrawer(storyDataFrom(el))});'), 'the unpatched drawer-only handler must not ship');
});

test('real anchors never also open the preview drawer', () => {
  assert.ok(built.includes("return !target.closest('a[href],button,input,form,.bookmark,.save-btn');"));
});

test('smooth curtain navigation covers /article/ routes', () => {
  assert.ok(built.includes(`qsa('a[href="article.html"],a[href^="/article/"]').forEach(a=>{`));
});

test('saved stories link to real articles, escape stored text and re-render once routes load', () => {
  assert.ok(built.includes('window.nuvellumRouteFor?window.nuvellumRouteFor(x.title)'));
  assert.ok(built.includes('${e(x.title)}') && built.includes('${e(x.cat)}'), 'stored titles must be escaped');
  assert.ok(built.includes("window.nuvellumRouteFor=t=>routes[(t||'').trim()]||'/latest';"));
  assert.match(built, /rerenderSaved\(\);/);
});

test('section toggles expose aria-expanded and an accessible name', () => {
  assert.ok(built.includes("btn.setAttribute('aria-expanded',String(!collapsed))"));
  assert.ok(built.includes("section.classList.contains('is-collapsed')"));
  assert.ok(built.includes("btn.setAttribute('aria-label',(collapsed?'Show ':'Hide ')+name)"));
});

test('bridge patches fail the build if the baseline changes instead of silently not applying', () => {
  const drifted = baseline.replace('openDrawer(storyDataFrom(el))});', 'openDrawer(storyDataFrom(el)) });');
  assert.throws(() => productionizeHome(drifted), /bridge patch "story card activation" expected exactly 1 match, found 0/);
});

test('v5.1 markup and CSS are unchanged by the bridge (only scripts, head metadata and link targets differ)', () => {
  const styles = (h) => (h.match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
  const body = (h) => h.slice(h.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/href="[^"]*"/g, 'href=""')
    .replace(/<a href="" data-info="[a-z]+">/g, '<a href="">').replace(/\s+/g, ' ');
  assert.equal(styles(built), styles(baseline), 'CSS must be identical to v5.1');
  assert.equal(body(built), body(baseline), 'body markup must be identical to v5.1 apart from link destinations and scripts');
});

test('injected Screen & Play production cards are labelled as article links', () => {
  assert.match(injector, /<span class="quick-chip">Open story<\/span>/);
  assert.match(injector, /data-route="\$\{route\(a\)\}"/);
});
