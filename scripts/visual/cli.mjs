#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { buildVisualBrief } from './core.mjs';
import { searchWikimedia } from './wikimedia.mjs';

function parseValue(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('[') && v.endsWith(']')) { try { return JSON.parse(v); } catch {} }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1,-1);
  return v;
}

function readArticle(path) {
  const src = readFileSync(path, 'utf8');
  if (!src.startsWith('---')) throw new Error('article is missing frontmatter');
  const end = src.indexOf('\n---', 3);
  if (end < 0) throw new Error('article frontmatter is not closed');
  const data = {};
  for (const line of src.slice(3, end).trim().split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2]);
  }
  data.slug = basename(path).replace(/\.md$/i, '');
  return data;
}

const [command = 'brief', path] = process.argv.slice(2);
if (!path) {
  console.error('Usage: node scripts/visual/cli.mjs <brief|wikimedia> src/content/articles/<slug>.md');
  process.exit(2);
}

const article = readArticle(path);
const brief = buildVisualBrief(article);

if (command === 'brief') {
  console.log(JSON.stringify(brief, null, 2));
} else if (command === 'wikimedia') {
  const results = await searchWikimedia(brief.photoQuery);
  console.log(JSON.stringify({ brief, results }, null, 2));
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
