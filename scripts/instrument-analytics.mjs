import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectAnalytics, validGa4Id, EXCLUDED } from './lib/analytics.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const measurementId = validGa4Id(process.env.NUVELLUM_GA4_ID);
const consent = process.env.NUVELLUM_ANALYTICS_CONSENT === 'implied' ? 'implied' : 'required';

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

// The private admin page and the Brief's unsubscribe page (signed link in its address) never load analytics.
const files = walk(root).filter((f) => !EXCLUDED.some((re) => re.test(relative(root, f))));
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = injectAnalytics(before, measurementId, { consent });
  if (after !== before) writeFileSync(file, after);
}

console.log(`Reader analytics instrumented in ${files.length} HTML files (${measurementId}, consent ${consent}).`);
