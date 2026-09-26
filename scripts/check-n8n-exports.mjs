// CI guard: committed n8n exports must contain no secrets, credential ids
// or pinned execution data. Runs as part of `npm run validate`.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './lib/paths.mjs';
import { findSecrets } from './lib/n8n-safety.mjs';

const dir = join(root, 'n8n');
const files = [];
(function walk(d) {
  if (!existsSync(d)) return;
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.json')) files.push(p);
  }
})(dir);

const problems = [];
for (const file of files) {
  const rel = relative(root, file);
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch (err) { problems.push(`${rel}: invalid JSON (${err.message})`); continue; }
  for (const f of findSecrets(data)) problems.push(`${rel}: ${f}`);
}

if (problems.length) {
  console.error('\nn8n export check failed (run scripts/sanitize-n8n-export.mjs and rotate any exposed secret):\n');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log(`n8n export check passed (${files.length} file(s)).`);
