#!/usr/bin/env node
// Regenerates engines/cards/newsreader-metrics.json: per-character advance widths (per 1000 em) of the site's
// Newsreader font (public/fonts, OFL) at the weights and styles the cards use, measured in Chromium so the
// headline fitter in fit.mjs predicts what the rasteriser will draw. Run after changing the font files:
//   node engines/cards/measure-font.mjs
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';

const FACES = { 'normal-400': ['normal', 400], 'normal-600': ['normal', 600], 'normal-700': ['normal', 700], 'italic-400': ['italic', 400] };
const codes = [];
for (let c = 32; c <= 126; c++) codes.push(c);
for (let c = 160; c <= 383; c++) codes.push(c);
for (const ch of '‘’“”–—…•·€£™✦') codes.push(ch.codePointAt(0));

const font = (f) => `data:font/woff2;base64,${readFileSync(join(REPO_ROOT, 'public', 'fonts', f)).toString('base64')}`;
const css = ['normal', 'italic'].map((style) => ['latin', 'latin-ext'].map((r) =>
  `@font-face{font-family:'NV';font-style:${style};font-weight:300 700;src:url(${font(`newsreader-${style}-${r}.woff2`)}) format('woff2')}`).join('')).join('');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage();
await p.setContent(`<style>${css}</style><body>x</body>`);
const out = await p.evaluate(async ({ FACES, codes }) => {
  const c = document.createElement('canvas').getContext('2d');
  const res = {};
  for (const [key, [style, weight]] of Object.entries(FACES)) {
    await document.fonts.load(`${style} ${weight} 100px NV`, 'AaĀā');
    c.font = `${style} ${weight} 1000px NV`;
    res[key] = Object.fromEntries(codes.map((code) => [code, Math.round(c.measureText(String.fromCodePoint(code)).width)]));
    res[key].fallback = Math.round(c.measureText('n').width * 1.15);
  }
  return res;
}, { FACES, codes });
await b.close();
writeFileSync(join(REPO_ROOT, 'engines', 'cards', 'newsreader-metrics.json'), JSON.stringify({ font: 'Newsreader (public/fonts, OFL)', unitsPerEm: 1000, faces: out }) + '\n');
console.log('newsreader-metrics.json written:', Object.keys(out).join(', '), codes.length, 'code points each');
