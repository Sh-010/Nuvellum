import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSvg } from '../scripts/lib/svg-safety.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const wrap = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${inner}</svg>`;

test('accepts real AI editorial SVGs produced by the newsroom', () => {
  const dir = join(here, 'fixtures', 'svg');
  const files = readdirSync(dir).filter(f => f.startsWith('real-'));
  assert.ok(files.length >= 2);
  for (const f of files) assert.deepEqual(validateSvg(readFileSync(join(dir, f), 'utf8'), f), [], f);
});

test('accepts the existing section artwork and favicon', () => {
  for (const f of readdirSync(join(root, 'public', 'images')).filter(f => f.endsWith('.svg'))) {
    assert.deepEqual(validateSvg(readFileSync(join(root, 'public', 'images', f), 'utf8'), f), [], f);
  }
  assert.deepEqual(validateSvg(readFileSync(join(root, 'public', 'favicon.svg'), 'utf8')), []);
});

test('accepts gradients, filters, local url(#id) and local <use href="#id">', () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" role="img">
  <title>ok &amp; fine</title>
  <defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient>
  <filter id="f"><feTurbulence baseFrequency=".7"/><feColorMatrix type="saturate" values="0"/></filter>
  <symbol id="s"><circle r="4"/></symbol></defs>
  <style>.a{fill:url(#g)}</style>
  <rect width="100" height="100" fill="url(#g)" filter="url('#f')" style="opacity:.5"/>
  <use href="#s"/><use xlink:href="#s"/>
</svg>`;
  assert.deepEqual(validateSvg(svg), []);
});

const bad = {
  'script element': wrap('<script>alert(1)</script>'),
  'script with CDATA': wrap('<script><![CDATA[alert(1)]]></script>'),
  'onload on root': wrap('<rect/>', ' onload="alert(1)"'),
  'onclick uppercase': wrap('<rect ONCLICK="alert(1)"/>'),
  'namespaced event attr': wrap('<rect ev:onclick="x"/>'),
  'foreignObject': wrap('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'),
  'anchor javascript href': wrap('<a href="javascript:alert(1)"><rect/></a>'),
  'javascript href on use': wrap('<use href="javascript:alert(1)"/>'),
  'entity-encoded javascript': wrap('<use href="&#106;avascript:alert(1)"/>'),
  'external use': wrap('<use href="https://evil.example/x.svg#a"/>'),
  'external xlink image': wrap('<image xlink:href="https://evil.example/a.png"/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"'),
  'data URL image': wrap('<image href="data:image/svg+xml;base64,AAAA"/>'),
  'feImage external': wrap('<filter id="f"><feImage href="https://evil.example/a.png"/></filter>'),
  'external CSS url in attr': wrap('<rect fill="url(https://evil.example/p.svg#x)"/>'),
  'external CSS url in style attr': wrap('<rect style="fill:url(//evil.example/a)"/>'),
  'style @import': wrap('<style>@import url("https://evil.example/a.css");</style>'),
  'style external url': wrap('<style>.a{background:url(http://evil.example/a.png)}</style>'),
  'css expression': wrap('<rect style="width:expression(alert(1))"/>'),
  'animate set href': wrap('<a><set attributeName="href" to="javascript:alert(1)"/></a>'),
  'animate element': wrap('<animate attributeName="x" values="0;1"/>'),
  'iframe': wrap('<iframe src="https://evil.example"/>'),
  'embed': wrap('<embed src="x"/>'),
  'object': wrap('<object data="x"/>'),
  'doctype with entity': '<!DOCTYPE svg [<!ENTITY x "y">]>' + wrap('<rect/>'),
  'xml-stylesheet PI': '<?xml-stylesheet href="https://evil.example/a.css"?>' + wrap('<rect/>'),
  'non-svg root': '<html><body>hi</body></html>',
  'two roots': wrap('<rect/>') + wrap('<rect/>'),
  'unclosed element': '<svg xmlns="http://www.w3.org/2000/svg"><g>',
  'unquoted attribute': wrap('<rect width=10 onload=alert(1)/>'),
  'foreign namespace': wrap('<rect/>', ' xmlns:h="http://www.w3.org/1999/xhtml"'),
  'markup in style': wrap('<style></style><style><script>x</script></style>'),
  'empty file': '',
  'oversized': wrap('<rect/>'.repeat(80000))
};

for (const [name, svg] of Object.entries(bad)) {
  test(`rejects ${name}`, () => {
    assert.ok(validateSvg(svg).length > 0, `expected rejection for ${name}`);
  });
}
