import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectAnalytics, validGa4Id } from './lib/analytics.mjs';

const dist = new URL('../dist/', import.meta.url);
const root = dist.pathname;
const measurementId = validGa4Id(process.env.NUVELLUM_GA4_ID);

if (!measurementId) {
  console.log('Reader analytics disabled: NUVELLUM_GA4_ID is not configured.');
  process.exit(0);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

// The private admin page never loads third-party scripts.
const files = walk(root).filter((f) => !/[\\/]admin[\\/]index\.html$/.test(f));
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = injectAnalytics(before, measurementId);
  if (after !== before) writeFileSync(file, after);
}

console.log(`Reader analytics instrumented in ${files.length} HTML files (${measurementId}).`);
