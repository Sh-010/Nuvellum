import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = JSON.parse(readFileSync(join(root, 'n8n', 'workflows', 'nuvellum-newsroom.json'), 'utf8'));

const node = (name) => {
  const found = workflow.nodes.find(n => n.name === name);
  assert.ok(found, `missing n8n node: ${name}`);
  return found;
};

test('canonical newsroom stays inactive during stabilization', () => {
  assert.equal(workflow.active, false);
});

test('draft contract explicitly requests regions and countries', () => {
  const prompt = node('Gemini Draft Article').parameters.messages.values[0].content;
  assert.match(prompt, /"regions":\[/);
  assert.match(prompt, /"countries":\[/);
  assert.match(prompt, /middle-east-north-africa/);
  assert.match(prompt, /Use \[\] when geography is not material/);
});

test('draft parser fails closed on missing geography and writes frontmatter arrays', () => {
  const code = node('Parse Draft & Build Markdown').parameters.jsCode;
  assert.match(code, /Draft is missing regions array/);
  assert.match(code, /Draft is missing countries array/);
  assert.match(code, /`regions: \$\{JSON\.stringify\(regions\)\}`/);
  assert.match(code, /`countries: \$\{JSON\.stringify\(countries\)\}`/);
  assert.match(code, /regions,countries,image/);
});

test('final GitHub payload gate re-checks geography before commit', () => {
  const code = node('Build GitHub Payload').parameters.jsCode;
  assert.match(code, /regions frontmatter does not match article metadata/);
  assert.match(code, /countries frontmatter does not match article metadata/);
  assert.match(code, /allowedRegions=new Set/);
});
